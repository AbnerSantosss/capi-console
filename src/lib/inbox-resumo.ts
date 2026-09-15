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
    enviados: CardContagem;
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
    /** Média do EMQ dos enviados que têm nota. `null` quando não há nenhum. */
    emqMedio: number | null;
    enviadosComEmq: number;
  };
  /** Os oito nomes de evento mais frequentes, do maior para o menor. */
  porEvento: Array<{ evento: string; total: number; pct: number | null }>;
  /** Soma do valor dos enviados — só quando há UMA moeda; senão `null`. */
  receitaEnviada: { total: number; moeda: string } | null;
  /**
   * COMPRA — o evento que paga a conta, separado de todos os outros.
   *
   * Está fora de `porEvento` de propósito: lá ele é o quarto ou quinto item de
   * uma lista ordenada por frequência, do lado de `ViewContent`, e é justamente
   * o número que ninguém deveria precisar procurar.
   */
  compras: ComprasDoPeriodo;
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
  /** Quantas dessas compras a Meta já aceitou (status `disparado`). */
  enviadas: number;
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
 * livre. Qualquer coisa fora disso cai em 30.
 *
 * As duas datas mandam mais que `dias` quando ambas são válidas — quem
 * preencheu o calendário está pedindo aquele intervalo, e não o botão que
 * ficou marcado antes.
 */
export function periodoValido(bruto: unknown, de?: unknown, ate?: unknown): Periodo {
  if (dataIsoValida(de) && dataIsoValida(ate)) {
    // Ordem invertida é engano óbvio de quem preencheu, e as duas datas dizem
    // sem ambiguidade qual intervalo a pessoa quer ver. Trocar é entregar o
    // pedido; cair no padrão de 30 dias seria devolver outro número sem avisar.
    return de <= ate ? { de, ate } : { de: ate, ate: de };
  }
  if (bruto === 'hoje' || bruto === 'ontem') return bruto;
  const n = Number(bruto);
  return (PERIODOS as readonly unknown[]).includes(n) ? (n as Periodo) : 30;
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

/** Clique da Meta — o que faz uma compra poder ser lida como resultado de campanha. */
function temCliqueDaMeta(i: ItemResumivel): boolean {
  return i.temFbclid === true || i.temFbc === true;
}

/**
 * Quantidade e valor de um punhado de compras. Valor `null` quando há mais de
 * uma moeda dentro — ver `ValorDeCompras`.
 */
function somar(itens: ItemResumivel[], moedaUnica: string | null): ValorDeCompras {
  if (moedaUnica === null) return { total: itens.length, valor: null };
  const soma = itens.reduce(
    (s, i) => (typeof i.valor === 'number' && Number.isFinite(i.valor) ? s + i.valor : s),
    0
  );
  return { total: itens.length, valor: Math.round(soma * 100) / 100 };
}

/**
 * Conta o que chegou, o que saiu e de onde veio.
 *
 * `agoraIso` entra por parâmetro (e não como `new Date()`) para o teste poder
 * fixar o relógio — sem isso, um caso de "40 dias atrás" passa hoje e falha
 * amanhã.
 */
export function resumirInbox(
  itens: ItemResumivel[],
  agoraIso: string,
  periodo: Periodo,
  tetoDaAmostra: number = Number.POSITIVE_INFINITY
): ResumoInbox {
  const agora = Date.parse(agoraIso);
  const { inicio, fim } = janelaDoPeriodo(agora, periodo);

  const noPeriodo = itens.filter((i) => {
    const t = Date.parse(i.recebidoEm);
    // Data ilegível não derruba o painel: fica de fora, caladamente.
    return Number.isFinite(t) && t >= inicio && t <= fim;
  });

  // A amostra só cobre a janela se ela alcança algo ANTERIOR ao início dela.
  // Com a amostra no teto e o item mais antigo já dentro do período, existe
  // evento do período que ficou de fora da leitura — e aí o número é um piso,
  // não um total.
  const tempos = itens.map((i) => Date.parse(i.recebidoEm)).filter((t) => Number.isFinite(t));
  const maisAntigo = tempos.length > 0 ? Math.min(...tempos) : Number.NEGATIVE_INFINITY;
  const amostraCobreJanela = itens.length < tetoDaAmostra || maisAntigo <= inicio;

  const testes = noPeriodo.filter(ehTeste);
  const reais = noPeriodo.filter((i) => !ehTeste(i));
  const base = reais.length;

  const enviados = reais.filter((i) => i.status === 'disparado');
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
  const moedaDeCompra = moedasDeCompra.size === 1 ? [...moedasDeCompra][0] : null;
  const comprasComClique = compras.filter(temCliqueDaMeta);
  const comprasSemClique = compras.filter((i) => !temCliqueDaMeta(i));

  const comValor = enviados.filter((i) => typeof i.valor === 'number' && Number.isFinite(i.valor));
  const moedas = new Set(comValor.map((i) => i.moeda ?? 'BRL'));
  const receitaEnviada =
    moedas.size === 1
      ? {
          total: Math.round(comValor.reduce((s, i) => s + (i.valor as number), 0) * 100) / 100,
          moeda: [...moedas][0],
        }
      : null;

  return {
    periodo,
    janela: { inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString() },
    amostra: itens.length,
    amostraCobreJanela,
    base,
    volume: {
      recebidos: noPeriodo.length,
      enviados: card(enviados.length, base),
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
    qualidade: { emqMedio, enviadosComEmq: comEmq.length },
    porEvento,
    receitaEnviada,
    compras: {
      ...somar(compras, moedaDeCompra),
      moeda: moedaDeCompra,
      enviadas: compras.filter((i) => i.status === 'disparado').length,
      atribuidasMeta: somar(comprasComClique, moedaDeCompra),
      semAtribuicaoMeta: somar(comprasSemClique, moedaDeCompra),
    },
  };
}
