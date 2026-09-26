import { NextRequest, NextResponse } from 'next/server';
import { montarEvento, validar, enviarParaMeta, type EventInput } from '@/lib/meta-capi';
import { extrairAtribuicao, registrarDisparo } from '@/lib/attribution-log';
import { listarMarcas } from '@/lib/config-store';
import { empresaParaEscrita } from '@/lib/empresa-ativa';
import { calcularEmq } from '@/lib/emq';
import { transmitir } from '@/lib/relay';
import { jaEnviado, marcarEnviado } from '@/lib/dedup';
import { exigirSessao } from '@/lib/sessao';
import { normalizarTelefone } from '@/lib/telefone';

/**
 * Com a caixa "DDI automatico" ligada (o padrao), o telefone sai em E.164 com
 * o pais descoberto pelo proprio numero, pela URL e pela moeda do formulario —
 * e o `addDDI` desliga, porque a regra antiga de meta-capi colaria 55 num
 * numero uruguaio. Com a caixa desligada o numero vai como o operador digitou.
 */
function comTelefoneNormalizado(ev: EventInput): EventInput {
  const u = ev.user;
  if (!u?.phone || u.addDDI === false) return ev;
  const phone = normalizarTelefone(u.phone, {
    url: ev.event_source_url,
    moeda: ev.custom?.currency,
  });
  return { ...ev, user: { ...u, phone, addDDI: false } };
}

/**
 * O "Enviar" do formulário (`useDisparo.ts`): manda UM evento a UM Pixel.
 *
 * POST { brandId, event, forcar? }
 *
 * Respostas de recusa, e nenhuma delas chama a Meta:
 *  - 401 sem sessão;
 *  - 409 quando a aba (header `X-Empresa-Id`) e o navegador (cookie
 *    `capi_empresa`) estão em empresas diferentes (T6, `empresaParaEscrita`);
 *  - 400 sem `brandId`;
 *  - 404 quando o Pixel não existe OU não é da empresa ativa (D16);
 *  - 400 quando o Pixel não tem Pixel ID ou token;
 *  - 400 evento inválido; 409 `duplicado` quando a Meta já aceitou o evento
 *    num envio REAL (envio em modo teste não conta, C8/D12).
 */
export async function POST(request: NextRequest) {
  try {
    exigirSessao(request);
    // T6 (C1, aplicado aqui na C3): aba e navegador em empresas diferentes →
    // 409 antes de ler o corpo, e nada sai. Conversão enviada ao Pixel da
    // empresa errada não volta atrás.
    const empresaId = await empresaParaEscrita(request, 'enviar');
    const body = await request.json();

    // D16 (C3): o Pixel tem que EXISTIR e ser DA EMPRESA ATIVA.
    //
    // Antes daqui a rota usava `acharMarca`, que devolve o PRIMEIRO Pixel da
    // lista quando o id não existe — o do dono, `default`. Um Pixel apagado
    // numa aba aberta, ou um id de outra empresa, virava venda no Pixel do
    // dono, e o toast da tela ainda mostrava o Pixel que a pessoa escolheu
    // (T4). Agora a busca é só entre os Pixels da empresa ativa, e não achar
    // é 404: nada sai, e a tela manda recarregar e escolher de novo. Com isso
    // o Pixel do toast de `useDisparo.ts` é sempre o que recebeu o evento.
    const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : '';
    if (!brandId) {
      return NextResponse.json({ erros: ['Escolha o Pixel.'] }, { status: 400 });
    }
    const marca = (await listarMarcas(empresaId)).find((m) => m.id === brandId);
    if (!marca) {
      return NextResponse.json(
        {
          erros: [
            'Este Pixel não existe ou não é da empresa ativa. Recarregue a página e escolha de novo.',
          ],
        },
        { status: 404 }
      );
    }

    // O token vem do servidor, nunca do cliente. Ver config-store.ts.
    //
    // Sem recuo para PIXEL_ID/ACCESS_TOKEN do ambiente AQUI: um Pixel de
    // cliente sem credencial pegaria o Pixel e o token do dono. As credenciais
    // do .env continuam valendo só para o Pixel `default`, que é o próprio
    // Pixel do .env (`marcaDoEnv`/`listarMarcas`, em config-store.ts).
    const pixelId = (marca.pixelId || '').trim();
    const accessToken = (marca.accessToken || '').trim();

    if (!pixelId || !accessToken) {
      return NextResponse.json(
        {
          erros: [
            'O Pixel escolhido não tem Pixel ID ou token de acesso configurado.',
          ],
        },
        { status: 400 }
      );
    }

    const evento = montarEvento(comTelefoneNormalizado(body.event || {}));
    const erros = validar(evento);
    if (erros.length) {
      return NextResponse.json({ erros, eventoMontado: evento }, { status: 400 });
    }

    // Enviar a mesma venda duas vezes no mesmo pixel conta a conversão em dobro:
    // a Meta só deduplica Pixel×CAPI, não CAPI×CAPI. Só passa com forcar: true.
    //
    // A identidade é a inteira, e não mais só o `event_id`: o mesmo pedido
    // reenviado com um id novo (retry da plataforma, reprocesso pelo n8n) não
    // era pego por nada. Ver `dedup.ts`.
    const identidade = {
      eventId: evento.event_id,
      orderId: evento.custom_data?.order_id as string | undefined,
      email: body.event?.user?.email,
      valor: evento.custom_data?.value as number | undefined,
      eventTime: evento.event_time,
    };

    if (body.forcar !== true && (await jaEnviado(pixelId, evento.event_name, identidade))) {
      return NextResponse.json(
        {
          erros: [
            'Este evento já foi aceito pela Meta neste pixel. Reenviar contaria a conversão duas vezes.',
          ],
          duplicado: true,
          eventoMontado: evento,
        },
        { status: 409 }
      );
    }

    // C8 (D12): envio com `test_event_code` (Pixel em modo teste) cai só em
    // "Eventos de teste" da Meta e não é conversão. Ele vai para o log com
    // `modoTeste: true` e NÃO marca a deduplicação: quando o Pixel for para
    // produção, a mesma venda pode sair de verdade, em vez de "já aceito".
    const testEventCode = marca.testCode?.trim() || undefined;
    const modoTeste = Boolean(testEventCode);

    const r = await enviarParaMeta({
      pixelId,
      accessToken,
      testEventCode,
      apiVersion: process.env.API_VERSION,
      evento,
    });

    console.log(
      `[${new Date().toISOString()}] ${evento.event_name} event_id=${evento.event_id || '-'} -> HTTP ${r.httpStatus}`
    );

    // Le as UTMs da event_source_url e monta os deep links do Gerenciador ja
    // filtrados na campanha / conjunto / anuncio que gerou a venda.
    const atribuicao = extrairAtribuicao(evento.event_source_url || '', {
      adAccountId: marca.adAccountId,
      quando: new Date(evento.event_time * 1000),
    });

    const resposta = r.resposta as {
      events_received?: number;
      fbtrace_id?: string;
      error?: { message?: string };
    };
    const ok = r.httpStatus === 200 && (resposta?.events_received ?? 0) > 0;
    if (ok) await marcarEnviado(pixelId, evento.event_name, identidade, { modoTeste });

    const ud = evento.user_data as Record<string, unknown>;
    const emq = calcularEmq({
      email: body.event?.user?.email,
      phone: body.event?.user?.phone,
      firstName: body.event?.user?.firstName,
      lastName: body.event?.user?.lastName,
      externalId: body.event?.user?.externalId,
      fbc: typeof ud.fbc === 'string' ? ud.fbc : undefined,
      fbp: typeof ud.fbp === 'string' ? ud.fbp : undefined,
      ip: typeof ud.client_ip_address === 'string' ? ud.client_ip_address : undefined,
      userAgent:
        typeof ud.client_user_agent === 'string' ? ud.client_user_agent : undefined,
      sourceUrl: evento.event_source_url,
      eventId: evento.event_id,
    });

    try {
      const arquivos = await registrarDisparo({
        eventName: evento.event_name,
        eventId: evento.event_id,
        eventTime: evento.event_time,
        value: evento.custom_data?.value as number | undefined,
        currency: evento.custom_data?.currency as string | undefined,
        orderId: evento.custom_data?.order_id as string | undefined,
        httpStatus: r.httpStatus,
        fbtraceId: resposta?.fbtrace_id,
        eventsReceived: resposta?.events_received,
        temFbc: Boolean(ud.fbc),
        temFbp: Boolean(ud.fbp),
        eventSourceUrl: evento.event_source_url,
        atribuicao,
        pixelId,
        // P-12: o log NAO aceita disparo sem dono. Desde a C3 a marca e sempre a
        // que foi pedida e existe na empresa ativa (sem ela a rota ja devolveu
        // 404), entao o id gravado e o do Pixel que recebeu — nunca um
        // 'default' de reserva que ligaria a linha ao Pixel do dono.
        marcaId: marca.id,
        // C8 (D12): linha de teste fica fora do indice de deduplicacao.
        modoTeste,
      });
      if (atribuicao.links.anuncio) {
        console.log(`  criativo que converteu -> ${atribuicao.links.anuncio}`);
      }
      console.log(`  log -> ${arquivos.md}`);
    } catch (logErro) {
      // O log nunca pode derrubar o disparo: o evento ja foi entregue a Meta.
      console.error('  falha ao gravar o log de atribuicao:', logErro);
    }

    // Devolve ao n8n / CRM o que a Meta respondeu. Sem segredos: ver relay.ts.
    //
    // O destino do relay e o da empresa DONA DO PIXEL: quem recebeu a venda e
    // quem precisa receber o retorno. Desde a C3 (D16) esta rota TEM escopo de
    // empresa — a marca so e achada entre os Pixels da empresa ativa —, entao a
    // dona do Pixel e a empresa ativa sao a mesma, por construcao.
    void transmitir(ok ? 'dispatch.success' : 'dispatch.error', {
      marca: { id: marca.id, nome: marca.nome, pixelId },
      evento: {
        event_name: evento.event_name,
        event_id: evento.event_id,
        event_time: evento.event_time,
        value: evento.custom_data?.value,
        currency: evento.custom_data?.currency,
        order_id: evento.custom_data?.order_id,
      },
      meta: {
        httpStatus: r.httpStatus,
        eventsReceived: resposta?.events_received ?? 0,
        fbtraceId: resposta?.fbtrace_id,
        erro: resposta?.error?.message,
      },
      emq: {
        nota: emq.nota,
        presentes: emq.parametros.filter((p) => p.presente).map((p) => p.sigla),
        ausentes: emq.faltando.map((p) => p.sigla),
      },
      atribuicao,
    }, empresaId).catch(() => {});

    return NextResponse.json({ ...r, eventoMontado: evento, atribuicao });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erros: ['Erro interno: ' + msg] }, { status: 500 });
  }
}
