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

/** Janela que o painel sabe olhar. Nada de período livre: três botões bastam. */
export type Periodo = 7 | 30 | 90;

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
  periodoDias: Periodo;
  /** Quantos itens foram olhados. O teto da memória vale aqui e a tela diz isso. */
  amostra: number;
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
}

const PERIODOS: readonly Periodo[] = [7, 30, 90];

/** `?dias=` vindo da URL. Qualquer coisa fora dos três valores cai em 30. */
export function periodoValido(bruto: unknown): Periodo {
  const n = Number(bruto);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
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
 * Conta o que chegou, o que saiu e de onde veio.
 *
 * `agoraIso` entra por parâmetro (e não como `new Date()`) para o teste poder
 * fixar o relógio — sem isso, um caso de "40 dias atrás" passa hoje e falha
 * amanhã.
 */
export function resumirInbox(
  itens: ItemResumivel[],
  agoraIso: string,
  periodoDias: Periodo
): ResumoInbox {
  const agora = Date.parse(agoraIso);
  const inicio = agora - periodoDias * 24 * 60 * 60 * 1000;

  const noPeriodo = itens.filter((i) => {
    const t = Date.parse(i.recebidoEm);
    // Data ilegível não derruba o painel: fica de fora, caladamente.
    return Number.isFinite(t) && t >= inicio && t <= agora;
  });

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
    periodoDias,
    amostra: itens.length,
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
  };
}
