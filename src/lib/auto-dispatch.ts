import 'server-only';

import { acharMarca } from './config-store';
import { montarEvento, validar, enviarParaMeta, type EventInput } from './meta-capi';
import { calcularEmq } from './emq';
import { extrairAtribuicao, registrarDisparo } from './attribution-log';
import { enriquecer } from './perfil-atribuicao';
import { jaEnviado, marcarEnviado } from './dedup';
import { transmitir } from './relay';
import { marcarStatus, anotarResultado, type ItemInbox } from './inbox';
import { ehTesteInterno } from './parser';
import { pixelAceitaAuto } from './modo-por-marca';

/**
 * Disparo de um item da caixa de entrada para um ou mais pixels.
 *
 * Usado pelo webhook (modo automatico, depois da resposta) e pelo botao
 * "Disparar agora" da tela. Nunca lanca: cada marca recebe o proprio resultado,
 * porque um pixel sem token nao pode impedir o outro de receber a conversao.
 *
 * A ordem das travas e deliberada:
 *   1. teste interno   -> nunca chega na Meta (regras 1 e 4 do CLAUDE.md)
 *   2. enriquecimento  -> herda fbc/fbp/ip/ua do pre-checkout pelo e-mail
 *   3. validacao       -> janela de 7 dias e campos obrigatorios
 *   4. deduplicacao    -> o mesmo event_id no mesmo pixel nunca vai duas vezes
 *
 * Sobre a trava do Pixel da FASE 6 (autoDisparo): quem DECIDE e
 * `modo-por-marca.ts`, chamado pelos handlers; esta funcao recebe a lista de
 * marcas ja filtrada. A conferencia que existe aqui dentro so sabe RECUSAR
 * (B4-a) — ela nunca liga nada, entao nao cria uma segunda fonte de verdade.
 * E cinto de seguranca para um chamador futuro que esqueca de filtrar.
 */

export interface ResultadoDisparoAuto {
  marcaId: string;
  pixelId: string;
  status:
    | 'enviado'
    | 'duplicado'
    | 'invalido'
    | 'erro'
    | 'teste-ignorado'
    | 'sem-token'
    /** O Pixel esta com o disparo automatico desligado. Nao e erro, nao e falha. */
    | 'pixel-desligado';
  httpStatus?: number;
  eventsReceived?: number;
  fbtraceId?: string;
  erro?: string;
  modoTeste: boolean;
  herdados: string[];
  emq: number;
}

function paraUnix(iso?: string): number {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? Math.floor(Date.now() / 1000) : Math.floor(d.getTime() / 1000);
}

export async function dispararItem(params: {
  item: ItemInbox;
  campos: Record<string, string | boolean>;
  eventoMeta: string;
  marcas: string[];
  origem: 'auto' | 'manual';
}): Promise<ResultadoDisparoAuto[]> {
  const { item, eventoMeta } = params;
  const alvos = params.marcas.length ? params.marcas : ['default'];
  const texto = (k: string) => (typeof params.campos[k] === 'string' ? (params.campos[k] as string) : undefined);

  // 1. Teste interno nunca vai para a Meta.
  if (ehTesteInterno(params.campos, texto('eventId'))) {
    await marcarStatus(item.id, 'ignorado');
    // P-12: mesmo sem enviar nada, o registro guarda PARA ONDE teria ido. Sem o
    // ID do Pixel aqui a tela so teria o id interno da marca, que vira um
    // codigo sem dono no dia em que o cadastro for apagado.
    const ignorados = await Promise.all(
      alvos.map<Promise<ResultadoDisparoAuto>>(async (m) => ({
        marcaId: m,
        pixelId: ((await acharMarca(m))?.pixelId || '').trim(),
        status: 'teste-ignorado',
        modoTeste: false,
        herdados: [],
        emq: 0,
      }))
    );
    await anotarResultado(item.id, ignorados);
    console.log(`[auto-dispatch] ${eventoMeta} inbox=${item.id} -> teste interno, nada enviado`);
    return ignorados;
  }

  // 2. Enriquecimento pelo perfil guardado no pre-checkout.
  const { campos, herdados } = await enriquecer(params.campos);
  const t = (k: string) => (typeof campos[k] === 'string' ? (campos[k] as string) : undefined);

  const eventInput: EventInput = {
    event_name: eventoMeta,
    event_time: paraUnix(t('eventTime')),
    event_id: t('eventId'),
    event_source_url: t('sourceUrl'),
    action_source: 'website',
    user: {
      email: t('email'),
      phone: t('phone'),
      addDDI: true,
      firstName: t('firstName'),
      lastName: t('lastName'),
      externalId: t('externalId'),
      fbc: t('fbc'),
      fbp: t('fbp'),
      ip: t('ip'),
      userAgent: t('userAgent'),
    },
    custom: {
      value: t('value') !== undefined ? Number(t('value')) : undefined,
      currency: t('currency') || 'BRL',
      orderId: t('orderId'),
      contentName: t('contentName') || 'Acesso Código Vencedor',
    },
  };

  const evento = montarEvento(eventInput);
  const erros = validar(evento);
  const emq = calcularEmq({
    email: t('email'),
    phone: t('phone'),
    firstName: t('firstName'),
    lastName: t('lastName'),
    externalId: t('externalId'),
    fbc: t('fbc'),
    fbp: t('fbp'),
    ip: t('ip'),
    userAgent: t('userAgent'),
    sourceUrl: t('sourceUrl'),
    eventId: t('eventId'),
  });

  const resultados: ResultadoDisparoAuto[] = [];

  for (const marcaId of alvos) {
    const marca = await acharMarca(marcaId);
    const pixelId = (marca?.pixelId || '').trim();
    const accessToken = (marca?.accessToken || '').trim();
    const modoTeste = Boolean(marca?.testCode?.trim());
    const base = { marcaId, pixelId, modoTeste, herdados, emq: emq.nota };

    /**
     * B4-a: conferencia final da trava do Pixel, dentro do laco, por marca.
     *
     * So vale para `origem: 'auto'`. O botao "Disparar agora" da tela e um
     * clique humano com o item na frente — o Switch responde por disparo
     * AUTOMATICO, nao por permissao de uso do Pixel (§9.3.2). Bloquear o
     * manual aqui deixaria a fila sem saida, que e o oposto do que a FASE 6
     * existe para fazer.
     *
     * `marca.id === marcaId` de proposito: `acharMarca` cai na primeira
     * marca da lista quando o id nao existe, e herdar o "ligado" de outro
     * Pixel por causa de um id errado e justamente o disparo que nao pode
     * acontecer.
     */
    if (params.origem === 'auto' && !pixelAceitaAuto(marca?.id === marcaId ? marca : undefined)) {
      resultados.push({
        ...base,
        status: 'pixel-desligado',
        erro: 'O disparo automático deste Pixel está desligado. O item fica na fila.',
      });
      continue;
    }

    if (!pixelId || !accessToken) {
      resultados.push({ ...base, status: 'sem-token', erro: 'Marca sem Pixel ID ou token.' });
      continue;
    }
    if (erros.length) {
      resultados.push({ ...base, status: 'invalido', erro: erros.join(' ') });
      continue;
    }
    if (await jaEnviado(pixelId, evento.event_name, evento.event_id)) {
      resultados.push({ ...base, status: 'duplicado', erro: 'event_id já aceito pela Meta neste pixel.' });
      continue;
    }

    try {
      const r = await enviarParaMeta({
        pixelId,
        accessToken,
        testEventCode: marca?.testCode?.trim() || undefined,
        apiVersion: process.env.API_VERSION,
        evento,
      });
      const resp = r.resposta as { events_received?: number; fbtrace_id?: string; error?: { message?: string } };
      const ok = r.httpStatus === 200 && (resp?.events_received ?? 0) > 0;
      const atribuicao = extrairAtribuicao(evento.event_source_url || '', {
        adAccountId: marca?.adAccountId,
        quando: new Date(evento.event_time * 1000),
      });

      await registrarDisparo({
        eventName: evento.event_name,
        eventId: evento.event_id,
        eventTime: evento.event_time,
        value: evento.custom_data?.value as number | undefined,
        currency: evento.custom_data?.currency as string | undefined,
        orderId: evento.custom_data?.order_id as string | undefined,
        httpStatus: r.httpStatus,
        fbtraceId: resp?.fbtrace_id,
        eventsReceived: resp?.events_received,
        temFbc: Boolean(evento.user_data.fbc),
        temFbp: Boolean(evento.user_data.fbp),
        eventSourceUrl: evento.event_source_url,
        atribuicao,
        pixelId,
        marcaId,
      }).catch((e) => console.error('[auto-dispatch] falha ao gravar log:', e));

      if (ok) await marcarEnviado(pixelId, evento.event_name, evento.event_id);

      resultados.push({
        ...base,
        status: ok ? 'enviado' : 'erro',
        httpStatus: r.httpStatus,
        eventsReceived: resp?.events_received,
        fbtraceId: resp?.fbtrace_id,
        erro: resp?.error?.message,
      });

      void transmitir(ok ? 'dispatch.success' : 'dispatch.error', {
        origem: params.origem,
        inboxId: item.id,
        marca: { id: marcaId, nome: marca?.nome, pixelId },
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
          eventsReceived: resp?.events_received ?? 0,
          fbtraceId: resp?.fbtrace_id,
          erro: resp?.error?.message,
          modoTeste,
        },
        emq: { nota: emq.nota, herdados },
        atribuicao,
      }).catch(() => {});
    } catch (e) {
      resultados.push({ ...base, status: 'erro', erro: e instanceof Error ? e.message : String(e) });
    }
  }

  const algumEnviado = resultados.some((r) => r.status === 'enviado');
  if (algumEnviado) await marcarStatus(item.id, 'disparado');
  await anotarResultado(item.id, resultados);
  console.log(
    `[auto-dispatch] ${eventoMeta} inbox=${item.id} -> ` +
      resultados.map((r) => `${r.marcaId}:${r.status}${r.httpStatus ? ' ' + r.httpStatus : ''}`).join(', ')
  );
  return resultados;
}
