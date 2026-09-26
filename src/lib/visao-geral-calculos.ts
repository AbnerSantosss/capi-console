/**
 * As contas da Visão geral (V5 do plano v7): KPIs, funil, receita por dia,
 * qualidade, últimas conversões e o CSV do botão "Exportar".
 *
 * 🔴 PURO. Nada de React, store, `fetch` ou import de runtime do projeto: só
 * `import type`. É o que deixa `scripts/visao-geral-calculos.test.mjs` provar
 * cada número sem montar tela nenhuma, e o que deixa a tela e o CSV lerem a
 * MESMA conta (um número na tela e outro no arquivo seria o pior dos dois).
 *
 * Três regras valem para tudo aqui:
 *
 *  1. Denominador zero é `null`, nunca `0` nem `NaN`. A tela mostra "—".
 *  2. Dado que não existe é `null`, nunca `0`. `0` só quando a conta foi feita e
 *     deu zero (ex.: nenhum `InitiateCheckout` num período com eventos).
 *  3. Nada de PII. As linhas que saem daqui levam hora, evento, valor, moeda,
 *     status e `event_id` — nunca e-mail, telefone, nome, hash ou `payload`.
 */

import type { DiaDoResumo, ItemResumivel, ResumoInbox } from '@/lib/inbox-resumo';

/** O traço que a tela e o CSV mostram quando o número não existe. */
export const SEM_DADO = '—';

/**
 * Fuso do negócio. O mesmo `FUSO` de `inbox-resumo.ts` (a janela e os dias de
 * `porDia` são de Brasília). `Empresa` não tem fuso próprio, então a tela diz
 * "horário de Brasília" com todas as letras.
 */
const FUSO = 'America/Sao_Paulo';

/* ------------------------------------------------------------------ */
/* Fórmulas com denominador explícito                                  */
/* ------------------------------------------------------------------ */

function numero(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** `numerador ÷ denominador` em %, com uma casa. `null` com denominador 0 ou ausente. */
export function percentual(
  numerador: number | null | undefined,
  denominador: number | null | undefined
): number | null {
  if (!numero(numerador) || !numero(denominador) || denominador === 0) return null;
  return Math.round((numerador / denominador) * 1000) / 10;
}

/**
 * Aceitação pela Meta (R3 da revisão da V4): aceitos ÷ RESPONDIDOS
 * (`aceitos + recusados`), nunca ÷ enviados. Com os enviados no denominador,
 * 1 aceito e 3 recusados davam 100% ao lado de "3 recusados".
 */
export function aceitacao(aceitos: number, recusados: number): number | null {
  if (!numero(aceitos) || !numero(recusados)) return null;
  return percentual(aceitos, aceitos + recusados);
}

/** Valor ÷ compras, em centavos arredondados. `null` sem compra ou sem valor. */
export function ticketMedio(
  valor: number | null | undefined,
  compras: number | null | undefined
): number | null {
  if (!numero(valor) || !numero(compras) || compras <= 0) return null;
  return Math.round((valor / compras) * 100) / 100;
}

/**
 * Compras ÷ cliques. O console não recebe os cliques do anúncio, então nesta
 * rodada quem chama passa `null` e o resultado é sempre `null` ("—").
 */
export function conversaoTotal(
  compras: number | null | undefined,
  cliques: number | null | undefined
): number | null {
  if (!numero(cliques) || cliques <= 0) return null;
  return percentual(compras, cliques);
}

/** Variação % contra o período anterior. `null` sem anterior ou com anterior = 0. */
export function variacao(
  atual: number | null | undefined,
  anterior: number | null | undefined
): number | null {
  if (!numero(atual) || !numero(anterior) || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

/* ------------------------------------------------------------------ */
/* Formatação pt-BR                                                    */
/* ------------------------------------------------------------------ */

const INTEIRO_OU_UMA_CASA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Número em pt-BR (`19.640`, `6,4`). `casas` fixa o número de casas. Ausente = "—". */
export function formatarPtBr(n: number | null | undefined, casas?: number): string {
  if (!numero(n)) return SEM_DADO;
  if (casas === undefined) return INTEIRO_OU_UMA_CASA.format(n);
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(n);
}

/** `25,0%`, ou "—". */
export function formatarPercentual(p: number | null | undefined): string {
  return numero(p) ? `${formatarPtBr(p, 1)}%` : SEM_DADO;
}

/** `+28,0%` / `-12,5%`, ou "—". */
export function formatarVariacao(v: number | null | undefined): string {
  if (!numero(v)) return SEM_DADO;
  return `${v > 0 ? '+' : ''}${formatarPtBr(v, 1)}%`;
}

/**
 * Dinheiro em pt-BR. Sem centavos quando o valor é inteiro (`R$ 61.464`), com
 * dois quando não é. Código de moeda que o `Intl` não conhece vira "XYZ 10,50"
 * em vez de derrubar a tela.
 */
export function formatarMoeda(valor: number | null | undefined, moeda: string | null | undefined): string {
  if (!numero(valor)) return SEM_DADO;
  const casas = Number.isInteger(valor) ? 0 : 2;
  const codigo = typeof moeda === 'string' && moeda.trim() !== '' ? moeda.trim().toUpperCase() : 'BRL';
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: codigo,
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    }).format(valor);
  } catch {
    return `${codigo} ${formatarPtBr(valor, casas)}`;
  }
}

/* ------------------------------------------------------------------ */
/* Datas de Brasília                                                   */
/* ------------------------------------------------------------------ */

const RELOGIO = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface PartesDaData {
  ano: string;
  mes: string;
  dia: string;
  hora: number;
  minuto: number;
  segundo: number;
}

function partesDeBrasilia(iso: string | null | undefined): PartesDaData | null {
  if (typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const p = RELOGIO.formatToParts(new Date(t));
  const v = (tipo: string) => p.find((x) => x.type === tipo)?.value ?? '';
  return {
    ano: v('year'),
    mes: v('month'),
    dia: v('day'),
    hora: Number(v('hour')) % 24,
    minuto: Number(v('minute')),
    segundo: Number(v('second')),
  };
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** `HH:MM` de Brasília, ou "—". */
export function horaDeBrasilia(iso: string | null | undefined): string {
  const p = partesDeBrasilia(iso);
  return p ? `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}` : SEM_DADO;
}

/** `dd/mm/aaaa HH:MM` de Brasília, ou "—". */
export function dataHoraDeBrasilia(iso: string | null | undefined): string {
  const p = partesDeBrasilia(iso);
  return p ? `${p.dia}/${p.mes}/${p.ano} ${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}` : SEM_DADO;
}

/** `AAAA-MM-DD` de Brasília, ou `''`. */
export function diaDeBrasilia(iso: string | null | undefined): string {
  const p = partesDeBrasilia(iso);
  return p ? `${p.ano}-${p.mes}-${p.dia}` : '';
}

/** `AAAA-MM-DD` → `dd/mm`. */
export function diaMes(diaIso: string): string {
  const [, m, d] = diaIso.split('-');
  return m && d ? `${d}/${m}` : diaIso;
}

/** "24/09/2026 00:00 a 24/09/2026 10:15". A tela acrescenta o fuso por extenso. */
export function intervaloPorExtenso(janela: { inicio: string; fim: string }): string {
  return `${dataHoraDeBrasilia(janela.inicio)} a ${dataHoraDeBrasilia(janela.fim)}`;
}

/**
 * O primeiro dia de `porDia` é PARCIAL (R6 da revisão da V4)?
 *
 * Em "Últimos 7 dias" a janela começa na hora de agora, sete dias atrás, e o
 * primeiro ponto só tem as horas finais daquele dia. Ele é parcial quando é o
 * dia de `janela.inicio` e a janela NÃO começa à 00:00 de Brasília. Quando a
 * amostra não cobre a janela, `porDia` já tirou os dias incompletos do começo
 * (`contarPorDia`), e aí o primeiro da lista não é o dia do início.
 *
 * Devolve `{ desde: 'HH:MM' }` ou `null`.
 */
export function primeiroDiaParcial(
  janela: { inicio: string } | null | undefined,
  porDia: readonly DiaDoResumo[]
): { desde: string } | null {
  if (!janela || porDia.length === 0) return null;
  const p = partesDeBrasilia(janela.inicio);
  if (!p) return null;
  if (porDia[0].dia !== `${p.ano}-${p.mes}-${p.dia}`) return null;
  if (p.hora === 0 && p.minuto === 0 && p.segundo === 0) return null;
  return { desde: `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}` };
}

/* ------------------------------------------------------------------ */
/* Receita por dia                                                     */
/* ------------------------------------------------------------------ */

/**
 * Degraus "redondos" do eixo Y, de 0 até cobrir o `maximo`: 1, 2, 2,5 ou 5
 * vezes uma potência de 10, com 4 ou 5 marcas. `[0]` quando não há valor.
 */
export function degrausDoEixo(maximo: number, alvo = 4): number[] {
  if (!numero(maximo) || maximo <= 0) return [0];
  const bruto = maximo / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const fracao = bruto / potencia;
  const passo = (fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 2.5 ? 2.5 : fracao <= 5 ? 5 : 10) * potencia;
  const marcas = Math.ceil(maximo / passo - 1e-9);
  return Array.from({ length: marcas + 1 }, (_, i) => Math.round(i * passo * 100) / 100);
}

export interface PontoDaReceita {
  x: number;
  y: number;
  dia: string;
  receita: number;
  compras: number;
  /** Posição do dia em `porDia` (0 = o mais antigo). */
  indice: number;
}

export interface GraficoDaReceita {
  /** Só os dias com valor. Dia com `receita: null` não tem ponto. */
  pontos: PontoDaReceita[];
  /**
   * Trechos contínuos da linha. Um dia `null` no meio QUEBRA a linha em dois
   * trechos: a lacuna é a verdade ("moedas diferentes"), e ligar os vizinhos
   * por cima dela, ou descer a zero, desenharia um valor que ninguém mediu.
   */
  segmentos: PontoDaReceita[][];
  /** O `x` de cada dia de `porDia`, com ou sem valor (para o rótulo `dd/mm`). */
  xDosDias: number[];
  /** Marcas do eixo Y, de 0 ao topo. */
  degraus: number[];
  /** O valor que corresponde a `y = 0` (o alto do gráfico). */
  topo: number;
  /** Quantos dias estão sem valor (`receita: null`). */
  diasSemValor: number;
}

/**
 * As coordenadas do SVG da receita por dia, em `[0, largura] × [0, altura]`
 * (y cresce para baixo, como no SVG). Os dias ficam espaçados por igual; um
 * dia só fica no meio.
 */
export function pontosDaReceita(
  porDia: readonly DiaDoResumo[],
  largura: number,
  altura: number
): GraficoDaReceita {
  const valores = porDia.map((d) => d.receita).filter(numero);
  const degraus = degrausDoEixo(valores.length > 0 ? Math.max(...valores) : 0);
  const ultimo = degraus[degraus.length - 1];
  const topo = ultimo > 0 ? ultimo : 1;
  const n = porDia.length;
  const xDe = (i: number) => (n <= 1 ? largura / 2 : (i * largura) / (n - 1));

  const pontos: PontoDaReceita[] = [];
  const segmentos: PontoDaReceita[][] = [];
  let atual: PontoDaReceita[] = [];
  porDia.forEach((d, indice) => {
    if (!numero(d.receita)) {
      if (atual.length > 0) segmentos.push(atual);
      atual = [];
      return;
    }
    const ponto: PontoDaReceita = {
      x: Math.round(xDe(indice) * 100) / 100,
      y: Math.round((altura - (d.receita / topo) * altura) * 100) / 100,
      dia: d.dia,
      receita: d.receita,
      compras: d.compras,
      indice,
    };
    pontos.push(ponto);
    atual.push(ponto);
  });
  if (atual.length > 0) segmentos.push(atual);

  return {
    pontos,
    segmentos,
    xDosDias: porDia.map((_, i) => Math.round(xDe(i) * 100) / 100),
    degraus,
    topo,
    diasSemValor: porDia.filter((d) => d.receita === null).length,
  };
}

/**
 * A frase que o leitor de tela lê no lugar do gráfico (o `<desc>` do SVG):
 * "7 dias, de 17/09 a 23/09; total R$ 61.464; maior dia 21/09, R$ 12.300;
 * 1 dia sem dado."
 *
 * Com o primeiro dia parcial (R6), a frase diz "primeiro dia parcial" e esse
 * dia NÃO concorre a maior dia: ele só tem algumas horas, e ganhar ou perder
 * dele não diz nada. `moeda` é `receitaEnviada.moeda` (`null` quando o período
 * mistura moedas ou não teve venda enviada).
 */
export function resumoTextualDaReceita(
  porDia: readonly DiaDoResumo[],
  moeda: string | null | undefined,
  janela?: { inicio: string } | null
): string {
  if (porDia.length === 0) return 'Sem dado de receita no período.';
  const parcial = primeiroDiaParcial(janela, porDia);
  const n = porDia.length;
  const primeiro = diaMes(porDia[0].dia);
  const ultimo = diaMes(porDia[n - 1].dia);
  const partes: string[] = [
    `${n} ${n === 1 ? 'dia' : 'dias'}, ${n === 1 ? `em ${primeiro}` : `de ${primeiro} a ${ultimo}`}` +
      (parcial ? ` (primeiro dia parcial, desde ${parcial.desde})` : ''),
  ];

  const semDado = porDia.filter((d) => d.receita === null).length;
  const comValor = porDia.filter((d) => numero(d.receita));
  const total = Math.round(comValor.reduce((s, d) => s + (d.receita as number), 0) * 100) / 100;
  const codigo = moeda ?? 'BRL';
  if (!moeda && semDado > 0) partes.push('sem total: moedas diferentes');
  else partes.push(`total ${formatarMoeda(total, codigo)}`);

  let maiorDia: { dia: string; receita: number } | null = null;
  for (let i = parcial ? 1 : 0; i < porDia.length; i++) {
    const r = porDia[i].receita;
    if (!numero(r) || r <= 0) continue;
    if (maiorDia === null || r > maiorDia.receita) maiorDia = { dia: porDia[i].dia, receita: r };
  }
  if (maiorDia) partes.push(`maior dia ${diaMes(maiorDia.dia)}, ${formatarMoeda(maiorDia.receita, codigo)}`);
  else if (total === 0 && semDado === 0) partes.push('nenhum valor enviado');

  if (semDado > 0) partes.push(`${semDado} ${semDado === 1 ? 'dia sem dado' : 'dias sem dado'}`);
  return `${partes.join('; ')}.`;
}

/* ------------------------------------------------------------------ */
/* Os números da Visão geral (KPIs, funil, qualidade)                  */
/* ------------------------------------------------------------------ */

/**
 * Tudo o que a tela e o CSV mostram, lido do resumo da V4 numa conta só.
 *
 * Com `base = 0` (nenhum evento real no período) toda contagem é `null`: a
 * tela mostra "—" em cada bloco e o checklist diz o próximo passo.
 */
export interface NumerosDaVisaoGeral {
  /** `base > 0`: houve pelo menos um evento real no período. */
  temDado: boolean;
  /** Eventos com `fbclid` / com `fbc` no período. NÃO são cliques. */
  comFbclid: number | null;
  comFbc: number | null;
  paginas: number | null;
  checkouts: number | null;
  compras: number | null;
  /** Checkouts ÷ páginas, compras ÷ checkouts. */
  taxaCheckout: number | null;
  taxaCompra: number | null;
  /**
   * Soma do valor das compras reais do período (`resumo.compras.valor`).
   * `null` com moedas diferentes. Ver a nota em `numerosDaVisaoGeral`.
   */
  valorDasCompras: number | null;
  moedaDasCompras: string;
  ticket: number | null;
  variacaoPaginas: number | null;
  variacaoCheckouts: number | null;
  variacaoCompras: number | null;
  /** Qualidade (só envio real). */
  aceitos: number | null;
  recusados: number | null;
  respondidos: number | null;
  aceitacao: number | null;
  enviados: number | null;
  emTeste: number | null;
}

function recebidosDe(lista: ResumoInbox['porEventoMeta'] | undefined, nome: string): number {
  return lista?.find((e) => e.eventoMeta === nome)?.recebidos ?? 0;
}

/**
 * 🔴 "Valor das compras" vem de `compras.valor`, e não de `receitaEnviada`.
 *
 * `receitaEnviada` soma o valor de TODO evento real enviado que tem valor, e o
 * parser grava `value` em qualquer evento (`parser.ts`): um `AddPaymentInfo`
 * do PIX gerado ou um `InitiateCheckout` com valor, enviados por regra, entram
 * na mesma soma que a compra — e um cartão chamado "Valor das compras" diria o
 * dobro do que foi vendido. `compras.valor` é só `Purchase` (a régua de
 * `ehCompra`), real, e casa com o cartão "Compras" ao lado (`compras.total`).
 * O gráfico de receita por dia continua com `porDia.receita` e diz o que soma.
 */
export function numerosDaVisaoGeral(resumo: ResumoInbox): NumerosDaVisaoGeral {
  const temDado = resumo.base > 0;
  const se = (v: number): number | null => (temDado ? v : null);

  const paginas = recebidosDe(resumo.porEventoMeta, 'PageView');
  const checkouts = recebidosDe(resumo.porEventoMeta, 'InitiateCheckout');
  const compras = resumo.compras?.total ?? recebidosDe(resumo.porEventoMeta, 'Purchase');
  const valor = resumo.compras?.valor ?? null;
  const anterior = resumo.anterior ?? null;
  const aceitos = resumo.qualidade.aceitos;
  const recusados = resumo.qualidade.recusados;

  return {
    temDado,
    comFbclid: se(resumo.atribuicao.metaFbclid.total),
    comFbc: se(resumo.atribuicao.metaFbc.total),
    paginas: se(paginas),
    checkouts: se(checkouts),
    compras: se(compras),
    taxaCheckout: temDado ? percentual(checkouts, paginas) : null,
    taxaCompra: temDado ? percentual(compras, checkouts) : null,
    valorDasCompras: temDado ? valor : null,
    moedaDasCompras: resumo.compras?.moeda ?? resumo.receitaEnviada?.moeda ?? 'BRL',
    ticket: temDado ? ticketMedio(valor, compras) : null,
    variacaoPaginas:
      temDado && anterior ? variacao(paginas, recebidosDe(anterior.porEventoMeta, 'PageView')) : null,
    variacaoCheckouts:
      temDado && anterior
        ? variacao(checkouts, recebidosDe(anterior.porEventoMeta, 'InitiateCheckout'))
        : null,
    variacaoCompras:
      temDado && anterior ? variacao(compras, recebidosDe(anterior.porEventoMeta, 'Purchase')) : null,
    aceitos: se(aceitos),
    recusados: se(recusados),
    respondidos: se(aceitos + recusados),
    aceitacao: temDado ? aceitacao(aceitos, recusados) : null,
    enviados: se(resumo.volume.enviados.total),
    emTeste: se(resumo.volume.enviadosEmTeste),
  };
}

/**
 * A frase que o leitor de tela lê no lugar do funil: "Página 19.640 →
 * Checkout 1.248 (6,4%) → Compra 312 (25,0%); cliques indisponíveis".
 */
export function resumoTextualDoFunil(n: NumerosDaVisaoGeral): string {
  if (!n.temDado) return 'Nenhum evento real no período; cliques indisponíveis.';
  return (
    `Página ${formatarPtBr(n.paginas)} → Checkout ${formatarPtBr(n.checkouts)} (${formatarPercentual(n.taxaCheckout)}) ` +
    `→ Compra ${formatarPtBr(n.compras)} (${formatarPercentual(n.taxaCompra)}); cliques indisponíveis.`
  );
}

/* ------------------------------------------------------------------ */
/* Status de cada evento (espelho da régua de inbox-resumo.ts)         */
/* ------------------------------------------------------------------ */

/**
 * 🟠 ESPELHO de `aceitoPelaMeta`, `duplicadoReal`, `temAceiteReal`,
 * `enviadoSoEmTeste` e `recusadoDeVerdade` de `inbox-resumo.ts` (que não os
 * exporta, e este arquivo só importa tipo). O teste
 * `visao-geral-calculos.test.mjs` confere que a contagem daqui bate com a de
 * `resumirInbox` na mesma fixture: se uma régua mudar lá, o teste avisa.
 */
interface ResultadoLido {
  status?: string;
  httpStatus?: number;
  eventsReceived?: number;
  modoTeste?: boolean;
}

function lerResultados(i: Pick<ItemResumivel, 'resultados'>): ResultadoLido[] {
  const saida: ResultadoLido[] = [];
  for (const bruto of i.resultados ?? []) {
    if (typeof bruto !== 'object' || bruto === null) continue;
    const r = bruto as Record<string, unknown>;
    saida.push({
      status: typeof r.status === 'string' ? r.status : undefined,
      httpStatus: typeof r.httpStatus === 'number' ? r.httpStatus : undefined,
      eventsReceived: typeof r.eventsReceived === 'number' ? r.eventsReceived : undefined,
      modoTeste: typeof r.modoTeste === 'boolean' ? r.modoTeste : undefined,
    });
  }
  return saida;
}

const aceitoPelaMeta = (r: ResultadoLido) =>
  r.status === 'enviado' || (r.httpStatus === 200 && (r.eventsReceived ?? 0) > 0);
const duplicadoReal = (r: ResultadoLido) => r.status === 'duplicado' && r.modoTeste !== true;

function temAceiteReal(i: Pick<ItemResumivel, 'resultados'>): boolean {
  return lerResultados(i).some((r) => (aceitoPelaMeta(r) && r.modoTeste !== true) || duplicadoReal(r));
}

function soEmTeste(i: Pick<ItemResumivel, 'status' | 'resultados'>): boolean {
  if (i.status !== 'disparado') return false;
  const lidos = lerResultados(i);
  if (lidos.some(duplicadoReal)) return false;
  const aceitos = lidos.filter(aceitoPelaMeta);
  return aceitos.length > 0 && aceitos.every((r) => r.modoTeste === true);
}

function recusadoPelaMeta(i: Pick<ItemResumivel, 'status' | 'resultados'>): boolean {
  // Aceite em Pixel de teste não apaga a recusa do Pixel real (R1 da V4).
  if (temAceiteReal(i)) return false;
  return lerResultados(i).some(
    (r) => r.modoTeste !== true && typeof r.httpStatus === 'number' && !aceitoPelaMeta(r)
  );
}

/** Teste da equipe ou da plataforma: fora de toda métrica. */
export function ehTesteInterno(i: Pick<ItemResumivel, 'testeInterno' | 'testePlataforma'>): boolean {
  return i.testeInterno === true || i.testePlataforma === true;
}

/** O evento foi aceito pela Meta num Pixel real (a régua de `qualidade.aceitos`)? */
export function aceitoDeVerdade(i: Pick<ItemResumivel, 'status' | 'resultados'>): boolean {
  return i.status === 'disparado' && temAceiteReal(i);
}

/** A Meta respondeu e não aceitou, num Pixel real (a régua de `qualidade.recusados`)? */
export function recusadoDeVerdade(i: Pick<ItemResumivel, 'status' | 'resultados'>): boolean {
  return recusadoPelaMeta(i);
}

export type StatusDaConversao = 'aceito' | 'enviado' | 'teste' | 'recusado' | 'fila' | 'ignorado';

/** O rótulo da coluna Status. A cor acompanha, mas o texto vem sempre. */
export const ROTULO_DO_STATUS: Record<StatusDaConversao, string> = {
  aceito: 'Aceito',
  enviado: 'Enviado',
  teste: 'Só em teste',
  recusado: 'Recusado',
  fila: 'Na fila',
  ignorado: 'Ignorado',
};

/**
 * A situação do evento, na mesma régua do resumo:
 *  - `aceito`: disparado com aceite de Pixel real;
 *  - `teste`: disparado, mas só chegou ao "Testar eventos";
 *  - `enviado`: disparado sem resposta gravada (item antigo, sem `resultados`);
 *  - `recusado`: a Meta respondeu sem aceitar, num Pixel real, e nenhum Pixel
 *    real aceitou (fica na fila com o erro gravado, por isso vem antes de
 *    `fila`). Vem antes de tudo: [produção `erro`, teste `enviado`] é
 *    recusa, não "só em teste" (R1 da V4), e a contagem bate com o resumo;
 *  - `ignorado`, `fila`.
 */
export function statusDaConversao(i: ItemResumivel): StatusDaConversao {
  if (recusadoPelaMeta(i)) return 'recusado';
  if (i.status === 'disparado') {
    if (soEmTeste(i)) return 'teste';
    return temAceiteReal(i) ? 'aceito' : 'enviado';
  }
  if (i.status === 'ignorado') return 'ignorado';
  return 'fila';
}

/* ------------------------------------------------------------------ */
/* Últimas conversões                                                  */
/* ------------------------------------------------------------------ */

/** Um item de `GET /api/inbox`, só com o que esta conta lê. */
export interface ItemDaAtividade extends ItemResumivel {
  id: string;
  empresaId?: string;
  /** O `event_id` que vai (ou foi) para a Meta, derivado pela rota. */
  eventId?: string;
}

/** Uma linha de "Últimas conversões". Nada de PII: é tudo o que sai daqui. */
export interface LinhaDeConversao {
  id: string;
  recebidoEm: string;
  /** O evento da Meta (`Purchase`, `InitiateCheckout`...). */
  evento: string;
  /**
   * O nome que a origem usou (`eventoOrigem ?? evento`): é por ELE que o
   * `?evento=` da aba Eventos filtra (`/api/inbox/pessoas`). R4: o link usa
   * este nome, nunca o `event_id`.
   */
  nomeDoEvento: string;
  valor: number | null;
  moeda: string | null;
  status: StatusDaConversao;
  eventId: string | null;
}

/**
 * Visita não é conversão: estes três eventos da tag chegam a cada página
 * aberta e, na lista, empurrariam as vendas para fora das cinco linhas.
 */
const EVENTOS_DE_VISITA = new Set(['PageView', 'ViewContent', 'Search']);

function eventoMetaDoItem(i: ItemResumivel): string | undefined {
  if (typeof i.eventoMeta === 'string' && i.eventoMeta !== '') return i.eventoMeta;
  // Sem `eventoMeta`: a régua de `ehCompra` ainda reconhece a compra pelo nome.
  return i.evento === 'Purchase' ? 'Purchase' : undefined;
}

/**
 * As últimas `quantas` conversões da empresa dentro da janela: sem teste da
 * equipe nem da plataforma, sem visita, só com evento da Meta. A mais nova
 * primeiro.
 */
export function ultimasConversoes(
  itens: readonly ItemDaAtividade[],
  janela: { inicio: string; fim: string },
  empresaId: string,
  quantas = 5
): LinhaDeConversao[] {
  const inicio = Date.parse(janela.inicio);
  const fim = Date.parse(janela.fim);
  const escolhidos: Array<{ t: number; item: ItemDaAtividade; evento: string }> = [];
  for (const item of itens) {
    if ((item.empresaId ?? 'default') !== empresaId) continue;
    if (ehTesteInterno(item)) continue;
    const t = Date.parse(item.recebidoEm);
    if (!Number.isFinite(t) || t < inicio || t > fim) continue;
    const evento = eventoMetaDoItem(item);
    if (!evento || EVENTOS_DE_VISITA.has(evento)) continue;
    escolhidos.push({ t, item, evento });
  }
  return escolhidos
    .sort((a, b) => b.t - a.t)
    .slice(0, quantas)
    .map(({ item, evento }) => ({
      id: String(item.id),
      recebidoEm: item.recebidoEm,
      evento,
      nomeDoEvento: item.eventoOrigem ?? item.evento ?? 'sem nome de evento',
      valor: numero(item.valor) ? item.valor : null,
      moeda: numero(item.valor) ? (item.moeda ?? 'BRL') : null,
      status: statusDaConversao(item),
      eventId: typeof item.eventId === 'string' && item.eventId !== '' ? item.eventId : null,
    }));
}

/* ------------------------------------------------------------------ */
/* CSV do botão "Exportar"                                             */
/* ------------------------------------------------------------------ */

const BOM = '﻿';
const SEPARADOR = ';';

/**
 * Uma célula do CSV. Texto que começa com `=`, `+`, `-` ou `@` ganha um
 * apóstrofo na frente (o Excel executaria como fórmula); célula com `;`, aspas
 * ou quebra de linha vai entre aspas.
 */
function celula(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return SEM_DADO;
  let texto = typeof v === 'number' ? (numero(v) ? String(v).replace('.', ',') : SEM_DADO) : v;
  if (typeof v === 'string' && /^[=+\-@]/.test(texto)) texto = `'${texto}`;
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const linhaCsv = (...celulas: Array<string | number | null | undefined>) => celulas.map(celula).join(SEPARADOR);

/** `visao-geral-<slug>-<inicio>-<fim>.csv`, com as datas de Brasília. */
export function nomeDoCsv(slug: string, janela: { inicio: string; fim: string }): string {
  const limpo = slug.replace(/[^a-z0-9-]/gi, '') || 'empresa';
  return `visao-geral-${limpo}-${diaDeBrasilia(janela.inicio)}-${diaDeBrasilia(janela.fim)}.csv`;
}

export interface DadosDoCsv {
  empresa: { nome: string; slug: string };
  resumo: ResumoInbox;
  /** As linhas de "Últimas conversões" já na tela (`ultimasConversoes`). */
  linhas: readonly LinhaDeConversao[];
}

/** A linha de aviso quando a leitura não alcançou o começo do período (R5). */
export const AVISO_DE_AMOSTRA =
  'Período maior que a memória do console: os números mostram só os eventos mais recentes.';

/**
 * O texto do CSV, gerado no navegador com o que JÁ está na tela: cabeçalho
 * (empresa, período, fuso e o aviso de amostra), KPIs, Funil, Qualidade e
 * Últimas conversões. BOM UTF-8 para o Excel abrir os acentos, `;` como
 * separador (o Excel em pt-BR usa a vírgula como decimal).
 *
 * 🔴 De cada linha só saem hora, evento, valor, moeda, status e `event_id`,
 * lidos campo a campo: um objeto com e-mail, telefone ou hash a mais não leva
 * nada disso para o arquivo.
 */
export function csvDaVisaoGeral({ empresa, resumo, linhas }: DadosDoCsv): string {
  const n = numerosDaVisaoGeral(resumo);
  const moeda = n.moedaDasCompras;
  const saida: string[] = [];

  saida.push(linhaCsv('Visão geral', empresa.nome, empresa.slug));
  saida.push(linhaCsv('Período', dataHoraDeBrasilia(resumo.janela.inicio), dataHoraDeBrasilia(resumo.janela.fim)));
  saida.push(linhaCsv('Fuso', 'horário de Brasília'));
  if (resumo.amostraCobreJanela === false) saida.push(linhaCsv('Aviso', AVISO_DE_AMOSTRA));
  saida.push('');

  saida.push(linhaCsv('KPIs'));
  saida.push(linhaCsv('Indicador', 'Valor', 'Complemento'));
  saida.push(
    linhaCsv(
      'Cliques',
      'indisponível',
      n.temDado
        ? `o console não recebe os cliques do anúncio; ${n.comFbclid} eventos com fbclid, ${n.comFbc} com fbc`
        : 'o console não recebe os cliques do anúncio'
    )
  );
  saida.push(linhaCsv('Visualizações de página', n.paginas, 'dos cliques: —'));
  saida.push(linhaCsv('Inícios de checkout', n.checkouts, `das visitas: ${formatarPercentual(n.taxaCheckout)}`));
  saida.push(linhaCsv('Compras', n.compras, `dos checkouts: ${formatarPercentual(n.taxaCompra)}`));
  saida.push(
    linhaCsv('Valor das compras', n.valorDasCompras, `${moeda}; ticket médio: ${formatarMoeda(n.ticket, moeda)}`)
  );
  saida.push('');

  saida.push(linhaCsv('Funil'));
  saida.push(linhaCsv('Etapa', 'Quantidade', 'Taxa da etapa anterior'));
  saida.push(linhaCsv('Cliques', 'indisponível', SEM_DADO));
  saida.push(linhaCsv('Página', n.paginas, SEM_DADO));
  saida.push(linhaCsv('Checkout', n.checkouts, formatarPercentual(n.taxaCheckout)));
  saida.push(linhaCsv('Compra', n.compras, formatarPercentual(n.taxaCompra)));
  saida.push(linhaCsv('Conversão total', SEM_DADO, 'compras ÷ cliques; sem fonte de cliques'));
  saida.push('');

  saida.push(linhaCsv('Qualidade'));
  saida.push(linhaCsv('Indicador', 'Valor'));
  saida.push(linhaCsv('Aceitos pela Meta', n.aceitos));
  saida.push(linhaCsv('Respondidos pela Meta', n.respondidos));
  saida.push(linhaCsv('Recusados pela Meta', n.recusados));
  saida.push(linhaCsv('Enviados (reais)', n.enviados));
  saida.push(linhaCsv('Enviados só em teste', n.emTeste));
  saida.push(linhaCsv('Aceitação (aceitos de respondidos)', formatarPercentual(n.aceitacao)));
  saida.push('');

  saida.push(linhaCsv('Últimas conversões'));
  saida.push(linhaCsv('hora', 'evento', 'valor', 'moeda', 'status', 'event_id'));
  for (const l of linhas) {
    const status = ROTULO_DO_STATUS[l.status as StatusDaConversao] ?? SEM_DADO;
    saida.push(
      linhaCsv(
        dataHoraDeBrasilia(typeof l.recebidoEm === 'string' ? l.recebidoEm : null),
        typeof l.evento === 'string' ? l.evento : SEM_DADO,
        numero(l.valor) ? l.valor : null,
        typeof l.moeda === 'string' ? l.moeda : null,
        status,
        typeof l.eventId === 'string' ? l.eventId : null
      )
    );
  }

  return `${BOM}${saida.join('\r\n')}\r\n`;
}
