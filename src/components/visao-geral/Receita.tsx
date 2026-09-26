'use client';

/**
 * A receita por dia da Visão geral (V5 do plano v7; spec :25, :60).
 *
 * O que soma: `porDia[].receita`, o valor dos eventos REAIS enviados à Meta em
 * cada dia (o mesmo recorte de `receitaEnviada`, `inbox-resumo.ts`). Não é só
 * compra: um checkout enviado com valor também entra, e o subtítulo diz isso.
 * O cartão "Valor das compras" dos KPIs é que é só compra.
 *
 *  - Área menta sobre linha reta entre os dias, grade sutil, `dd/mm` no eixo X
 *    e 4 ou 5 degraus redondos no Y (`degrausDoEixo`).
 *  - Dia com `receita: null` (moedas diferentes) é LACUNA: a linha quebra ali e
 *    uma marca tracejada mostra o dia. Nunca vira zero.
 *  - Primeiro dia parcial (R6): o balão diz "parcial, desde HH:MM".
 *  - Hoje/Ontem (um dia só): o total e a frase "um dia: sem evolução para
 *    desenhar", sem curva.
 *
 * Acessibilidade: o SVG é `role="img"` com `<desc>` = `resumoTextualDaReceita`.
 * Cada ponto tem um `<button>` por cima do desenho (o plano aceita as duas
 * formas); o botão tem `aria-describedby` para um `<div role="tooltip">` que
 * abre no foco, no mouse e no toque, e fecha com Esc. O botão fica FORA do SVG
 * de propósito: dentro de um `role="img"` os filhos são apresentação, e um
 * ponto focável ali não seria anunciado.
 */

import { useId, useState } from 'react';
import consoleStyles from '@/components/layout/console.module.css';
import type { ResumoInbox } from '@/lib/inbox-resumo';
import { cn } from '@/lib/utils';
import {
  SEM_DADO,
  diaMes,
  formatarMoeda,
  formatarVariacao,
  pontosDaReceita,
  primeiroDiaParcial,
  resumoTextualDaReceita,
  variacao,
} from '@/lib/visao-geral-calculos';
import { useLargura } from './useLargura';

const ALTURA = 200;
const MARGEM = { esquerda: 64, direita: 24, topo: 12, base: 28 } as const;
/** Distância mínima entre dois rótulos `dd/mm` do eixo X. */
const ESPACO_DO_ROTULO = 48;

const COMPACTO = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export function Receita({ resumo, className }: { resumo: ResumoInbox; className?: string }) {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const idTitulo = `receita-titulo-${base}`;
  const idDescricao = `receita-desc-${base}`;
  const [caixa, largura] = useLargura<HTMLDivElement>(420);
  const [ativo, setAtivo] = useState<number | null>(null);

  const temDado = resumo.base > 0;
  const porDia = resumo.porDia ?? [];
  const moeda = resumo.receitaEnviada?.moeda ?? null;
  const diasSemValor = porDia.filter((d) => d.receita === null).length;
  const moedasDiferentes = resumo.receitaEnviada === null && diasSemValor > 0;
  /** `receitaEnviada = null` sem dia misturado: nada foi enviado com valor. */
  const total = resumo.receitaEnviada?.total ?? (moedasDiferentes ? null : 0);
  const anterior = resumo.anterior?.receitaEnviada ?? null;
  const variacaoDaReceita =
    temDado && resumo.receitaEnviada && anterior && anterior.moeda === resumo.receitaEnviada.moeda
      ? variacao(resumo.receitaEnviada.total, anterior.total)
      : null;
  const parcial = primeiroDiaParcial(resumo.janela, porDia);
  const codigo = moeda ?? 'BRL';

  const larguraDoGrafico = Math.max(largura - MARGEM.esquerda - MARGEM.direita, 40);
  const alturaDoGrafico = ALTURA - MARGEM.topo - MARGEM.base;
  const grafico = pontosDaReceita(porDia, larguraDoGrafico, alturaDoGrafico);
  const xDe = (x: number) => MARGEM.esquerda + x;
  const yDe = (y: number) => MARGEM.topo + y;
  const yDoValor = (v: number) => yDe(alturaDoGrafico - (v / grafico.topo) * alturaDoGrafico);
  const passoDoRotulo =
    porDia.length > 1
      ? Math.max(1, Math.ceil(ESPACO_DO_ROTULO / (larguraDoGrafico / (porDia.length - 1))))
      : 1;

  const desenha = temDado && porDia.length > 1;

  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(consoleStyles.painel, 'flex min-w-0 flex-col gap-4 p-4 sm:p-5', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={idTitulo} className="text-title font-semibold text-fg-strong">
            Receita por dia
          </h2>
          <p className="mt-0.5 text-caption text-fg-muted">
            valor dos eventos reais enviados à Meta (não só compras)
          </p>
        </div>
        <div className="flex flex-col items-end text-right">
          <span className="text-caption text-fg-muted">Total do período</span>
          <span className="text-heading font-bold tabular-nums text-fg-strong">
            {temDado ? formatarMoeda(total, codigo) : SEM_DADO}
          </span>
          {variacaoDaReceita !== null ? (
            <span className="text-caption tabular-nums">
              <span
                className={cn(
                  'font-semibold',
                  variacaoDaReceita > 0
                    ? 'text-success'
                    : variacaoDaReceita < 0
                      ? 'text-danger'
                      : 'text-fg-muted'
                )}
              >
                {formatarVariacao(variacaoDaReceita)}
              </span>{' '}
              <span className="text-fg-muted">contra o período anterior</span>
            </span>
          ) : null}
        </div>
      </div>

      {!temDado ? (
        <p className="text-caption text-fg-muted">Nenhum evento real no período.</p>
      ) : porDia.length === 0 ? (
        <p className="text-caption text-fg-muted">Sem dado de receita no período.</p>
      ) : porDia.length === 1 ? (
        <p className="text-caption text-fg-muted">
          um dia: sem evolução para desenhar
          {parcial ? ` (parcial, desde ${parcial.desde})` : ''}
        </p>
      ) : null}

      {desenha ? (
        <div ref={caixa} className="relative w-full min-w-0">
          <svg
            role="img"
            aria-labelledby={idTitulo}
            aria-describedby={idDescricao}
            width="100%"
            height={ALTURA}
            viewBox={`0 0 ${largura} ${ALTURA}`}
            className="block select-text overflow-visible"
          >
            <desc id={idDescricao}>{resumoTextualDaReceita(porDia, moeda, resumo.janela)}</desc>

            {/* Grade e eixo Y. */}
            {grafico.degraus.map((d) => (
              <g key={`degrau-${d}`}>
                <line
                  x1={MARGEM.esquerda}
                  x2={MARGEM.esquerda + larguraDoGrafico}
                  y1={yDoValor(d)}
                  y2={yDoValor(d)}
                  stroke="var(--border-subtle)"
                  strokeWidth={1}
                />
                <text
                  x={MARGEM.esquerda - 8}
                  y={yDoValor(d) + 4}
                  textAnchor="end"
                  className="text-caption tabular-nums"
                  fill="var(--fg-muted)"
                >
                  {COMPACTO.format(d)}
                </text>
              </g>
            ))}

            {/* Eixo X: dd/mm, sem encavalar. */}
            {porDia.map((d, i) =>
              i % passoDoRotulo === 0 || i === porDia.length - 1 ? (
                <text
                  key={`dia-${d.dia}`}
                  x={xDe(grafico.xDosDias[i])}
                  y={ALTURA - 6}
                  textAnchor="middle"
                  className="text-caption tabular-nums"
                  fill="var(--fg-muted)"
                >
                  {diaMes(d.dia)}
                </text>
              ) : null
            )}

            {/* Lacunas: o dia existe, o valor não (moedas diferentes). */}
            {porDia.map((d, i) =>
              d.receita === null ? (
                <line
                  key={`lacuna-${d.dia}`}
                  x1={xDe(grafico.xDosDias[i])}
                  x2={xDe(grafico.xDosDias[i])}
                  y1={MARGEM.topo}
                  y2={MARGEM.topo + alturaDoGrafico}
                  stroke="var(--border-default)"
                  strokeDasharray="3 4"
                  strokeWidth={1}
                />
              ) : null
            )}

            {/* Área e linha, trecho a trecho. */}
            {grafico.segmentos.map((trecho) => {
              const chave = `trecho-${trecho[0].dia}`;
              const linha = trecho.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xDe(p.x)} ${yDe(p.y)}`).join(' ');
              const chao = yDe(alturaDoGrafico);
              const area =
                trecho.length > 1
                  ? `M ${xDe(trecho[0].x)} ${chao} ${trecho.map((p) => `L ${xDe(p.x)} ${yDe(p.y)}`).join(' ')} L ${xDe(trecho[trecho.length - 1].x)} ${chao} Z`
                  : null;
              return (
                <g key={chave}>
                  {area ? <path d={area} fill="var(--success)" fillOpacity={0.16} /> : null}
                  {trecho.length > 1 ? (
                    <path d={linha} fill="none" stroke="var(--success)" strokeWidth={2} strokeLinejoin="round" />
                  ) : null}
                </g>
              );
            })}

            {/* Os pontos (o botão de cada um fica fora do SVG, logo abaixo). */}
            {grafico.pontos.map((p) => (
              <circle
                key={`ponto-${p.dia}`}
                cx={xDe(p.x)}
                cy={yDe(p.y)}
                r={ativo === p.indice ? 6 : 4}
                fill="var(--success)"
                stroke={ativo === p.indice ? 'var(--border-focus)' : 'var(--surface-1)'}
                strokeWidth={2}
              />
            ))}
          </svg>

          {grafico.pontos.map((p) => {
            const idBalao = `receita-balao-${base}-${p.indice}`;
            const esquerda = xDe(p.x);
            const topo = yDe(p.y);
            const desloca =
              esquerda < 90 ? '-12%' : esquerda > largura - 90 ? '-88%' : '-50%';
            const eParcial = parcial !== null && p.indice === 0;
            const aberto = ativo === p.indice;
            return (
              <div key={`balao-${p.dia}`}>
                <button
                  type="button"
                  tabIndex={0}
                  aria-label={`Dia ${diaMes(p.dia)}`}
                  aria-describedby={idBalao}
                  className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
                  style={{ left: esquerda, top: topo }}
                  onMouseEnter={() => setAtivo(p.indice)}
                  onMouseLeave={() => setAtivo((a) => (a === p.indice ? null : a))}
                  onFocus={() => setAtivo(p.indice)}
                  onBlur={() => setAtivo((a) => (a === p.indice ? null : a))}
                  onClick={() => setAtivo(p.indice)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setAtivo(null);
                  }}
                />
                <div
                  role="tooltip"
                  id={idBalao}
                  className={cn(
                    'pointer-events-none absolute z-10 whitespace-nowrap rounded-control border border-line-strong bg-surface-2 px-2 py-1 text-caption tabular-nums text-fg-strong',
                    aberto ? 'visible' : 'invisible'
                  )}
                  style={{ left: esquerda, top: topo - 12, transform: `translate(${desloca}, -100%)` }}
                >
                  {diaMes(p.dia)} · {formatarMoeda(p.receita, codigo)} · {plural(p.compras, 'compra', 'compras')}
                  {eParcial ? ` · parcial, desde ${parcial.desde}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {desenha && (diasSemValor > 0 || parcial) ? (
        <div className="flex flex-col gap-1 text-caption text-fg-muted">
          {diasSemValor > 0 ? <p>{plural(diasSemValor, 'dia', 'dias')} sem valor: moedas diferentes</p> : null}
          {parcial ? <p>Primeiro dia parcial, desde {parcial.desde} (horário de Brasília).</p> : null}
        </div>
      ) : null}
      {temDado && moedasDiferentes && !desenha ? (
        <p className="text-caption text-fg-muted">Sem total: moedas diferentes no período.</p>
      ) : null}
    </section>
  );
}
