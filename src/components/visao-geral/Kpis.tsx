'use client';

/**
 * Os 4 indicadores da Visão geral (HyperFrames E1), nesta ordem: Páginas
 * vistas · Checkouts · Compras · Faturado. Centrados, mesma altura, número
 * grande em peso 700 com algarismos tabulares, SEM ícone.
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
 */

import type { ReactNode } from 'react';
import consoleStyles from '@/components/layout/console.module.css';
import { cn } from '@/lib/utils';
import {
  formatarMoeda,
  formatarPercentual,
  formatarPtBr,
  formatarVariacao,
  type NumerosDaVisaoGeral,
} from '@/lib/visao-geral-calculos';

/** O número grande. Em cartão estreito (celular) desce para `text-data`. */
const NUMERO =
  'text-data font-bold tabular-nums tracking-tight text-fg-strong @min-[12.5rem]:text-display';

function Variacao({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  const tom = valor > 0 ? 'text-success' : valor < 0 ? 'text-danger' : 'text-fg-muted';
  return (
    <p className="text-caption tabular-nums">
      <span className={cn('font-semibold', tom)}>{formatarVariacao(valor)}</span>{' '}
      <span className="text-fg-muted">contra o período anterior</span>
    </p>
  );
}

function CartaoKpi({
  rotulo,
  valor,
  children,
  destaque = false,
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  children?: ReactNode;
  /** O cartão "Faturado": com o fundo verde discreto. */
  destaque?: boolean;
  className?: string;
}) {
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col items-center gap-2 px-3 py-4 text-center @container sm:px-4 sm:py-5',
        destaque
          ? 'rounded-panel border border-line bg-surface-success'
          : consoleStyles.painel,
        className
      )}
    >
      <h3 className={cn('text-label font-semibold', destaque ? 'text-success' : 'text-fg-body')}>
        {rotulo}
      </h3>
      <div className="flex min-h-14 w-full items-center justify-center">{valor}</div>
      <div
        className={cn(
          'flex flex-col items-center gap-1 text-caption',
          destaque ? 'text-fg-body' : 'text-fg-muted'
        )}
      >
        {children}
      </div>
    </li>
  );
}

/** "R$ 61.464": o símbolo menor, o número no tamanho grande. */
function Dinheiro({ valor, moeda }: { valor: number | null; moeda: string }) {
  const texto = formatarMoeda(valor, moeda);
  const inicioDoNumero = texto.search(/\d/);
  if (valor === null || inicioDoNumero <= 0) return <span className={NUMERO}>{texto}</span>;
  return (
    <span className={NUMERO}>
      <span className="mr-1 align-baseline text-title font-semibold text-fg-body">
        {texto.slice(0, inicioDoNumero).trim()}
      </span>
      {texto.slice(inicioDoNumero)}
    </span>
  );
}

export function Kpis({ numeros: n }: { numeros: NumerosDaVisaoGeral }) {
  const moedasDiferentes = n.temDado && n.compras !== null && n.compras > 0 && n.valorDasCompras === null;

  return (
    // A grade (1 → 2×2 → 4 colunas) mora em `.gradeKpis` (V9): ela lê a largura
    // deste `<section>`, e não a da janela, porque a lateral come 15.5rem.
    <section aria-label="Indicadores do período" className="@container">
      <ul role="list" className={consoleStyles.gradeKpis}>
        <CartaoKpi rotulo="Páginas vistas" valor={<span className={NUMERO}>{formatarPtBr(n.paginas)}</span>}>
          {/* Eventos com fbclid: NÃO são cliques nem pessoas (o console não recebe os cliques). */}
          {n.temDado ? (
            <p className="tabular-nums" title="Eventos que chegaram com fbclid; não são cliques nem pessoas">
              <span className="font-semibold text-fg-body">{formatarPtBr(n.comFbclid)}</span> com clique de
              anúncio
            </p>
          ) : null}
          <Variacao valor={n.variacaoPaginas} />
        </CartaoKpi>

        <CartaoKpi rotulo="Checkouts" valor={<span className={NUMERO}>{formatarPtBr(n.checkouts)}</span>}>
          <p className="tabular-nums">{formatarPercentual(n.taxaCheckout)} das páginas</p>
          <Variacao valor={n.variacaoCheckouts} />
        </CartaoKpi>

        <CartaoKpi rotulo="Compras" valor={<span className={NUMERO}>{formatarPtBr(n.compras)}</span>}>
          <p className="tabular-nums">{formatarPercentual(n.taxaCompra)} dos checkouts</p>
          <Variacao valor={n.variacaoCompras} />
        </CartaoKpi>

        <CartaoKpi
          rotulo="Faturado"
          destaque
          className={consoleStyles.kpiValor}
          valor={<Dinheiro valor={n.valorDasCompras} moeda={n.moedaDasCompras} />}
        >
          {moedasDiferentes ? (
            <p>compras em moedas diferentes: sem soma</p>
          ) : (
            <p className="tabular-nums">
              Ticket médio{' '}
              <span className="font-semibold text-fg-strong">{formatarMoeda(n.ticket, n.moedaDasCompras)}</span>
            </p>
          )}
        </CartaoKpi>
      </ul>
    </section>
  );
}
