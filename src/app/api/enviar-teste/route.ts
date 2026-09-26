import { NextRequest, NextResponse } from 'next/server';
import { montarEvento, validar, enviarParaMeta, type EventInput } from '@/lib/meta-capi';
import { listarMarcas } from '@/lib/config-store';
import { empresaParaEscrita } from '@/lib/empresa-ativa';
import { exigirSessao } from '@/lib/sessao';
import { normalizarTelefone } from '@/lib/telefone';
import { EVENTOS_DE_TESTE, ehCodigoDeTeste, ehEventoDeTeste } from '@/lib/dados-de-teste';

/**
 * O mesmo tratamento de telefone do `/api/enviar`: com o DDI automático (o
 * padrão), o número sai em E.164 com o país descoberto pelo próprio número,
 * pela URL e pela moeda.
 */
function comTelefoneNormalizado(ev: EventInput): EventInput {
  const u = ev.user;
  if (!u?.phone || u.addDDI === false) return ev;
  const phone = normalizarTelefone(u.phone, { url: ev.event_source_url, moeda: ev.custom?.currency });
  return { ...ev, user: { ...u, phone, addDDI: false } };
}

const erro = (mensagem: string, status: number) =>
  NextResponse.json({ ok: false, erro: mensagem }, { status });

/**
 * POST /api/enviar-teste — UM evento da aba "Teste" (`/e/<slug>/teste`),
 * SEMPRE em modo teste.
 *
 * O que esta rota NUNCA faz, e é isso que a separa do `/api/enviar`:
 *  - enviar sem `test_event_code`: sem código válido (`TEST…`) é 400 e nada
 *    sai. O evento só aparece em "Testar eventos" do Gerenciador de Eventos e
 *    não conta como conversão;
 *  - passar pelo dedup (`jaEnviado`/`marcarEnviado`), pelo repasse ao CRM
 *    (`transmitir`) ou pelo histórico de disparos (`registrarDisparo`): um
 *    teste não entra nas métricas nem chega ao CRM;
 *  - aceitar nome de evento fora dos 8 da aba (`EVENTOS_DE_TESTE`);
 *  - devolver o token: a resposta é só `{ ok, httpStatus, eventsReceived,
 *    fbtraceId, erro }`.
 *
 * Um evento por chamada: a aba manda em sequência, um por vez, e mostra o
 * resultado de cada um na linha dele.
 *
 * Respostas: 401 sem sessão; 409 aba e navegador em empresas diferentes;
 * 400 pedido inválido (Pixel, código, evento); 404 Pixel que não é da empresa
 * ativa; 200 quando a Meta respondeu (aceito ou não, `ok` diz); 502 quando
 * não deu para falar com a Meta.
 */
export async function POST(request: NextRequest) {
  try {
    exigirSessao(request);
    const empresaId = await empresaParaEscrita(request, 'enviar');
    const body = await request.json().catch(() => null);

    const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : '';
    if (!brandId) return erro('Escolha o Pixel.', 400);

    const marca = (await listarMarcas(empresaId)).find((m) => m.id === brandId);
    if (!marca) {
      return erro(
        'Este Pixel não existe ou não é da empresa ativa. Recarregue a página e escolha de novo.',
        404
      );
    }

    const pixelId = (marca.pixelId || '').trim();
    const accessToken = (marca.accessToken || '').trim();
    if (!pixelId || !accessToken) {
      return erro('Este Pixel não tem ID ou token de acesso. Complete o cadastro em Pixels.', 400);
    }

    // O código do corpo vence; sem ele, o que está salvo no Pixel.
    const doCorpo = typeof body?.testEventCode === 'string' ? body.testEventCode.trim() : '';
    const testEventCode = doCorpo || String(marca.testCode ?? '').trim();
    if (!ehCodigoDeTeste(testEventCode)) {
      return erro(
        'Informe o código de teste. Copie em Gerenciador de Eventos → Testar eventos (começa com TEST).',
        400
      );
    }

    const entrada: EventInput = body?.event && typeof body.event === 'object' ? body.event : {};
    if (!ehEventoDeTeste(entrada.event_name)) {
      return erro(`Evento fora da lista de teste. Use um destes: ${EVENTOS_DE_TESTE.join(', ')}.`, 400);
    }

    const evento = montarEvento(comTelefoneNormalizado(entrada));
    const erros = validar(evento);
    if (erros.length) return NextResponse.json({ ok: false, erro: erros.join(' · '), erros }, { status: 400 });

    let r: Awaited<ReturnType<typeof enviarParaMeta>>;
    try {
      r = await enviarParaMeta({
        pixelId,
        accessToken,
        testEventCode,
        apiVersion: process.env.API_VERSION,
        evento,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return erro(`Não foi possível falar com a Meta: ${msg}`, 502);
    }

    const resposta = r.resposta ?? {};
    const falha = (resposta.error ?? null) as { message?: string; error_user_msg?: string; fbtrace_id?: string } | null;
    const eventsReceived = Number(resposta.events_received ?? 0);
    const fbtraceId = String(resposta.fbtrace_id ?? falha?.fbtrace_id ?? '') || null;
    const ok = r.httpStatus >= 200 && r.httpStatus < 300 && eventsReceived > 0;

    // Uma linha só, sem token e sem dado do cliente.
    console.log(
      `[TESTE] ${evento.event_name} pixel=${pixelId} http=${r.httpStatus} recebidos=${eventsReceived}` +
        (fbtraceId ? ` fbtrace=${fbtraceId}` : '')
    );

    return NextResponse.json({
      ok,
      httpStatus: r.httpStatus,
      eventsReceived,
      fbtraceId,
      erro: ok
        ? null
        : falha?.error_user_msg || falha?.message || `A Meta não aceitou o evento (HTTP ${r.httpStatus}).`,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : String(e);
    return erro('Erro interno: ' + msg, 500);
  }
}
