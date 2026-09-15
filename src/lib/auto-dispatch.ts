import 'server-only';

import { acharMarca, lerIntegracoes, EMPRESA_DEFAULT_ID } from './config-store';
import { montarEvento, validar, enviarParaMeta, type EventInput } from './meta-capi';
import { calcularEmq } from './emq';
import { extrairAtribuicao, registrarDisparo } from './attribution-log';
import { enriquecer } from './perfil-atribuicao';
import { jaEnviado, marcarEnviado } from './dedup';
import { transmitir } from './relay';
import { marcarStatus, anotarResultado, type ItemInbox } from './inbox';
import { ehTesteInterno } from './parser';
import { avaliarTeste } from './deteccao-de-teste';
import { pixelAceitaAuto } from './modo-por-marca';

/**
 * Disparo de um item da caixa de entrada para um ou mais pixels.
 *
 * Usado pelo webhook (modo automatico, depois da resposta) e pelo botao
 * "Disparar agora" da tela. Nunca lanca: cada marca recebe o proprio resultado,
 * porque um pixel sem token nao pode impedir o outro de receber a conversao.
 *
 * A ordem das travas e deliberada:
 *   1.  teste            -> nunca chega na Meta (regras 1 e 4 do CLAUDE.md).
 *                           Padrao conhecido + a lista que o operador cadastrou.
 *   1-B. suspeita        -> so barra o AUTOMATICO; o botao continua funcionando
 *   2.  enriquecimento   -> herda fbc/fbp/ip/ua do pre-checkout pelo e-mail
 *   3.  validacao        -> janela de 7 dias e campos obrigatorios
 *   4.  deduplicacao     -> o mesmo pedido no mesmo pixel nunca vai duas vezes,
 *                           por `event_id`, por `order_id` ou por
 *                           `e-mail|valor|dia` quando nao ha nenhum dos dois
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
    | 'pixel-desligado'
    /**
     * O item esta sob SUSPEITA de teste (mesmo e-mail em varias compras) e o
     * disparo era automatico. Diferente de `teste-ignorado`: ali o console tem
     * certeza e o item morre; aqui ele so nao sai sozinho, e o botao "Disparar
     * agora" continua funcionando normalmente.
     */
    | 'suspeita-de-teste';
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

  /**
   * 🔴 A empresa deste disparo sai do ITEM, e e a UNICA autoridade aqui.
   *
   * O item foi carimbado na entrada, pela credencial que a plataforma
   * apresentou — webhook ou chave da tag. E disso que "de quem e este evento"
   * depende: quem pagou, pagou para aquele cliente.
   *
   * Derivar do Pixel de destino seria uma segunda resposta para a mesma
   * pergunta, e duas respostas so coincidem enquanto nada da errado: quando
   * `acharMarca` nao acha o Pixel (id apagado no meio do caminho), a resposta
   * pelo Pixel vira "empresa padrao" e o resultado da venda de um cliente
   * sairia pelos destinos de relay do Codigo Vencedor. Pelo item nao existe
   * essa borda — item sem o campo e anterior a FASE E, e ai `default` e mesmo
   * a resposta certa, porque so existia ela.
   *
   * A regra so referencia Pixel da propria empresa (validado no PUT de
   * /api/integracoes), entao nos casos sadios as duas leituras dao o mesmo.
   */
  const empresaDoItem = item.empresaId ?? EMPRESA_DEFAULT_ID;
  const texto = (k: string) => (typeof params.campos[k] === 'string' ? (params.campos[k] as string) : undefined);

  /**
   * A lista de testes do operador. `undefined` em toda instalacao que nunca
   * abriu a tela, e `.catch` porque `lerIntegracoes` LANCA quando o arquivo de
   * configuracao esta indisponivel (B1-e) — e ficar sem a lista nao pode
   * impedir uma venda real de sair. Sem ela, a trava volta a ser exatamente a
   * de antes: o padrao conhecido, que nunca dependeu de arquivo nenhum.
   */
  const listaDeTeste = await lerIntegracoes(empresaDoItem)
    .then((cfg) => cfg.testes)
    .catch(() => undefined);

  const veredicto = avaliarTeste(
    {
      email: texto('email'),
      nome: item.nomeCliente,
      firstName: texto('firstName'),
      lastName: texto('lastName'),
      valor: texto('value') !== undefined ? Number(texto('value')) : undefined,
      eventId: texto('eventId'),
      // A contagem de compras repetidas NAO entra aqui de proposito: ela e
      // decidida no recebimento, onde o item ainda esta chegando, e o resultado
      // dela ja veio gravado em `item.autoBloqueadoPorSuspeita`. Recontar no
      // disparo daria um numero diferente (a caixa andou) para a mesma venda.
    },
    listaDeTeste
  );

  /**
   * 1. Teste nunca vai para a Meta — nem pelo automatico, nem pelo botao.
   *
   * O `||` com `ehTesteInterno` e cinto e suspensorio: `avaliarTeste` ja
   * reaplica o mesmo padrao por dentro, mas se um dia as duas reguas
   * divergirem, quem ganha e a que BARRA. Deixar um teste passar suja o
   * aprendizado da campanha (regra 1 do CLAUDE.md); barrar de mais so obriga um
   * clique.
   */
  if (veredicto.ehTeste || ehTesteInterno(params.campos, texto('eventId'))) {
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

  /**
   * 1-B. Suspeita: nao sai SOZINHO, mas continua vivo.
   *
   * Cinto de seguranca, no mesmo espirito da conferencia B4-a logo abaixo: quem
   * DECIDE e o recebimento (`webhook-handler`), que nem agenda o disparo. Esta
   * trava existe para o chamador futuro que esqueca disso — a fila reprocessada
   * em lote, por exemplo.
   *
   * 🔴 `origem === 'auto'` e obrigatorio. O botao "Disparar agora" e um humano
   * com o item na frente e a explicacao na tela; se a suspeita barrasse o
   * manual tambem, nao haveria saida nenhuma e uma venda real presa aqui
   * morreria na fila — o oposto do que esta trava existe para fazer.
   */
  if (params.origem === 'auto' && item.autoBloqueadoPorSuspeita === true) {
    const barrados = await Promise.all(
      alvos.map<Promise<ResultadoDisparoAuto>>(async (m) => ({
        marcaId: m,
        pixelId: ((await acharMarca(m))?.pixelId || '').trim(),
        status: 'suspeita-de-teste',
        erro:
          item.explicacaoDeTeste ??
          'Este evento está sob suspeita de teste. Confira e dispare pelo botão se for uma venda real.',
        modoTeste: false,
        herdados: [],
        emq: 0,
      }))
    );
    await anotarResultado(item.id, barrados);
    console.log(`[auto-dispatch] ${eventoMeta} inbox=${item.id} -> suspeita de teste, automático barrado`);
    return barrados;
  }

  // 2. Enriquecimento pelo perfil guardado no pre-checkout.
  //
  // 🔴 A empresa sai do ITEM, e isso nao e detalhe: desde a FASE E os perfis de
  // empresa nao-padrao ficam guardados com a chave prefixada (`emp_x|fbp:...`).
  // Sem o `empresaId` aqui, `enriquecer` procuraria no bolo da `default` e a
  // venda de um cliente herdaria o fbc/fbp de OUTRO — ou, no melhor caso, nao
  // herdaria nada, jogando fora justamente o sinal que a tag daquela empresa
  // coletou. Item gravado antes desta fase nao tem o campo e cai na `default`,
  // que e de onde ele veio: zero migracao, herança identica a de hoje.
  const { campos, herdados } = await enriquecer(params.campos, empresaDoItem);
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

  /**
   * A identidade deste envio para a deduplicacao, montada uma vez so.
   *
   * O `event_id` sozinho nao bastava: a MESMA venda chegando por dois caminhos
   * (webhook direto e n8n, ou um reenvio depois de a plataforma trocar o id)
   * carrega ids diferentes e passava duas vezes. O `order_id` e a identidade de
   * NEGOCIO e nao muda; o par `e-mail|valor|dia` so entra quando nao ha nem um
   * nem outro. Ver `dedup.ts`.
   */
  const identidade = {
    eventId: evento.event_id,
    orderId: evento.custom_data?.order_id as string | undefined,
    email: t('email'),
    valor: evento.custom_data?.value as number | undefined,
    eventTime: evento.event_time,
  };

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
    if (await jaEnviado(pixelId, evento.event_name, identidade)) {
      resultados.push({
        ...base,
        status: 'duplicado',
        erro: 'Este evento já foi aceito pela Meta neste Pixel.',
      });
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

      if (ok) await marcarEnviado(pixelId, evento.event_name, identidade);

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
      }, empresaDoItem).catch(() => {});
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
