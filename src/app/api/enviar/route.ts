import { NextRequest, NextResponse } from 'next/server';
import { montarEvento, validar, enviarParaMeta } from '@/lib/meta-capi';
import { extrairAtribuicao, registrarDisparo } from '@/lib/attribution-log';
import { EMPRESA_DEFAULT_ID, acharMarca, empresaDaMarca } from '@/lib/config-store';
import { calcularEmq } from '@/lib/emq';
import { transmitir } from '@/lib/relay';
import { jaEnviado, marcarEnviado } from '@/lib/dedup';
import { exigirSessao } from '@/lib/sessao';

export async function POST(request: NextRequest) {
  try {
    exigirSessao(request);
    const body = await request.json();

    // O token vem do servidor, nunca do cliente. Ver config-store.ts.
    const marca = await acharMarca(String(body.brandId || 'default'));
    const pixelId = (marca?.pixelId || process.env.PIXEL_ID || '').trim();
    const accessToken = (marca?.accessToken || process.env.ACCESS_TOKEN || '').trim();

    if (!pixelId || !accessToken) {
      return NextResponse.json(
        {
          erros: [
            'A marca escolhida não tem Pixel ID ou token de acesso configurado.',
          ],
        },
        { status: 400 }
      );
    }

    const evento = montarEvento(body.event || {});
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

    const r = await enviarParaMeta({
      pixelId,
      accessToken,
      testEventCode: marca?.testCode?.trim() || undefined,
      apiVersion: process.env.API_VERSION,
      evento,
    });

    console.log(
      `[${new Date().toISOString()}] ${evento.event_name} event_id=${evento.event_id || '-'} -> HTTP ${r.httpStatus}`
    );

    // Le as UTMs da event_source_url e monta os deep links do Gerenciador ja
    // filtrados na campanha / conjunto / anuncio que gerou a venda.
    const atribuicao = extrairAtribuicao(evento.event_source_url || '', {
      adAccountId: marca?.adAccountId,
      quando: new Date(evento.event_time * 1000),
    });

    const resposta = r.resposta as {
      events_received?: number;
      fbtrace_id?: string;
      error?: { message?: string };
    };
    const ok = r.httpStatus === 200 && (resposta?.events_received ?? 0) > 0;
    if (ok) await marcarEnviado(pixelId, evento.event_name, identidade);

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
        // P-12: `acharMarca` cai no primeiro cadastro quando o id nao existe, e a
        // lista sempre tem o 'default' vindo do .env — o `??` e a mesma coisa dita no
        // tipo: o log NAO aceita disparo sem dono. Gravar `undefined` aqui deixaria o
        // historico com uma linha que nao se liga a Pixel nenhum.
        marcaId: marca?.id ?? 'default',
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
    // O destino do relay e o da empresa DONA DO PIXEL, e nao o da empresa que o
    // operador tem aberta na tela: quem recebeu a venda e quem precisa receber o
    // retorno. Esta rota continua SEM escopo de empresa — a marca vem do id.
    void transmitir(ok ? 'dispatch.success' : 'dispatch.error', {
      marca: { id: marca?.id, nome: marca?.nome, pixelId },
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
    }, marca ? empresaDaMarca(marca) : EMPRESA_DEFAULT_ID).catch(() => {});

    return NextResponse.json({ ...r, eventoMontado: evento, atribuicao });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erros: ['Erro interno: ' + msg] }, { status: 500 });
  }
}
