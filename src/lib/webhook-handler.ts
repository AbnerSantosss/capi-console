import 'server-only';

import { NextRequest, NextResponse, after } from 'next/server';
import {
  lerIntegracoes,
  acharRegra,
  rotuloDaConfig,
  listarMarcas,
  ErroConfiguracaoIndisponivel,
} from '@/lib/config-store';
import { acharEmpresaPorSegredo } from '@/lib/empresas';
import { respostaConfigIndisponivel } from '@/lib/erro-api';
import { registrarEntrada, mascararEmail, contarComprasDoEmail, hashDoEmail } from '@/lib/inbox';
import { avaliarTeste } from '@/lib/deteccao-de-teste';
import { sinaisDoPayload } from '@/lib/inbox-sinais';
import { parseWebhook, ehTesteInterno, type ClassificacaoEvento, type MotivoIgnorar } from '@/lib/parser';
import { calcularEmq } from '@/lib/emq';
import { transmitir } from '@/lib/relay';
import { guardarPerfil } from '@/lib/perfil-atribuicao';
import { dispararItem } from '@/lib/auto-dispatch';
import {
  resolverModoPorMarca,
  decisaoDaSonda,
  soMarcasEmTeste,
  SEM_DECISAO,
} from '@/lib/modo-por-marca';

/**
 * Handler único do recebimento de webhook, usado por duas rotas e três formas
 * de URL — todas as três valem para sempre, sem depreciação e sem redirect
 * (redirect em POST faz muitos clientes trocarem para GET ou largarem o corpo):
 *
 *   POST /api/webhook/in                     -> segredo no header X-CAPI-Secret
 *   POST /api/webhook/in/<segredo>           -> segredo no caminho (legada, é a
 *                                               que está cadastrada no xWinner)
 *   POST /api/webhook/in/<rotulo>/<segredo>  -> apelido legível + segredo
 *
 * O <rotulo> é apelido, não credencial; o segredo é sempre o ÚLTIMO segmento.
 * Apelido errado com segredo certo é ACEITO (202) e a divergência aparece na
 * caixa de entrada: se renomear o apelido derrubasse o endpoint já cadastrado,
 * uma venda PIX real se perderia — exatamente o que este projeto existe para
 * impedir.
 *
 * A forma com segredo no caminho existe porque plataformas como o xWinner só
 * oferecem o campo "URL (https)" ao cadastrar um endpoint de saída — não há onde
 * colocar um header customizado. É o mesmo padrão de Slack e Discord.
 *
 * O segredo NÃO vai em query string de propósito: query string vaza em
 * `Referer`, em log de proxy e em histórico com muito mais facilidade que o
 * caminho, e alguns gateways registram a query inteira em texto claro.
 */

/** Corpo acima disto não é lido inteiro: um payload gigante não pode comer o container. */
const LIMITE_CORPO = 1_000_000;

/**
 * Evento da sonda de conexão (o `ping` do botão "Testar" do backoffice).
 *
 * ViewContent de propósito: é topo de funil e não é conversão. Um teste de
 * conexão jamais pode parecer venda — nem no relatório, nem para o algoritmo.
 */
const EVENTO_DA_SONDA = 'ViewContent';

/**
 * Identidade da sonda. Duas exigências, as duas obrigatórias:
 *
 * 1. Estável, para o `event_id` deduplicar reenvio da plataforma.
 * 2. NÃO pode casar com `ehTesteInterno` (parser.ts) — se casasse, o disparo
 *    pararia antes da Meta e a sonda não provaria nada. Por isso nada de
 *    `teste@` nem de domínio `example.com`.
 *
 * Não é cliente de mentira: é o próprio console se identificando.
 */
/**
 * A trava da sonda: ela so vai aos destinos que tem `test_event_code`. E a
 * checagem que mantem a regra 1 do CLAUDE.md de pe — evento sintetico jamais
 * entra no dataset que treina as campanhas.
 *
 * Devolve QUAIS destinos estao em teste, e nao "algum esta?" (C10, D2): numa
 * regra que mistura um Pixel em teste e um em producao, a pergunta antiga dizia
 * "sim" e a sonda ia para os dois. O filtro em si e `soMarcasEmTeste`
 * (`modo-por-marca.ts`), o mesmo que o teste da trava do Pixel prova.
 */
async function marcasEmTeste(ids: string[]): Promise<string[]> {
  try {
    return soMarcasEmTeste(ids, await listarMarcas());
  } catch {
    return []; // na duvida, nao dispara
  }
}

function camposDaSonda(
  req: NextRequest,
  sourceUrl: string | undefined,
  idItem: string
): Record<string, string> {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  return {
    email: 'sonda.webhook@codigovencedor.com',
    firstName: 'Sonda',
    lastName: 'Webhook',
    externalId: `sonda-${idItem}`,
    eventId: `sonda-${idItem}`,
    sourceUrl: sourceUrl || process.env.PUBLIC_BASE_URL || '',
    userAgent: req.headers.get('user-agent') ?? '',
    ...(ip ? { ip } : {}),
  };
}

/**
 * Tentativas com segredo errado. Fica só em memória e sem payload nenhum
 * (tráfego hostil não merece disco); serve para o /api/health mostrar que
 * alguém está batendo na porta.
 */
let segredosRecusados = 0;
export function tentativasComSegredoInvalido(): number {
  return segredosRecusados;
}

/** Formato do payload, só para a caixa de entrada dizer por onde o evento veio. */
function formatoDoEvento(nome: string | undefined, conhecido: boolean): 'A' | 'B' | 'outro' {
  if (!nome || !conhecido) return 'outro';
  return nome.includes('.') ? 'B' : 'A';
}

export async function processarWebhook(
  request: NextRequest,
  segredoDaUrl?: string,
  rotuloDaUrl?: string
) {
  // 🔴 B1-e / portão D33. Se `config/integracoes.json` existir mas nem ele nem o
  // `.bak` puderem ser lidos, esta entrega responde **503**, NUNCA 401.
  //
  // A diferença é o que a plataforma faz depois: 401 ela lê como "o segredo está
  // errado" e para de tentar — e aí a venda se perde de vez, porque ninguém no
  // servidor sabe que ela existiu. 503 é "tente de novo mais tarde" e a fila de
  // entrega dela retoma sozinha quando a configuração voltar.
  //
  // Nada é regenerado aqui: o segredo continua o mesmo quando o arquivo voltar.
  //
  // 🔴 Esta leitura de guarda continua ANTES da busca por empresa, e continua
  // olhando a PADRÃO. `acharEmpresaPorSegredo` PULA a empresa cujo arquivo não
  // pôde ser lido (uma cliente corrompida não pode derrubar as outras) — sem a
  // guarda, uma `default` ilegível voltaria a virar 401 e a plataforma pararia
  // de reentregar, que é exatamente o defeito B1 que este portão fecha.
  try {
    await lerIntegracoes();
  } catch (e) {
    if (e instanceof ErroConfiguracaoIndisponivel) return respostaConfigIndisponivel(e);
    throw e;
  }

  // 1. O segredo decide sozinho, antes de qualquer olhar no rótulo — e é ele
  // que diz de QUAL empresa é esta entrega. Nunca a empresa ativa do console:
  // do outro lado de um webhook não há navegador nenhum, e resolver pelo que
  // está aberto na aba mandaria a venda de um cliente para o Pixel de outro.
  //
  // A resposta de recusa é a MESMA de sempre (mesmo corpo, mesmo 401) e a busca
  // percorre a lista inteira sem parar no acerto: é assim que o tempo de
  // resposta não conta quantas empresas foram testadas antes.
  const enviado = segredoDaUrl ?? request.headers.get('x-capi-secret') ?? '';
  const achado = await acharEmpresaPorSegredo(enviado);
  if (!achado) {
    segredosRecusados++;
    return NextResponse.json(
      {
        erro: segredoDaUrl
          ? 'Segredo inválido no caminho da URL.'
          : 'Segredo inválido ou ausente no header X-CAPI-Secret.',
      },
      { status: 401 }
    );
  }

  const { empresaId, cfg } = achado;

  // 2. Só depois o rótulo, com comparação comum: ele é cosmético, não decide
  // nada, então tempo constante aqui seria teatro.
  const rotuloEsperado = rotuloDaConfig(cfg);
  const rotuloRecebido = rotuloDaUrl ?? null;
  const rotuloDivergente = Boolean(rotuloDaUrl) && rotuloDaUrl !== rotuloEsperado;

  const origem = request.headers.get('user-agent') ?? 'desconhecida';

  // Um corpo gigante não pode consumir a memória do container. Mesmo recusado,
  // a tentativa vira item na caixa: sem isso, a entrega "não existiu" na tela e
  // a plataforma reentrega em silêncio.
  const tamanho = Number(request.headers.get('content-length') || 0);
  if (tamanho > LIMITE_CORPO) {
    await registrarNaoLido({
      origem,
      empresaId,
      motivo: 'acima de 1 MB',
      amostra: '',
      rotuloRecebido,
      rotuloDivergente,
    });
    return NextResponse.json({ erro: 'Payload acima de 1 MB.' }, { status: 413 });
  }

  // Lê como texto para ter amostra do que chegou mesmo quando não é JSON.
  const texto_cru = await request.text();
  if (texto_cru.length > LIMITE_CORPO) {
    await registrarNaoLido({
      origem,
      empresaId,
      motivo: 'acima de 1 MB',
      amostra: texto_cru.slice(0, 2000),
      rotuloRecebido,
      rotuloDivergente,
    });
    return NextResponse.json({ erro: 'Payload acima de 1 MB.' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(texto_cru);
  } catch {
    await registrarNaoLido({
      origem,
      empresaId,
      motivo: 'corpo não é JSON',
      amostra: texto_cru.slice(0, 2000),
      rotuloRecebido,
      rotuloDivergente,
    });
    return NextResponse.json({ erro: 'O corpo não é um JSON válido.' }, { status: 400 });
  }

  // O parser nunca pode derrubar o recebimento: se falhar, guardamos cru.
  let campos: Record<string, string | boolean> = {};
  let evento: string | undefined;
  let eventoOrigem: string | undefined;
  let conhecido = false;
  let ignorarPeloParser = false;
  let classificacao: ClassificacaoEvento = 'sem-evento';
  let motivoDoParser: MotivoIgnorar | undefined;
  let testePlataforma = false;
  let eventoMetaSugerido: string | undefined;
  try {
    const r = parseWebhook(JSON.stringify(payload));
    campos = r.fields;
    evento = r.eventName;
    eventoOrigem = r.eventoOrigem;
    conhecido = r.eventoConhecido;
    ignorarPeloParser = r.ignorar;
    classificacao = r.classificacao;
    motivoDoParser = r.motivoIgnorar;
    testePlataforma = r.testePlataforma;
    eventoMetaSugerido = r.eventoMetaSugerido;
  } catch {
    /* segue com o payload cru */
  }

  const texto = (k: string) =>
    typeof campos[k] === 'string' ? (campos[k] as string) : undefined;

  const emq = calcularEmq({
    email: texto('email'),
    phone: texto('phone'),
    firstName: texto('firstName'),
    lastName: texto('lastName'),
    externalId: texto('externalId'),
    fbc: texto('fbc'),
    fbp: texto('fbp'),
    ip: texto('ip'),
    userAgent: texto('userAgent'),
    sourceUrl: texto('sourceUrl'),
    eventId: texto('eventId'),
  });

  // Nome original do evento na plataforma, para aparecer na caixa de entrada
  // mesmo quando o parser não souber mapear (ex.: subscription_started).
  const bruto = payload as Record<string, unknown> | null;
  const nomeOriginal =
    eventoOrigem ?? (typeof bruto?.event === 'string' ? (bruto.event as string) : undefined);

  // A regra decide evento da Meta, pixels e modo. Sem regra: o que o parser
  // disser — e se ele mandou ignorar, ignoramos (abandono não é conversão).
  //
  // O fallback é 'fila' por decisão de projeto (regra 3 do CLAUDE.md): não
  // existe interruptor global de automático, `cfg.entrada.modo` não é lido.
  // Ligar automático é sempre por regra nomeada, na tela de Integrações.
  const regra = nomeOriginal ? acharRegra(cfg, nomeOriginal) : undefined;
  const modoDaRegra: 'auto' | 'fila' | 'ignorar' = regra
    ? regra.modo
    : ignorarPeloParser
      ? 'ignorar'
      : 'fila';
  const eventoDaRegra =
    regra && regra.modo !== 'ignorar' && regra.eventoMeta ? regra.eventoMeta : evento;
  const marcas = regra?.marcas?.length ? regra.marcas : ['default'];

  // A sonda de conexao. O botao "Testar" do backoffice manda `ping`: sem
  // cliente, sem valor, sem pedido. Ate aqui ele morria na caixa de entrada
  // como "ignorado" e provava apenas que a URL respondia 202 — nao provava
  // que o token vale, que o pixel existe, nem que a Meta aceita o evento.
  //
  // Agora ele fecha o circuito ate o Gerenciador de Eventos. Com uma trava:
  // so vai aos destinos que tem `test_event_code`. Com codigo de teste o evento
  // cai em "Testar eventos" e fica fora das metricas e da otimizacao; sem
  // codigo, iria para o dataset de producao como dado inventado — o que a
  // regra 1 do CLAUDE.md proibe. Sem nenhum destino em teste o `ping` volta a
  // ser exatamente o que era: ignorado.
  //
  // A trava vale Pixel a Pixel (C10, D2): numa regra que mistura teste e
  // producao, so os Pixels em teste entram na decisao da sonda. O de producao
  // fica fora do item inteiro — nem `modoPorMarca`, nem `motivoFila`, nem alvo
  // do disparo —, entao nao recebe a sonda e nao a ve na fila.
  const emTeste = testePlataforma ? await marcasEmTeste(marcas) : [];
  const sonda = testePlataforma && emTeste.length > 0;

  const modo: 'auto' | 'fila' | 'ignorar' = sonda ? 'auto' : modoDaRegra;
  const eventoFinal = sonda ? EVENTO_DA_SONDA : eventoDaRegra;

  // A TRAVA DO PIXEL (FASE 6, alteracao 9.B). Entra aqui, e so aqui: depois
  // de a regra ter escolhido evento e destinos, antes de qualquer envio.
  //
  // Ate a FASE 5 o modo era escalar e valia para todos os destinos de uma vez.
  // A partir daqui cada Pixel responde por si: a regra diz que o evento DEVE
  // ser automatico, o Pixel diz se ACEITA ser disparado sozinho, e so o "sim"
  // das duas pontas manda a conversao embora.
  //
  // 'ignorar' nao passa por aqui (§9.5.1 regra 3) e a sonda passa por fora da
  // trava — o porque esta escrito em decisaoDaSonda(). A sonda recebe so os
  // Pixels em teste, nunca a lista inteira da regra.
  const decisao =
    modo === 'ignorar'
      ? SEM_DECISAO
      : sonda
        ? decisaoDaSonda(emTeste)
        : await resolverModoPorMarca(modoDaRegra, marcas);

  const motivoIgnorar: MotivoIgnorar | undefined =
    modo !== 'ignorar' ? undefined : regra ? 'regra' : motivoDoParser;

  // Qualquer evento que traga fbc/fbp/ip/ua alimenta o perfil do comprador.
  // É isso que salva o Purchase do PIX, que chega sem atribuição nenhuma.
  await guardarPerfil(campos, empresaId).catch(() => {});

  // Sinais de leitura da caixa de entrada (nome, fbclid, gclid).
  //
  // Por que ler o payload de novo se o parser ja encheu `campos`: porque as
  // duas leituras PRECISAM concordar. Item antigo ganha os sinais por
  // `sinaisDoPayload` na hora de ler o disco (`inbox.ts carregarDoDisco`); se o
  // recebimento usasse outra regra, a mesma venda apareceria com um chip antes
  // do restart e outro depois. O caso concreto: quando so o cookie `_fbc` vem
  // no corpo, `campos.fbclid` fica vazio (o parser reconstroi o `fbc` a partir
  // do fbclid, nao o contrario) mas a Meta ainda consegue atribuir — e
  // `sinaisDoPayload` sabe disso. `campos` tem precedencia; os sinais so
  // preenchem o que falta.
  const sinais = sinaisDoPayload(payload);
  const nomeDosCampos = [texto('firstName'), texto('lastName')].filter(Boolean).join(' ');

  /* ---------------------------------------------------------------- */
  /* É teste? E, se não for, dá para confiar nele sozinho?             */
  /* ---------------------------------------------------------------- */

  const emailMascarado = mascararEmail(texto('email'));
  // Chave de contagem: SHA-256 do e-mail INTEIRO. A máscara junta pessoas
  // diferentes (`maria@`, `marta@` e `mauro@` viram todas `ma***@`) e travava o
  // automático de venda legítima. O hash é gravado no item, mas nunca sai para
  // a tela: `inbox.ts` o tira em todo ponto de saída (`paraTela`).
  const emailHash = hashDoEmail(texto('email'));
  const compraChegando = eventoFinal === 'Purchase';

  /**
   * Quantas compras este mesmo e-mail já tem, INCLUINDO esta.
   *
   * Só é contado para compra: o mesmo e-mail em vários `Lead` ou `ViewContent`
   * é uma pessoa que voltou ao site, e desconfiar disso seria inventar
   * problema. O `+ 1` entra porque o item ainda não foi gravado.
   *
   * O `.catch` segue a regra de ouro do caminho de recebimento: se a leitura da
   * caixa falhar, a venda entra assim mesmo — sem suspeita, que é o lado que
   * deixa a venda passar.
   */
  const comprasDoMesmoEmail = compraChegando
    ? (await contarComprasDoEmail(emailHash, empresaId).catch(() => 0)) + 1
    : 0;

  const veredicto = avaliarTeste(
    {
      email: texto('email'),
      nome: nomeDosCampos || sinais.nomeCliente,
      firstName: texto('firstName'),
      lastName: texto('lastName'),
      valor: texto('value') ? Number(texto('value')) : undefined,
      eventId: texto('eventId'),
      ehCompra: compraChegando,
      comprasDoMesmoEmail,
    },
    cfg.testes
  );

  /**
   * Suspeita ≠ teste, e a distinção decide o que acontece com uma venda.
   *
   * `ehTeste` já era tratado (o item vira `ignorado` dentro de `dispararItem`).
   * O que é novo é isto: o item que NÃO é teste mas está sob suspeita fica
   * sendo um evento real, conta nas métricas, aparece na fila — e apenas não
   * sai sozinho. Um clique humano ainda o envia.
   */
  const autoBloqueadoPorSuspeita = veredicto.bloqueiaAutomatico && !veredicto.ehTeste;

  const item = await registrarEntrada({
    origem,
    empresaId,
    evento: eventoFinal ?? nomeOriginal,
    eventoOrigem: nomeOriginal,
    eventoMeta: eventoFinal,
    eventoMetaSugerido,
    regraId: regra?.id,
    modo,
    // Aditivo: o modo da regra continua em "modo", o que de fato aconteceu com
    // cada Pixel fica aqui. Item ignorado nao ganha os campos, para nao poluir
    // o historico com dois objetos vazios.
    ...(modo === 'ignorar'
      ? {}
      : { modoPorMarca: decisao.modoPorMarca, motivoFila: decisao.motivoFila }),
    conhecido,
    classificacao,
    motivoIgnorar,
    testePlataforma,
    // Marcado já no recebimento: antes só o disparo sabia disso, e o item de
    // teste da equipe ficava indistinguível de uma venda na fila.
    //
    // O `||` mantém `ehTesteInterno` no lugar: `avaliarTeste` já reaplica o
    // mesmo padrão, mas entre duas réguas quem ganha é a que BARRA.
    testeInterno: veredicto.ehTeste || ehTesteInterno(campos, texto('eventId')),
    motivoDeTeste: veredicto.motivo,
    explicacaoDeTeste: veredicto.explicacao,
    // Só gravado quando é `true`: um `false` em todo item seria ruído no
    // histórico de uma coisa que quase nunca acontece.
    ...(autoBloqueadoPorSuspeita ? { autoBloqueadoPorSuspeita: true } : {}),
    formato: formatoDoEvento(nomeOriginal, conhecido),
    rotuloRecebido,
    rotuloDivergente,
    valor: texto('value') ? Number(texto('value')) : undefined,
    moeda: texto('currency'),
    emailMascarado,
    emailHash,
    orderId: texto('orderId'),
    temFbc: Boolean(texto('fbc')),
    temFbp: Boolean(texto('fbp')),
    nomeCliente: nomeDosCampos || sinais.nomeCliente,
    temFbclid: Boolean(texto('fbclid')) || sinais.temFbclid,
    temGclid: Boolean(texto('gclid')) || sinais.temGclid,
    temTtclid: sinais.temTtclid,
    temMsclkid: sinais.temMsclkid,
    emq: emq.nota,
    payload,
    status: modo === 'ignorar' ? 'ignorado' : 'novo',
  });

  // O relay não pode fazer o remetente receber erro.
  void transmitir('inbox.received', {
    entrada: {
      id: item.id,
      evento: item.evento,
      eventoOrigem: nomeOriginal,
      modo,
      valor: item.valor,
      moeda: item.moeda,
      orderId: item.orderId,
      emq: item.emq,
    },
  }, empresaId).catch(() => {});

  // A plataforma espera resposta rápida e tenta de novo se demorar. O disparo
  // roda depois da resposta, com after(), para o 202 sair em menos de 1 s.
  // Antes era "modo === 'auto'", e o disparo ia para TODAS as marcas da
  // regra. Agora entram no laco so os Pixels que aceitaram; se nenhum aceitou,
  // o after() nem e agendado e o item fica na fila — que e exatamente o
  // comportamento de hoje, com todo Switch desligado.
  //
  // 🔴 `!autoBloqueadoPorSuspeita` é a trava nova, e ela é a MAIS FRACA das
  // três de propósito: a regra e o Switch do Pixel dizem "não dispare este tipo
  // de evento"; esta diz "não dispare ESTE evento sozinho". O item continua na
  // fila, com a explicação na tela, e o botão "Disparar agora" continua sendo
  // uma saída — descartar uma venda que o console só ACHA que é teste seria
  // perder exatamente o que o produto existe para não perder.
  if (decisao.marcasAuto.length > 0 && eventoFinal && !autoBloqueadoPorSuspeita) {
    after(async () => {
      try {
        // A sonda substitui os campos: o `ping` chega vazio e um evento vazio
        // nao prova entrega. O item ja existe aqui, entao o id dele vira o
        // `event_id` — reenvio da plataforma deduplica em vez de duplicar.
        const camposDoDisparo = sonda
          ? { ...campos, ...camposDaSonda(request, texto('sourceUrl'), item.id) }
          : campos;
        await dispararItem({
          item,
          campos: camposDoDisparo,
          eventoMeta: eventoFinal,
          marcas: decisao.marcasAuto,
          origem: 'auto',
        });
      } catch (e) {
        console.error('[webhook] auto-dispatch falhou:', e);
      }
    });
  }

  return NextResponse.json(
    {
      ok: true,
      id: item.id,
      eventoOrigem: nomeOriginal,
      eventoMeta: eventoFinal ?? null,
      classificacao,
      modo,
      // O "modo" acima e o da regra e continua onde sempre esteve, para nao
      // quebrar quem ja le esta resposta. O que realmente aconteceu com cada
      // Pixel vem aqui do lado: sem isto, um 202 dizendo "auto" sem nada ter
      // sido enviado seria uma resposta que mente.
      modoPorMarca: decisao.modoPorMarca,
      // Pela mesma razão: com o automático ligado e a suspeita barrando, o
      // `modoPorMarca` acima diria "auto" e nada teria saído. Aditivo — quem já
      // lê esta resposta não vê diferença nenhuma quando não há suspeita.
      ...(autoBloqueadoPorSuspeita
        ? { autoBloqueadoPorSuspeita: true, motivoDeTeste: veredicto.motivo ?? null }
        : {}),
      regra: regra?.id ?? null,
      rotulo: rotuloRecebido,
      rotuloDivergente,
      emq: emq.nota,
    },
    { status: 202 }
  );
}

/**
 * Corpo que o console não conseguiu ler (não-JSON ou grande demais). Vira item
 * visível na caixa de entrada, sem evento nenhum e portanto sem como disparar.
 */
async function registrarNaoLido(params: {
  origem: string;
  empresaId: string;
  motivo: string;
  amostra: string;
  rotuloRecebido: string | null;
  rotuloDivergente: boolean;
}) {
  await registrarEntrada({
    origem: params.origem,
    empresaId: params.empresaId,
    temFbc: false,
    temFbp: false,
    // Explicitos, e nao ausentes: corpo que nao deu para ler nao tem sinal
    // nenhum, e deixar `temFbclid` undefined faria a releitura do disco tentar
    // achar fbclid dentro do envelope `__naoLido` (que so guarda uma amostra de
    // texto cru) toda vez que o processo subisse.
    temFbclid: false,
    temGclid: false,
    modo: 'ignorar',
    status: 'ignorado',
    classificacao: 'sem-evento',
    motivoIgnorar: 'nao-lido',
    formato: 'outro',
    rotuloRecebido: params.rotuloRecebido,
    rotuloDivergente: params.rotuloDivergente,
    payload: { __naoLido: true, motivo: params.motivo, amostra: params.amostra },
  }).catch(() => {});
}
