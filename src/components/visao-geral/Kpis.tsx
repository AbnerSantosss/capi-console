'use client';

/**
 * Os 5 indicadores da Visão geral (V5 do plano v7; spec :35-43), nesta ordem:
 * Cliques · Visualizações de página · Inícios de checkout · Compras · Valor das
 * compras. Centrados, mesma altura, número grande em peso 700 com algarismos
 * tabulares, SEM ícone.
 *
 * Só dado real:
 *  - Cliques é "indisponível": o console não recebe os cliques do anúncio. O
 *    que ele tem são eventos que chegaram com `fbclid`/`fbc`, e esses aparecem
 *    com o nome deles, nunca como clique.
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
  SEM_DADO,
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
  /** O cartão "Valor das compras": mais largo e com o fundo verde discreto. */
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

function eventos(n: number | null): string {
  return n === 1 ? 'evento' : 'eventos';
}

export function Kpis({ numeros: n }: { numeros: NumerosDaVisaoGeral }) {
  const moedasDiferentes = n.temDado && n.compras !== null && n.compras > 0 && n.valorDasCompras === null;

  return (
    // A grade (1 → 2 → 5 colunas) mora em `.gradeKpis` (V9): ela lê a largura
    // deste `<section>`, e não a da janela, porque a lateral come 15.5rem.
    <section aria-label="Indicadores do período" className="@container">
      <ul role="list" className={consoleStyles.gradeKpis}>
        <CartaoKpi
          rotulo="Cliques"
          valor={<span className="text-title font-semibold text-fg-muted">indisponível</span>}
        >
          <p>o console não recebe os cliques do anúncio</p>
          {n.temDado ? (
            <p className="tabular-nums">
              <span className="font-semibold text-fg-body">{formatarPtBr(n.comFbclid)}</span>{' '}
              {eventos(n.comFbclid)} com fbclid e{' '}
              <span className="font-semibold text-fg-body">{formatarPtBr(n.comFbc)}</span> com fbc no
              período
            </p>
          ) : null}
        </CartaoKpi>

        <CartaoKpi
          rotulo="Visualizações de página"
          valor={<span className={NUMERO}>{formatarPtBr(n.paginas)}</span>}
        >
          <p>{SEM_DADO} dos cliques</p>
          <Variacao valor={n.variacaoPaginas} />
        </CartaoKpi>

        <CartaoKpi
          rotulo="Inícios de checkout"
          valor={<span className={NUMERO}>{formatarPtBr(n.checkouts)}</span>}
        >
          <p className="tabular-nums">{formatarPercentual(n.taxaCheckout)} das visitas</p>
          <Variacao valor={n.variacaoCheckouts} />
        </CartaoKpi>

        <CartaoKpi rotulo="Compras" valor={<span className={NUMERO}>{formatarPtBr(n.compras)}</span>}>
          <p className="tabular-nums">{formatarPercentual(n.taxaCompra)} dos checkouts</p>
          <Variacao valor={n.variacaoCompras} />
        </CartaoKpi>

        <CartaoKpi
          rotulo="Valor das compras"
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
