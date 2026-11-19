'use client';

/**
 * Os 4 indicadores da Visão geral (HyperFrames E1; redesenho de 18/11/2026),
 * nesta ordem: Páginas vistas · Checkouts · Compras · Faturado. Desenhados com
 * a `FaixaDeKpis`: um painel só, alinhado à esquerda, sem ícone e sem fundo
 * colorido. O Faturado se destaca pela posição (a última célula), não pela cor.
 *
 * Só dado real:
 *  - Não há cartão de cliques: o console não recebe os cliques do anúncio. Em
 *    "Páginas vistas" entra a linha "{N} com clique de anúncio" (eventos que
 *    chegaram com `fbclid`), só com dado; são eventos, nunca pessoas.
 *  - Sem evento real no período (`base = 0`), todo número é "—".
 *  - Variação só quando o período anterior veio e não era zero (`variacao()`);
 *    senão nada, nem seta.
 *
 * Os números vêm prontos de `numerosDaVisaoGeral` (a mesma conta do CSV).
 * Enquanto não vêm (`numeros = null`), a faixa fica com o esqueleto no lugar
 * do valor e a altura não muda. O `rodape` (a trilha Site → Pixel → CAPI →
 * Meta) aparece nos dois casos.
 */

import type { ReactNode } from 'react';
import { FaixaDeKpis, type ItemDaFaixa } from '@/components/common/FaixaDeKpis';
import { cn } from '@/lib/utils';
import {
  SEM_DADO,
  formatarMoeda,
  formatarPercentual,
  formatarPtBr,
  formatarVariacao,
  type NumerosDaVisaoGeral,
} from '@/lib/visao-geral-calculos';

/** " · +12% contra o período anterior", ou nada. */
function Variacao({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  const tom = valor > 0 ? 'text-success' : valor < 0 ? 'text-danger' : 'text-fg-muted';
  return (
    <span title="Contra o período anterior">
      {' · '}
      <span className={cn('font-semibold', tom)}>{formatarVariacao(valor)}</span>
      <span className="sr-only"> contra o período anterior</span>
    </span>
  );
}

/** "R$ 61.464": o símbolo menor, o número no tamanho dos outros. */
function Dinheiro({ valor, moeda }: { valor: number | null; moeda: string }) {
  const texto = formatarMoeda(valor, moeda);
  const inicioDoNumero = texto.search(/\d/);
  if (valor === null || inicioDoNumero <= 0) return <>{texto}</>;
  return (
    <>
      <span className="mr-1 text-title font-semibold text-fg-body">{texto.slice(0, inicioDoNumero).trim()}</span>
      {texto.slice(inicioDoNumero)}
    </>
  );
}

/** Os rótulos, nesta ordem; o esqueleto usa os mesmos. */
const ROTULOS = ["Páginas vistas", "Checkouts", "Compras", "Faturado"] as const;

function itensDaFaixa(n: NumerosDaVisaoGeral): ItemDaFaixa[] {
  const moedasDiferentes = n.temDado && n.compras !== null && n.compras > 0 && n.valorDasCompras === null;
  const detalheDoFaturado: ReactNode = moedasDiferentes ? (
    'compras em moedas diferentes: sem soma'
  ) : (
    <>
      Ticket médio{' '}
      <span className="font-semibold text-fg-body">{formatarMoeda(n.ticket, n.moedaDasCompras)}</span>
    </>
  );

  return [
    {
      rotulo: ROTULOS[0],
      valor: formatarPtBr(n.paginas),
      // Eventos com fbclid: NÃO são cliques nem pessoas (o console não recebe os cliques).
      detalhe: (
        <>
          {n.temDado ? (
            <span title="Eventos que chegaram com fbclid; não são cliques nem pessoas">
              <span className="font-semibold text-fg-body">{formatarPtBr(n.comFbclid)}</span> com clique de anúncio
            </span>
          ) : (
            SEM_DADO
          )}
          <Variacao valor={n.variacaoPaginas} />
        </>
      ),
    },
    {
      rotulo: ROTULOS[1],
      valor: formatarPtBr(n.checkouts),
      detalhe: (
        <>
          {formatarPercentual(n.taxaCheckout)} das páginas
          <Variacao valor={n.variacaoCheckouts} />
        </>
      ),
    },
    {
      rotulo: ROTULOS[2],
      valor: formatarPtBr(n.compras),
      detalhe: (
        <>
          {formatarPercentual(n.taxaCompra)} dos checkouts
          <Variacao valor={n.variacaoCompras} />
        </>
      ),
    },
    {
      rotulo: ROTULOS[3],
      valor: <Dinheiro valor={n.valorDasCompras} moeda={n.moedaDasCompras} />,
      detalhe: detalheDoFaturado,
    },
  ];
}

export function Kpis({
  numeros,
  rodape,
}: {
  /** `null` enquanto os números do período não chegaram. */
  numeros: NumerosDaVisaoGeral | null;
  /** A trilha Site → Pixel → CAPI → Meta, embaixo das células. */
  rodape?: ReactNode;
}) {
  const itens: ItemDaFaixa[] = numeros
    ? itensDaFaixa(numeros)
    : ROTULOS.map((rotulo) => ({ rotulo, valor: SEM_DADO, detalhe: ' ' }));

  return (
    <section aria-label="Indicadores do período" className="tabular-nums">
      <FaixaDeKpis itens={itens} rodape={rodape} carregando={numeros === null} />
    </section>
  );
}
