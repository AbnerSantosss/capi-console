'use client';

/**
 * Capa do card de topico. E o que faz cada assunto parecer um lugar diferente,
 * sem precisar de arquivo de imagem: tudo e SVG ou gradiente.
 *
 * Regra: a capa nunca carrega informacao que nao esteja tambem em texto. Ela
 * ambienta, nao explica — com uma excecao proposital, as barras do EMQ, que
 * sao os pesos reais vindos de calcularEmq.
 */

import { useId } from 'react';

import { DotPattern } from '@/components/ui/dot-pattern';
import { GridPattern } from '@/components/ui/grid-pattern';
import type { Textura } from './conteudo';
import styles from './guide.module.css';

export function TopicBackdrop({
  textura,
  pesos,
  animar,
}: {
  textura: Textura;
  /** So para a textura "barras": os pesos dos 9 parametros do EMQ. */
  pesos?: number[];
  /** Movimento permitido (preferencia do operador + prefers-reduced-motion). */
  animar: boolean;
}) {
  return (
    <div className={styles.cover}>
      {textura === 'pontos' && <Pontos />}
      {textura === 'fluxo' && <Fluxo animar={animar} />}
      {textura === 'grade-marcada' && <GradeMarcada />}
      {textura === 'barras' && <Barras pesos={pesos ?? []} />}
      {textura === 'listras' && <Listras />}
      <div className={styles.coverFade} />
    </div>
  );
}

/* -- Disparo manual: pontos a preencher, um a um -------------------------- */
function Pontos() {
  return (
    <DotPattern
      width={16}
      height={16}
      cr={1}
      style={{ color: 'var(--hue)' }}
      className="absolute inset-0 h-full w-full opacity-40 [mask-image:radial-gradient(ellipse_70%_120%_at_78%_40%,black,transparent)]"
    />
  );
}

/* -- Disparo automatico: linhas que correm sozinhas ----------------------- */
function Fluxo({ animar }: { animar: boolean }) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 600 96"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <g
        stroke="var(--hue)"
        strokeWidth="1.4"
        fill="none"
        opacity="0.45"
        strokeLinecap="round"
      >
        {[
          'M-10 26C90 26 130 62 230 62S380 18 470 18 590 40 610 40',
          'M-10 58C80 58 140 30 250 30S400 74 500 74 590 56 610 56',
          'M-10 84C110 84 170 48 300 48S440 92 520 92 590 78 610 78',
        ].map((d, i) => (
          <path
            key={d}
            d={d}
            strokeDasharray="7 11"
            style={
              animar
                ? {
                    animation: `fluxo-corre ${9 + i * 2}s linear infinite`,
                    animationDelay: `${i * -1.6}s`,
                  }
                : undefined
            }
          />
        ))}
      </g>
      <style>{'@keyframes fluxo-corre { to { stroke-dashoffset: -180; } }'}</style>
    </svg>
  );
}

/* -- Onde achar: mapa com celulas marcadas -------------------------------- */
function GradeMarcada() {
  return (
    <GridPattern
      width={24}
      height={24}
      squares={[
        [2, 1],
        [6, 2],
        [11, 0],
        [15, 3],
        [19, 1],
        [23, 2],
      ]}
      style={{
        fill: 'color-mix(in srgb, var(--hue) 26%, transparent)',
        stroke: 'color-mix(in srgb, var(--hue) 26%, transparent)',
      }}
      className="absolute inset-0 h-full w-full [mask-image:linear-gradient(to_right,black,transparent_92%)]"
    />
  );
}

/* -- Qualidade: as 9 barras SAO os pesos reais do EMQ --------------------- */
function Barras({ pesos }: { pesos: number[] }) {
  // useId devolve caracteres que nao valem em url(#...) — limpa antes de usar.
  const id = 'emq' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const maior = Math.max(1, ...pesos);
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 600 96"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--hue)" stopOpacity="0.42" />
          <stop offset="100%" stopColor="var(--hue)" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      {pesos.map((peso, i) => {
        const altura = 14 + (peso / maior) * 74;
        return (
          <rect
            key={i}
            x={26 + i * 62}
            y={96 - altura}
            width={34}
            height={altura}
            rx={4}
            fill={`url(#${id})`}
          />
        );
      })}
    </svg>
  );
}

/* -- Regras: area de atencao --------------------------------------------- */
function Listras() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, color-mix(in srgb, var(--hue) 22%, transparent) 0 1px, transparent 1px 11px)',
        maskImage: 'linear-gradient(to right, black, transparent 88%)',
      }}
    />
  );
}
