/**
 * Resumo da caixa de entrada para o Painel de eventos.
 *
 * Função PURA: recebe itens já lidos e devolve contagens. Não lê arquivo, não
 * conhece empresa (quem chama já filtrou por empresa) e não dispara nada.
 *
 * Módulo NEUTRO de propósito — sem `import 'server-only'` — para que
 * `scripts/inbox-resumo.test.mjs` consiga importá-lo direto, do mesmo jeito que
 * `inbox-sinais.ts` faz.
 *
 * 🔴 Regra 4 do CLAUDE.md: teste da equipe e teste da plataforma ficam FORA da
 * base das porcentagens e viram um card próprio. Métrica com teste dentro é
 * métrica mentirosa.
 */

/**
 * Período livre escolhido no calendário: duas datas de Brasília em
 * `AAAA-MM-DD`, INCLUSIVAS nas duas pontas — escolher 01 a 01 conta o dia 01
 * inteiro, não zero segundo.
 */
export interface PeriodoPersonalizado {
  de: string;
  ate: string;
}

/**
 * Janela que o painel sabe olhar.
 *
 * Os números são janela CORRIDA (`30` = as últimas 720 horas). `'hoje'` e
 * `'ontem'` são DIA DE CALENDÁRIO — "hoje" começa à meia-noite, não 24 horas
 * atrás. São coisas diferentes de propósito: quem abre o painel às 9h da manhã
 * quer ver o que entrou desde que o dia virou, não o que entrou desde ontem
 * às 9h. O objeto é o período livre, também em dia de calendário.
 */
export type Periodo = 'hoje' | 'ontem' | 7 | 30 | 90 | PeriodoPersonalizado;

export function ehPeriodoPersonalizado(p: Periodo): p is PeriodoPersonalizado {
  return typeof p === 'object' && p !== null;
}

/**
 * O mínimo do item que o resumo precisa — espelho PARCIAL de `ItemInbox`, de
 * propósito sem `payload`: o resumo é contagem, não carrega PII.
 */
export interface ItemResumivel {
  recebidoEm: string;
  status: 'novo' | 'carregado' | 'disparado' | 'ignorado';
  evento?: string;
  eventoOrigem?: string;
  eventoMeta?: string;
  temFbc: boolean;
  temFbp: boolean;
  temFbclid?: boolean;
  temGclid?: boolean;
  temTtclid?: boolean;
  temMsclkid?: boolean;
  emq?: number;
  testeInterno?: boolean;
  testePlataforma?: boolean;
  valor?: number;
  moeda?: string;
  /**
   * O que cada Pixel respondeu no último disparo do item. É daqui que sai a
   * diferença entre "a Meta aceitou" e "foi só para o Testar eventos" (C9,
   * D20). Ausente em item gravado antes de o campo existir.
   *
   * `unknown` porque é assim que `ItemInbox.resultados` chega (`inbox.ts`): a
   * linha vem de um arquivo gravado em disco, e cada elemento é lido campo a
   * campo por `comoResultado`, como `ResultadoResumivel`.
   */
  resultados?: ReadonlyArray<unknown>;
}

/**
 * Um resultado por Pixel, só com o que o resumo lê — os MESMOS nomes de campo
 * de `ResultadoPorPixel` (`inbox.ts`). Nada de PII: status, números da
 * resposta da Meta e se o Pixel estava com código de teste.
 */
export interface ResultadoResumivel {
  /** `'enviado'` quando a Meta aceitou; `'duplicado'`, `'erro'`, etc. no resto. */
  status?: string;
  httpStatus?: number;
  eventsReceived?: number;
  /** O Pixel tinha código de teste: o evento foi para o "Testar eventos". */
  modoTeste?: boolean;
}

export interface CardContagem {
  total: number;
  /** Porcentagem sobre `base`, de 0 a 100 com uma casa. `null` quando base = 0. */
  pct: number | null;
}

export interface ResumoInbox {
  /** Exatamente o período pedido, de volta — a tela usa para saber se já recarregou. */
  periodo: Periodo;
  /** De quando até quando a conta olhou, em ISO. A tela mostra por extenso. */
  janela: { inicio: string; fim: string };
  /** Quantos itens foram olhados. O teto da memória vale aqui e a tela diz isso. */
  amostra: number;
  /**
   * `false` quando a amostra bateu o teto E o item mais antigo dela já é mais
   * novo que o início da janela: existe evento dentro do período que a conta
   * não chegou a ver. A tela precisa dizer isso com todas as letras — número
   * incompleto com cara de completo é o pior resultado que este painel pode
   * produzir.
   */
  amostraCobreJanela: boolean;
  /** Eventos REAIS no período: o denominador de toda porcentagem. */
  base: number;
  volume: {
    recebidos: number;
    /** Só envio REAL: o que foi só para o "Testar eventos" está em `enviadosEmTeste`. */
    enviados: CardContagem;
    /**
     * Eventos reais que a Meta só recebeu em MODO TESTE (Pixel com código de
     * teste): aparecem no "Testar eventos", não contam conversão e não ensinam
     * a campanha. Ficam fora de `enviados`, de `receitaEnviada` e do EMQ médio,
     * e a tela diz quantos são (C9, D20).
     */
    enviadosEmTeste: number;
    naFila: CardContagem;
    ignorados: CardContagem;
    /** Fora da base, sempre. */
    testesEquipe: number;
  };
  atribuicao: {
    metaFbclid: CardContagem;
    metaFbc: CardContagem;
    google: CardContagem;
    tiktok: CardContagem;
    microsoft: CardContagem;
    semAtribuicao: CardContagem;
  };
  qualidade: {
    /** Média do EMQ dos enviados REAIS que têm nota. `null` quando não há nenhum. */
    emqMedio: number | null;
    enviadosComEmq: number;
    /**
     * Enviados REAIS com prova de que a Meta aceitou num Pixel sem código de
     * teste: um resultado aceito (`httpStatus 200` com `eventsReceived > 0`, ou
     * `status 'enviado'`, que nasce dessa mesma conta) com `modoTeste !== true`,
     * ou um `duplicado` real (R1). Subconjunto de `volume.enviados`.
     */
    aceitos: number;
    /**
     * Eventos reais que a Meta RESPONDEU sem aceitar (4xx/5xx, ou 200 sem
     * evento recebido) num Pixel real, e sem nenhum aceite real.
     *
     * 🔴 Não é "enviado sem aceite": a recusa NÃO vira `disparado`
     * (`auto-dispatch.ts` só marca quando algum Pixel deu `enviado`), então o
     * item recusado fica na fila com o erro gravado — e é contado aqui em
     * qualquer situação. O que não é resposta da Meta (sem token, Pixel
     * desligado, erro de rede) e o item antigo sem `resultados` não entram:
     * não há resposta da Meta para contar. Só-teste também não entra.
     *
     * Por isso `aceitos + recusados` pode ser menor que `enviados`: a taxa de
     * aceite honesta é `aceitos / (aceitos + recusados)`.
     */
    recusados: number;
  };
  /** Os oito nomes de evento mais frequentes, do maior para o menor. */
  porEvento: Array<{ evento: string; total: number; pct: number | null }>;
  /**
   * Soma do valor dos enviados REAIS — só quando há UMA moeda; senão `null`.
   * Envio em modo teste fica de fora: não é dinheiro que a Meta contou.
   */
  receitaEnviada: { total: number; moeda: string } | null;
  /**
   * COMPRA — o evento que paga a conta, separado de todos os outros.
   *
   * Está fora de `porEvento` de propósito: lá ele é o quarto ou quinto item de
   * uma lista ordenada por frequência, do lado de `ViewContent`, e é justamente
   * o número que ninguém deveria precisar procurar.
   */
  compras: ComprasDoPeriodo;
  /**
   * Por evento DA META (`PageView`, `InitiateCheckout`, `Purchase`...), sem
   * teste da equipe nem da plataforma. É a fonte dos KPIs da Visão geral.
   *
   * Diferente de `porEvento`, que agrupa pelo nome da ORIGEM e corta em oito:
   * aqui a chave é `eventoMeta` e a lista vem inteira. Item sem `eventoMeta`
   * só entra quando é compra (a régua de `ehCompra`), para `Purchase` bater
   * com `compras.total`; nome cru sem evento da Meta fica de fora. Evento que
   * não chegou no período não aparece (nada de linha com zero inventada).
   */
  porEventoMeta: ContagemPorEventoMeta[];
  /**
   * Um registro por dia de Brasília da janela, do mais antigo ao mais novo, sem
   * teste da equipe nem da plataforma (a soma de `recebidos` é `base`).
   *
   * Dia que a leitura não cobriu inteiro (`amostraCobreJanela === false` e o
   * dia começa antes do item mais antigo lido) SAI da lista: aparecer como 0
   * seria número inventado.
   */
  porDia: DiaDoResumo[];
  /**
   * A mesma conta na janela imediatamente anterior, do mesmo tamanho — só
   * quando a rota pede `comparar=1`; sem isso fica `undefined` e nada é
   * calculado. `null` quando a amostra lida não alcança a janela anterior
   * inteira: comparar com um número incompleto inventaria uma queda.
   */
  anterior?: ResumoAnterior | null;
}

export interface ContagemPorEventoMeta {
  eventoMeta: string;
  /** Reais recebidos no período, em qualquer situação. */
  recebidos: number;
  /** Dos recebidos, quantos a Meta aceitou de verdade (a régua de `qualidade.aceitos`). */
  aceitos: number;
}

export interface DiaDoResumo {
  /** `AAAA-MM-DD` em Brasília. */
  dia: string;
  recebidos: number;
  aceitos: number;
  /**
   * Soma do valor dos enviados REAIS do dia (o mesmo recorte de
   * `receitaEnviada`), na moeda de `receitaEnviada.moeda`. `0` quando o dia não
   * teve venda enviada. `null` quando o dia mistura moedas — ou quando o valor
   * dele está numa moeda que não é a moeda única da janela: um dia em real e
   * outro em dólar no mesmo eixo não é dinheiro nenhum.
   */
  receita: number | null;
  /** Compras reais recebidas no dia, em qualquer situação (a régua de `ehCompra`). */
  compras: number;
}

export interface ResumoAnterior {
  /** A janela anterior, em ISO: termina antes de a janela atual começar. */
  janela: { inicio: string; fim: string };
  /** Mesmo sentido de `volume.recebidos`. */
  recebidos: number;
  /** Mesmo sentido de `volume.enviados.total`. */
  enviados: number;
  /** Mesmo sentido de `qualidade.aceitos`. */
  aceitos: number;
  receitaEnviada: { total: number; moeda: string } | null;
  porEventoMeta: ContagemPorEventoMeta[];
}

/** O que a rota pode pedir além do período. */
export interface OpcoesDoResumo {
  /** Calcula `anterior` (a janela anterior, do mesmo tamanho). */
  comparar?: boolean;
  /**
   * Instante (ms) em que a memória GLOBAL da caixa começa, quando ela está no
   * teto (`inicioDaMemoriaNoTeto` de `inbox.ts`). Antes dele pode faltar item
   * desta empresa, mesmo com a lista dela bem abaixo de `tetoDaAmostra` (R2 da
   * V4). Ausente ou `null`: a memória tem tudo.
   */
  memoriaComecaEm?: number | null;
}

export interface ValorDeCompras {
  /** Quantas compras. Sempre confiável. */
  total: number;
  /**
   * Soma dos valores — `null` quando as compras do recorte estão em mais de uma
   * moeda, pela mesma razão de `receitaEnviada`: somar real com dólar dá um
   * número que não é dinheiro nenhum.
   */
  valor: number | null;
}

export interface ComprasDoPeriodo extends ValorDeCompras {
  /** Moeda única do período, quando existe. A tela formata com ela. */
  moeda: string | null;
  /**
   * Quantas dessas compras a Meta já aceitou DE VERDADE (status `disparado`,
   * sem ser só em modo teste).
   */
  enviadas: number;
  /** Quantas foram só para o "Testar eventos" — fora de `enviadas` (C9, D20). */
  enviadasEmTeste: number;
  /**
   * O recorte que PODE ser lido como resultado de campanha: compra que trouxe
   * clique da Meta (`fbclid` ou `fbc`).
   *
   * 🔴 O critério aqui é mais estreito que o do bloco `atribuicao` acima, e é
   * deliberado. Lá "sem atribuição" significa nenhum dos cinco sinais — uma
   * compra vinda do Google conta como atribuída. Campanha, nesta tela, é
   * campanha DA META: contar uma venda do Google no ROAS do Gerenciador seria
   * exatamente o número mentiroso que este bloco existe para evitar.
   */
  atribuidasMeta: ValorDeCompras;
  /**
   * O resto — e ele NÃO é lixo.
   *
   * É a venda PIX que o Pixel do navegador perdeu, que é a razão de o produto
   * existir. Ela continua sendo enviada à Meta (a Meta é quem reconcilia pelo
   * `fbp`, pelo e-mail e pelo telefone); o que ela não faz é entrar no número
   * que a tela chama de resultado de campanha.
   */
  semAtribuicaoMeta: ValorDeCompras;
}

const PERIODOS: readonly Periodo[] = ['hoje', 'ontem', 7, 30, 90];

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `AAAA-MM-DD` que EXISTE no calendário.
 *
 * O teste de ida e volta pelo `Date` é o que recusa `2026-02-30` e `2026-13-01`
 * — a expressão regular sozinha aceita os dois, e uma data impossível viraria
 * silenciosamente outro dia.
 */
export function dataIsoValida(bruto: unknown): bruto is string {
  if (typeof bruto !== 'string' || !DATA_ISO.test(bruto)) return false;
  const [a, m, d] = bruto.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * O período pedido na URL: `?dias=` para os cinco fixos, `?de=&ate=` para o
 * livre. Qualquer coisa fora disso cai em "hoje".
 *
 * As duas datas mandam mais que `dias` quando ambas são válidas — quem
 * preencheu o calendário está pedindo aquele intervalo, e não o botão que
 * ficou marcado antes.
 */
export function periodoValido(bruto: unknown, de?: unknown, ate?: unknown): Periodo {
  if (dataIsoValida(de) && dataIsoValida(ate)) {
    // Ordem invertida é engano óbvio de quem preencheu, e as duas datas dizem
    // sem ambiguidade qual intervalo a pessoa quer ver. Trocar é entregar o
    // pedido; cair no padrão de "hoje" seria devolver outro número sem avisar.
    return de <= ate ? { de, ate } : { de: ate, ate: de };
  }
  if (bruto === 'hoje' || bruto === 'ontem') return bruto;
  const n = Number(bruto);
  return (PERIODOS as readonly unknown[]).includes(n) ? (n as Periodo) : 'hoje';
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Fuso do negócio. O container pode rodar em UTC; "hoje" tem que ser o hoje de
 * quem está olhando a tela, em Brasília, senão das 21h à meia-noite o painel
 * mostraria o dia seguinte.
 */
const FUSO = 'America/Sao_Paulo';

const RELOGIO_LOCAL = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * Quanto o relógio de Brasília está à frente do UTC, em ms, naquele instante.
 * Sai negativo (−3 h hoje). Calculado, e não fixo em −3, para não quebrar se o
 * horário de verão voltar.
 */
function deslocamentoDoFuso(ts: number): number {
  const p = RELOGIO_LOCAL.formatToParts(new Date(ts));
  const n = (tipo: string) => Number(p.find((x) => x.type === tipo)?.value ?? 0);
  const comoSeFosseUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
  return comoSeFosseUtc - Math.floor(ts / 1000) * 1000;
}

/** Meia-noite de Brasília do dia que contém `ts`, recuado `recuo` dias, em ms UTC. */
function meiaNoiteLocal(ts: number, recuo: number): number {
  const desloc = deslocamentoDoFuso(ts);
  const local = ts + desloc;
  return Math.floor(local / DIA_MS) * DIA_MS - recuo * DIA_MS - desloc;
}

/** Meia-noite de Brasília do dia `AAAA-MM-DD`, em ms UTC. */
function meiaNoiteDaData(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number);
  const comoSeFosseUtc = Date.UTC(a, m - 1, d);
  // Duas passadas: a primeira usa o fuso do palpite, a segunda o fuso do
  // instante já corrigido. Só muda alguma coisa na noite em que o relógio
  // vira — e é exatamente essa noite que uma passada só erraria em uma hora.
  const primeira = comoSeFosseUtc - deslocamentoDoFuso(comoSeFosseUtc);
  return comoSeFosseUtc - deslocamentoDoFuso(primeira);
}

const RELOGIO_DATA = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Que dia `AAAA-MM-DD` era em Brasília naquele instante.
 *
 * A tela usa para o `max` dos campos de data: ninguém escolhe amanhã, e o
 * "amanhã" de quem está com o notebook em outro fuso não vale — o dia do
 * negócio é o de Brasília.
 */
export function dataLocalIso(ts: number): string {
  const p = RELOGIO_DATA.formatToParts(new Date(ts));
  const v = (tipo: string) => p.find((x) => x.type === tipo)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

/**
 * De quando até quando o painel conta, dado o período pedido.
 *
 * Número = janela corrida terminando agora. `'hoje'` = da meia-noite até agora.
 * `'ontem'` = o dia inteiro anterior, fechado — não encosta em hoje. Período
 * livre = da meia-noite de `de` até o último milissegundo de `ate`.
 */
export function janelaDoPeriodo(agora: number, periodo: Periodo): { inicio: number; fim: number } {
  if (ehPeriodoPersonalizado(periodo)) {
    const inicio = meiaNoiteDaData(periodo.de);
    // `ate` é INCLUSIVO — o dia escolhido conta inteiro. Nunca passa de agora:
    // escolher até hoje não pode abrir uma janela no futuro.
    const fim = meiaNoiteDaData(periodo.ate) + DIA_MS - 1;
    return { inicio, fim: Math.min(fim, agora) };
  }
  if (periodo === 'hoje') return { inicio: meiaNoiteLocal(agora, 0), fim: agora };
  if (periodo === 'ontem') {
    const inicio = meiaNoiteLocal(agora, 1);
    return { inicio, fim: meiaNoiteLocal(agora, 0) - 1 };
  }
  return { inicio: agora - periodo * DIA_MS, fim: agora };
}

/** `AAAA-MM-DD` menos `n` dias de calendário. */
function diaIsoMenos(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}

/**
 * A janela imediatamente anterior, do mesmo tamanho, que termina 1 ms antes de
 * a atual começar.
 *
 * Número = a mesma janela corrida recuada N dias (`[inicio − N d, inicio)`).
 * Dia de calendário (`'hoje'`, `'ontem'`, período livre) recua em DIAS de
 * Brasília e mantém a duração: "hoje até as 9h" compara com "ontem até as 9h",
 * não com o dia de ontem inteiro — senão toda manhã pareceria uma queda.
 */
function janelaAnterior(periodo: Periodo, inicio: number, fim: number): { inicio: number; fim: number } {
  let inicioAnterior: number;
  if (typeof periodo === 'number') {
    inicioAnterior = inicio - periodo * DIA_MS;
  } else {
    const dias = ehPeriodoPersonalizado(periodo)
      ? Math.round((Date.parse(`${periodo.ate}T00:00:00Z`) - Date.parse(`${periodo.de}T00:00:00Z`)) / DIA_MS) + 1
      : 1;
    inicioAnterior = meiaNoiteDaData(diaIsoMenos(dataLocalIso(inicio), dias));
  }
  return { inicio: inicioAnterior, fim: Math.min(inicioAnterior + (fim - inicio), inicio - 1) };
}

function pct(parte: number, base: number): number | null {
  if (base === 0) return null;
  return Math.round((parte / base) * 1000) / 10;
}

function card(parte: number, base: number): CardContagem {
  return { total: parte, pct: pct(parte, base) };
}

/** Mesma regra da tela: o nome que veio da origem, senão o traduzido, senão um texto honesto. */
function nomeDoEvento(i: ItemResumivel): string {
  return i.eventoOrigem ?? i.evento ?? 'sem nome de evento';
}

function ehTeste(i: ItemResumivel): boolean {
  return i.testeInterno === true || i.testePlataforma === true;
}

/**
 * É uma compra?
 *
 * Olha o evento da META, não o nome que a plataforma usou: `purchase_approved`,
 * `checkout.session.completed` e `order_approved` são a mesma coisa vista de
 * três plataformas, e o parser já reduziu as três a `Purchase`.
 *
 * Item com regra `ignorar` não tem `eventoMeta` e fica de fora — está certo:
 * compra que o operador mandou ignorar não é resultado de campanha nenhuma.
 *
 * Exportada porque a tela de `/painel/compras` precisa aplicar EXATAMENTE a
 * mesma régua que produziu o número em que a pessoa clicou.
 */
export function ehCompra(i: Pick<ItemResumivel, 'evento' | 'eventoMeta'>): boolean {
  return i.eventoMeta === 'Purchase' || i.evento === 'Purchase';
}

/**
 * A Meta aceitou o evento neste Pixel?
 *
 * `status === 'enviado'` é como o disparo grava o aceite, e ele nasce de
 * `httpStatus 200` com `eventsReceived > 0` (`auto-dispatch.ts`). As duas
 * formas valem porque dizem a mesma coisa: o resumo não depende de um campo
 * só para reconhecer um aceite.
 */
function aceitoPelaMeta(r: ResultadoResumivel): boolean {
  return r.status === 'enviado' || (r.httpStatus === 200 && (r.eventsReceived ?? 0) > 0);
}

/**
 * Lê um elemento de `resultados` campo a campo. Campo com tipo errado some, em
 * vez de virar verdade: um `modoTeste: "true"` em texto não prova teste nenhum.
 */
function comoResultado(bruto: unknown): ResultadoResumivel | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const r = bruto as Record<string, unknown>;
  return {
    status: typeof r.status === 'string' ? r.status : undefined,
    httpStatus: typeof r.httpStatus === 'number' ? r.httpStatus : undefined,
    eventsReceived: typeof r.eventsReceived === 'number' ? r.eventsReceived : undefined,
    modoTeste: typeof r.modoTeste === 'boolean' ? r.modoTeste : undefined,
  };
}

/**
 * O item saiu como `disparado`, mas SÓ chegou à Meta em modo teste?
 *
 * É teste quando existe pelo menos um aceite e TODOS os aceites vieram de Pixel
 * com código de teste. Um aceite real em qualquer Pixel basta para o item ser
 * envio real.
 *
 * 🔴 Sem nenhum aceite na lista, o item NÃO vira teste. O registro de
 * resultados é sobrescrito a cada disparo: uma venda real disparada de novo
 * fica só com `duplicado`, e "todos os aceites são teste" numa lista vazia
 * seria verdade por vacuidade — tiraria de "Enviados" uma venda que foi. Item
 * antigo, sem `resultados`, também segue como real: não há como saber, e é a
 * mesma regra do dedup (ausência de `modoTeste` = envio real).
 *
 * 🔴 `duplicado` de Pixel REAL (`modoTeste !== true`) também prova envio real
 * (R1 da C9, feito na V4): `duplicado` é "este evento já foi aceito pela Meta
 * neste Pixel" (`auto-dispatch.ts`). Numa regra com um Pixel em produção e
 * outro em teste, a venda disparada de novo fica com
 * [produção `duplicado`, teste `enviado`] — e sem esta regra ela viraria "só
 * teste" e sumiria do valor enviado, embora a Meta já tenha contado a venda.
 *
 * Exportada para a tela que abre a lista do card aplicar a MESMA régua.
 */
export function enviadoSoEmTeste(i: Pick<ItemResumivel, 'status' | 'resultados'>): boolean {
  if (i.status !== 'disparado') return false;
  const lidos = lerResultados(i);
  if (lidos.some(duplicadoReal)) return false;
  const aceitos = lidos.filter(aceitoPelaMeta);
  return aceitos.length > 0 && aceitos.every((r) => r.modoTeste === true);
}

/** Os resultados do item já lidos campo a campo, sem os elementos ilegíveis. */
function lerResultados(i: Pick<ItemResumivel, 'resultados'>): ResultadoResumivel[] {
  return (i.resultados ?? []).map(comoResultado).filter((r): r is ResultadoResumivel => r !== null);
}

/** `duplicado` num Pixel sem código de teste: a Meta já tinha aceitado ali, de verdade. */
function duplicadoReal(r: ResultadoResumivel): boolean {
  return r.status === 'duplicado' && r.modoTeste !== true;
}

/**
 * Algum Pixel REAL provou que a Meta aceitou: aceite com `modoTeste !== true`
 * ou `duplicado` real. Os nomes lidos são os de `ResultadoPorPixel`
 * (`httpStatus`, `eventsReceived`); `events_received` não existe no log e não
 * vira aceite.
 */
function temAceiteReal(i: Pick<ItemResumivel, 'resultados'>): boolean {
  return lerResultados(i).some((r) => (aceitoPelaMeta(r) && r.modoTeste !== true) || duplicadoReal(r));
}

/** Enviado REAL e aceito: `disparado` com aceite de Pixel real (ver `qualidade.aceitos`). */
function aceitoDeVerdade(i: ItemResumivel): boolean {
  return i.status === 'disparado' && temAceiteReal(i);
}

/**
 * A Meta respondeu e NÃO aceitou, num Pixel real, sem aceite real em outro
 * Pixel (ver `qualidade.recusados`). Só vale resposta com `httpStatus`: falta
 * de token ou erro de rede não chegou à Meta.
 *
 * 🔴 Aceite em Pixel de TESTE não apaga a recusa do Pixel real (R1 da V4):
 * com [produção `erro` 400, teste `enviado`] o item é "só em teste" no
 * volume, mas a produção recusou — com o token vencido, a Qualidade diria
 * "0 recusados" enquanto a produção recusa tudo.
 */
function recusadoDeVerdade(i: ItemResumivel): boolean {
  if (temAceiteReal(i)) return false;
  return lerResultados(i).some(
    (r) => r.modoTeste !== true && typeof r.httpStatus === 'number' && !aceitoPelaMeta(r)
  );
}

/** Clique da Meta — o que faz uma compra poder ser lida como resultado de campanha. */
function temCliqueDaMeta(i: ItemResumivel): boolean {
  return i.temFbclid === true || i.temFbc === true;
}

/**
 * Quantidade e valor de um punhado de compras. Valor `null` SÓ quando o recorte
 * tem mais de uma moeda dentro — ver `ValorDeCompras`. Recorte vazio soma zero:
 * não ter compra nenhuma não é misturar moeda.
 */
function somar(itens: ItemResumivel[], misturouMoedas: boolean): ValorDeCompras {
  if (misturouMoedas) return { total: itens.length, valor: null };
  const soma = itens.reduce(
    (s, i) => (typeof i.valor === 'number' && Number.isFinite(i.valor) ? s + i.valor : s),
    0
  );
  return { total: itens.length, valor: Math.round(soma * 100) / 100 };
}

function temValor(i: ItemResumivel): boolean {
  return typeof i.valor === 'number' && Number.isFinite(i.valor);
}

/** Valor dos enviados — só com UMA moeda; senão (ou sem valor nenhum) `null`. */
function somarReceita(enviados: ItemResumivel[]): { total: number; moeda: string } | null {
  const comValor = enviados.filter(temValor);
  const moedas = new Set(comValor.map((i) => i.moeda ?? 'BRL'));
  if (moedas.size !== 1) return null;
  return {
    total: Math.round(comValor.reduce((s, i) => s + (i.valor as number), 0) * 100) / 100,
    moeda: [...moedas][0],
  };
}

/** O evento da Meta do item, ou `undefined` quando não há (ver `porEventoMeta`). */
function eventoMetaDoItem(i: ItemResumivel): string | undefined {
  if (typeof i.eventoMeta === 'string' && i.eventoMeta !== '') return i.eventoMeta;
  return ehCompra(i) ? 'Purchase' : undefined;
}

function contarPorEventoMeta(reais: ItemResumivel[]): ContagemPorEventoMeta[] {
  const mapa = new Map<string, { recebidos: number; aceitos: number }>();
  for (const i of reais) {
    const nome = eventoMetaDoItem(i);
    if (!nome) continue;
    const c = mapa.get(nome) ?? { recebidos: 0, aceitos: 0 };
    c.recebidos++;
    if (aceitoDeVerdade(i)) c.aceitos++;
    mapa.set(nome, c);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[1].recebidos - a[1].recebidos || a[0].localeCompare(b[0]))
    .map(([eventoMeta, c]) => ({ eventoMeta, recebidos: c.recebidos, aceitos: c.aceitos }));
}

/**
 * O recorte de uma janela, com a mesma régua para a atual e para a anterior.
 * Data ilegível fica de fora, caladamente: não derruba o painel.
 */
function recortar(itens: ItemResumivel[], inicio: number, fim: number) {
  const noPeriodo = itens.filter((i) => {
    const t = Date.parse(i.recebidoEm);
    return Number.isFinite(t) && t >= inicio && t <= fim;
  });
  const reais = noPeriodo.filter((i) => !ehTeste(i));
  // `disparado` também é marcado quando o único aceite veio de um Pixel em
  // modo teste. Esse envio foi para o "Testar eventos", não conta conversão, e
  // por isso sai de `enviados` — e, com ele, da receita e do EMQ (C9, D20).
  const disparados = reais.filter((i) => i.status === 'disparado');
  const enviados = disparados.filter((i) => !enviadoSoEmTeste(i));
  return { noPeriodo, reais, disparados, enviados };
}

/** O dia seguinte a `AAAA-MM-DD`, pelo calendário (sem fuso: é só a data). */
function proximoDiaIso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Os dias de Brasília da janela, cada um com as suas contagens.
 *
 * `lidoDesde` é o instante a partir do qual a amostra é completa: dia que
 * começa (dentro da janela) antes dele sai da lista, porque parte dele não foi
 * lida. `moedaDaJanela` é `receitaEnviada.moeda` — ver `DiaDoResumo.receita`.
 */
function contarPorDia(
  reais: ItemResumivel[],
  enviados: ItemResumivel[],
  inicio: number,
  fim: number,
  lidoDesde: number,
  moedaDaJanela: string | null
): DiaDoResumo[] {
  const dias = new Map<string, DiaDoResumo & { soma: number; moedas: Set<string> }>();
  if (inicio <= fim) {
    const ultimo = dataLocalIso(fim);
    for (let d = dataLocalIso(inicio); d <= ultimo; d = proximoDiaIso(d)) {
      if (Math.max(meiaNoiteDaData(d), inicio) < lidoDesde) continue;
      dias.set(d, { dia: d, recebidos: 0, aceitos: 0, receita: 0, compras: 0, soma: 0, moedas: new Set() });
    }
  }
  const doDia = (i: ItemResumivel) => dias.get(dataLocalIso(Date.parse(i.recebidoEm)));
  for (const i of reais) {
    const c = doDia(i);
    if (!c) continue;
    c.recebidos++;
    if (aceitoDeVerdade(i)) c.aceitos++;
    if (ehCompra(i)) c.compras++;
  }
  for (const i of enviados) {
    const c = doDia(i);
    if (!c || !temValor(i)) continue;
    c.soma += i.valor as number;
    c.moedas.add(i.moeda ?? 'BRL');
  }
  return [...dias.values()].map(({ dia, recebidos, aceitos, compras, soma, moedas }) => ({
    dia,
    recebidos,
    aceitos,
    receita:
      moedas.size === 0
        ? 0
        : moedas.size === 1 && moedaDaJanela !== null && moedas.has(moedaDaJanela)
          ? Math.round(soma * 100) / 100
          : null,
    compras,
  }));
}

/**
 * Conta o que chegou, o que saiu e de onde veio.
 *
 * `agoraIso` entra por parâmetro (e não como `new Date()`) para o teste poder
 * fixar o relógio — sem isso, um caso de "40 dias atrás" passa hoje e falha
 * amanhã.
 *
 * `opcoes.comparar` liga o cálculo de `anterior` (a rota passa com
 * `?comparar=1`). Sem ele, a janela anterior nem é olhada.
 */
export function resumirInbox(
  itens: ItemResumivel[],
  agoraIso: string,
  periodo: Periodo,
  tetoDaAmostra: number = Number.POSITIVE_INFINITY,
  opcoes: OpcoesDoResumo = {}
): ResumoInbox {
  const agora = Date.parse(agoraIso);
  const { inicio, fim } = janelaDoPeriodo(agora, periodo);

  // A amostra só cobre a janela se ela alcança algo ANTERIOR ao início dela.
  // Com a amostra no teto e o item mais antigo já dentro do período, existe
  // evento do período que ficou de fora da leitura — e aí o número é um piso,
  // não um total.
  //
  // Dois tetos: o da lista desta empresa (`tetoDaAmostra`) e o da memória
  // global da caixa (`opcoes.memoriaComecaEm`, R2 da V4). Cada teto que bateu
  // corta a leitura num começo; vale o MAIS NOVO dos começos que cortaram.
  // Lista abaixo do teto não corta nada: o item mais antigo dela é só o mais
  // antigo que a empresa tem.
  const tempos = itens.map((i) => Date.parse(i.recebidoEm)).filter((t) => Number.isFinite(t));
  const listaNoTeto = itens.length >= tetoDaAmostra;
  const memoriaComecaEm =
    typeof opcoes.memoriaComecaEm === 'number' && Number.isFinite(opcoes.memoriaComecaEm)
      ? opcoes.memoriaComecaEm
      : null;
  let maisAntigo = Number.NEGATIVE_INFINITY;
  if (listaNoTeto && tempos.length > 0) maisAntigo = Math.min(...tempos);
  if (memoriaComecaEm !== null) maisAntigo = Math.max(maisAntigo, memoriaComecaEm);
  const amostraNoTeto = listaNoTeto || memoriaComecaEm !== null;
  const amostraCobreJanela = !amostraNoTeto || maisAntigo <= inicio;

  const { noPeriodo, reais, disparados, enviados } = recortar(itens, inicio, fim);
  const testes = noPeriodo.filter(ehTeste);
  const base = reais.length;
  const enviadosEmTeste = disparados.filter(enviadoSoEmTeste);
  const naFila = reais.filter((i) => i.status === 'novo' || i.status === 'carregado');
  const ignorados = reais.filter((i) => i.status === 'ignorado');

  // Sem atribuição = nenhum dos cinco sinais. Um evento pode ter vários, então
  // os cards de atribuição NÃO somam 100% — a tela avisa isso.
  const semAtribuicao = reais.filter(
    (i) => !i.temFbclid && !i.temFbc && !i.temGclid && !i.temTtclid && !i.temMsclkid
  );

  const comEmq = enviados.filter((i) => typeof i.emq === 'number' && Number.isFinite(i.emq));
  const emqMedio =
    comEmq.length === 0
      ? null
      : Math.round((comEmq.reduce((s, i) => s + (i.emq as number), 0) / comEmq.length) * 10) / 10;

  const contagem = new Map<string, number>();
  for (const i of reais) {
    const nome = nomeDoEvento(i);
    contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
  }
  const porEvento = [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([evento, total]) => ({ evento, total, pct: pct(total, base) }));

  // Compras do período, já sem teste da equipe nem da plataforma (elas saíram
  // em `reais`). É esse recorte que o card de destaque mostra e que a rota
  // `/painel/compras` reconstrói item a item.
  const compras = reais.filter(ehCompra);
  const moedasDeCompra = new Set(
    compras.filter((i) => typeof i.valor === 'number' && Number.isFinite(i.valor)).map((i) => i.moeda ?? 'BRL')
  );
  // `> 1` e não `!== 1`: um recorte SEM nenhuma compra com valor não misturou
  // moeda nenhuma — ele só não tem dinheiro para somar, e a soma de nada é
  // zero. Tratar os dois casos como o mesmo fazia o painel de um período com
  // zero compras exibir o aviso de "moedas diferentes", que é falso.
  const misturouMoedas = moedasDeCompra.size > 1;
  const moedaDeCompra = moedasDeCompra.size === 1 ? [...moedasDeCompra][0] : null;
  const comprasComClique = compras.filter(temCliqueDaMeta);
  const comprasSemClique = compras.filter((i) => !temCliqueDaMeta(i));

  const receitaEnviada = somarReceita(enviados);
  const porDia = contarPorDia(
    reais,
    enviados,
    inicio,
    fim,
    amostraCobreJanela ? Number.NEGATIVE_INFINITY : maisAntigo,
    receitaEnviada?.moeda ?? null
  );

  return {
    periodo,
    janela: { inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString() },
    amostra: itens.length,
    amostraCobreJanela,
    base,
    volume: {
      recebidos: noPeriodo.length,
      enviados: card(enviados.length, base),
      enviadosEmTeste: enviadosEmTeste.length,
      naFila: card(naFila.length, base),
      ignorados: card(ignorados.length, base),
      testesEquipe: testes.length,
    },
    atribuicao: {
      metaFbclid: card(reais.filter((i) => i.temFbclid === true).length, base),
      metaFbc: card(reais.filter((i) => i.temFbc === true).length, base),
      google: card(reais.filter((i) => i.temGclid === true).length, base),
      tiktok: card(reais.filter((i) => i.temTtclid === true).length, base),
      microsoft: card(reais.filter((i) => i.temMsclkid === true).length, base),
      semAtribuicao: card(semAtribuicao.length, base),
    },
    qualidade: {
      emqMedio,
      enviadosComEmq: comEmq.length,
      aceitos: enviados.filter(aceitoDeVerdade).length,
      recusados: reais.filter(recusadoDeVerdade).length,
    },
    porEvento,
    receitaEnviada,
    compras: {
      ...somar(compras, misturouMoedas),
      moeda: moedaDeCompra,
      enviadas: compras.filter((i) => i.status === 'disparado' && !enviadoSoEmTeste(i)).length,
      enviadasEmTeste: compras.filter(enviadoSoEmTeste).length,
      atribuidasMeta: somar(comprasComClique, misturouMoedas),
      semAtribuicaoMeta: somar(comprasSemClique, misturouMoedas),
    },
    porEventoMeta: contarPorEventoMeta(reais),
    porDia,
    ...(opcoes.comparar === true
      ? { anterior: resumirAnterior(itens, periodo, inicio, fim, amostraNoTeto, maisAntigo) }
      : {}),
  };
}

/**
 * A janela anterior (ver `ResumoInbox.anterior`), com a MESMA régua da atual:
 * `recortar`, `aceitoDeVerdade`, `somarReceita`, `contarPorEventoMeta`.
 */
function resumirAnterior(
  itens: ItemResumivel[],
  periodo: Periodo,
  inicio: number,
  fim: number,
  amostraNoTeto: boolean,
  maisAntigo: number
): ResumoAnterior | null {
  const janela = janelaAnterior(periodo, inicio, fim);
  // Mesma conta de `amostraCobreJanela`, para o início da janela anterior.
  if (amostraNoTeto && maisAntigo > janela.inicio) return null;
  const { noPeriodo, reais, enviados } = recortar(itens, janela.inicio, janela.fim);
  return {
    janela: { inicio: new Date(janela.inicio).toISOString(), fim: new Date(janela.fim).toISOString() },
    recebidos: noPeriodo.length,
    enviados: enviados.length,
    aceitos: enviados.filter(aceitoDeVerdade).length,
    receitaEnviada: somarReceita(enviados),
    porEventoMeta: contarPorEventoMeta(reais),
  };
}
