'use client';

/**
 * O funil da Visão geral (V5 do plano v7; spec :58): Cliques → Página →
 * Checkout → Compra, em faixas curvas contínuas azul → ciano → menta.
 *
 *  - Nomes, valores e taxas são `<text>` do SVG: selecionáveis, nunca imagem.
 *  - O SVG tem `role="img"` e `aria-describedby` para um parágrafo com o
 *    resumo em texto (`resumoTextualDoFunil`), que é o que o leitor de tela lê.
 *  - Cliques = "indisponível" e a taxa Página/cliques = "—": o console não
 *    recebe os cliques do anúncio. "Conversão total" (compras ÷ cliques) fica
 *    "—" pelo mesmo motivo (`conversaoTotal`).
 *  - Etapa sem evento no período mostra "0" e diz qual evento não chegou.
 *  - A ALTURA das faixas é decorativa (a legenda diz isso): ela não mede os
 *    números, porque sem cliques não há a primeira medida para comparar.
 *
 * O `viewBox` é do tamanho real da caixa (`useLargura`), para o texto ficar no
 * tamanho da escala em qualquer tela.
 */

import { useId } from 'react';
import consoleStyles from '@/components/layout/console.module.css';
import { cn } from '@/lib/utils';
import {
  SEM_DADO,
  conversaoTotal,
  formatarPercentual,
  formatarPtBr,
  resumoTextualDoFunil,
  type NumerosDaVisaoGeral,
} from '@/lib/visao-geral-calculos';
import { useLargura } from './useLargura';

const ALTURA = 188;
/** Meia-altura de cada faixa, da primeira à última. DECORATIVA. */
const MEIA_FAIXA = [44, 35, 26, 18] as const;
const CENTRO_DA_FAIXA = 108;
const Y_NOME = 14;
const Y_VALOR = 44;
const Y_TAXA = 178;

interface Etapa {
  nome: string;
  /** O que aparece no lugar do número. */
  valor: string;
  /** Taxa sobre a etapa anterior. */
  taxa: string | null;
  disponivel: boolean;
}

function etapasDoFunil(n: NumerosDaVisaoGeral): Etapa[] {
  return [
    { nome: 'Cliques', valor: 'indisponível', taxa: null, disponivel: false },
    { nome: 'Página', valor: formatarPtBr(n.paginas), taxa: SEM_DADO, disponivel: true },
    { nome: 'Checkout', valor: formatarPtBr(n.checkouts), taxa: formatarPercentual(n.taxaCheckout), disponivel: true },
    { nome: 'Compra', valor: formatarPtBr(n.compras), taxa: formatarPercentual(n.taxaCompra), disponivel: true },
  ];
}

/** O contorno contínuo das quatro faixas, com curva em S entre uma e outra. */
function contornoDasFaixas(largura: number): string {
  const coluna = largura / MEIA_FAIXA.length;
  const centro = (i: number) => coluna * (i + 0.5);
  const topo = (i: number) => CENTRO_DA_FAIXA - MEIA_FAIXA[i];
  const base = (i: number) => CENTRO_DA_FAIXA + MEIA_FAIXA[i];
  const ultimo = MEIA_FAIXA.length - 1;

  let d = `M 0 ${topo(0)} L ${centro(0)} ${topo(0)}`;
  for (let i = 1; i <= ultimo; i++) {
    const divisa = coluna * i;
    d += ` C ${divisa} ${topo(i - 1)} ${divisa} ${topo(i)} ${centro(i)} ${topo(i)}`;
  }
  d += ` L ${largura} ${topo(ultimo)} L ${largura} ${base(ultimo)} L ${centro(ultimo)} ${base(ultimo)}`;
  for (let i = ultimo; i >= 1; i--) {
    const divisa = coluna * i;
    d += ` C ${divisa} ${base(i)} ${divisa} ${base(i - 1)} ${centro(i - 1)} ${base(i - 1)}`;
  }
  return `${d} L 0 ${base(0)} Z`;
}

/** A frase de cada etapa que ficou em zero: diz QUAL evento não chegou. */
function etapasSemEvento(n: NumerosDaVisaoGeral): string[] {
  if (!n.temDado) return [];
  const frases: string[] = [];
  if (n.paginas === 0) frases.push('nenhum PageView recebido no período');
  if (n.checkouts === 0) frases.push('nenhum InitiateCheckout recebido no período');
  if (n.compras === 0) frases.push('nenhum Purchase recebido no período');
  return frases;
}

export function Funil({ numeros: n, className }: { numeros: NumerosDaVisaoGeral; className?: string }) {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const idTitulo = `funil-titulo-${base}`;
  const idResumo = `funil-resumo-${base}`;
  const idGradiente = `funil-cor-${base}`;
  const [caixa, largura] = useLargura<HTMLDivElement>(640);

  const etapas = etapasDoFunil(n);
  const coluna = largura / etapas.length;
  const semEvento = etapasSemEvento(n);
  const conversao = conversaoTotal(n.compras, null);

  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(consoleStyles.painel, 'flex min-w-0 flex-col gap-4 p-4 sm:p-5', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={idTitulo} className="text-title font-semibold text-fg-strong">
            Funil do período
          </h2>
          <p className="mt-0.5 text-caption text-fg-muted">Cliques → Página → Checkout → Compra</p>
        </div>
        <p
          className="flex flex-col items-end text-right"
          title="compras ÷ cliques; sem fonte de cliques"
        >
          <span className="text-caption text-fg-muted">Conversão total</span>
          <span className="text-heading font-bold tabular-nums text-fg-strong">
            {formatarPercentual(conversao)}
          </span>
          <span className="sr-only">compras ÷ cliques; sem fonte de cliques</span>
        </p>
      </div>

      <div ref={caixa} className="w-full min-w-0">
        <svg
          role="img"
          aria-labelledby={idTitulo}
          aria-describedby={idResumo}
          width="100%"
          height={ALTURA}
          viewBox={`0 0 ${largura} ${ALTURA}`}
          className="block select-text overflow-visible"
        >
          <defs>
            <linearGradient id={idGradiente} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" style={{ stopColor: 'var(--papel)' }} />
              <stop offset="55%" style={{ stopColor: 'var(--border-focus)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--success)' }} />
            </linearGradient>
          </defs>

          <path d={contornoDasFaixas(largura)} fill={`url(#${idGradiente})`} fillOpacity={0.82} />

          {etapas.map((e, i) => {
            const x = coluna * (i + 0.5);
            return (
              <g key={e.nome}>
                <text x={x} y={Y_NOME} textAnchor="middle" className="text-caption" fill="var(--fg-muted)">
                  {e.nome}
                </text>
                <text
                  x={x}
                  y={Y_VALOR}
                  textAnchor="middle"
                  className={e.disponivel ? 'text-heading font-bold tabular-nums' : 'text-caption'}
                  fill={e.disponivel ? 'var(--fg-strong)' : 'var(--fg-muted)'}
                >
                  {e.valor}
                </text>
                {e.taxa !== null ? (
                  <text
                    x={x}
                    y={Y_TAXA}
                    textAnchor="middle"
                    className="text-caption tabular-nums"
                    fill="var(--fg-body)"
                  >
                    {e.taxa}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <p id={idResumo} className="sr-only">
        {resumoTextualDoFunil(n)}
      </p>

      <div className="flex flex-col gap-1 text-caption text-fg-muted">
        {!n.temDado ? <p>Nenhum evento real no período.</p> : null}
        {semEvento.map((frase) => (
          <p key={frase}>{frase}</p>
        ))}
        <p>
          Abaixo de cada faixa, a taxa sobre a etapa anterior. A altura das faixas é decorativa: ela não
          mede os números.
        </p>
      </div>
    </section>
  );
}
