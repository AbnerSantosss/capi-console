'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { useUserStore } from '@/stores/useUserStore';
import { AnimatedGridPattern } from '@/components/ui/animated-grid-pattern';
import { cn } from '@/lib/utils';
import styles from './console.module.css';

/**
 * Fundo das rotas internas. Quatro camadas, nesta ordem:
 *   1. canvas da area — duas radiais na tinta do assunto e a subida de luz
 *      do topo (console.module.css, `.background::before`)
 *   2. grade de 32px mascarada no topo; com "fundo animado" ligado e no
 *      desktop, ela vira a grade animada do motion
 *   3. ruido (feTurbulence) para tirar o aspecto chapado
 *   4. rede de eventos em SVG, canto superior direito
 *
 * A area sai da rota e vai para o `data-area` daqui, e nao do <main>: o fundo
 * e IRMAO do conteudo na arvore (ConsoleShell), entao a --tinta declarada no
 * <main> nunca chegaria ate ele. Cada pagina continua declarando a sua para o
 * cabecalho e o resto do conteudo; aqui a fonte e o caminho.
 *
 * A grade animada custa timers do motion. Fora do desktop, ou com movimento
 * reduzido, ou com a preferencia desligada, fica a grade em CSS — mesma
 * aparencia, zero trabalho continuo.
 *
 * O login nao usa este componente: ele vive fora do route group (console).
 */
export function ConsoleBackground() {
  const fundoAnimado = useUserStore((state) => state.fundoAnimado);
  const podeAnimar = usePodeAnimar();
  const animar = fundoAnimado && podeAnimar;
  const area = areaDaRota(usePathname());

  return (
    <div
      className={cn(styles.background, fundoAnimado && styles.live)}
      data-area={area}
      aria-hidden="true"
    >
      {animar ? (
        <div className={styles.gridLayer}>
          <AnimatedGridPattern
            width={32}
            height={32}
            numSquares={24}
            maxOpacity={0.05}
            duration={4}
            repeatDelay={1}
            className="inset-x-0 top-0 h-160 fill-slate-300/[0.045] stroke-slate-300/[0.045]"
          />
        </div>
      ) : (
        <div className={styles.grade} />
      )}

      {/* Ruido: 1 filtro SVG, sem requisicao de rede, sem animacao. */}
      <svg className={styles.noise} focusable="false">
        <filter id="console-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.82"
            numOctaves="3"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#console-noise)" />
      </svg>

      <svg
        className={styles.network}
        viewBox="0 0 420 260"
        fill="none"
        focusable="false"
      >
        <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M36 184C90 155 104 93 166 103S241 173 292 136 333 64 388 75" />
          <path d="M36 184C91 202 128 218 181 190S235 112 292 136" />
          <path d="M166 103C193 67 222 45 267 58S337 111 388 75" />
          <path d="M181 190C233 214 295 210 350 181" />
        </g>
        <g fill="var(--surface-0)" stroke="currentColor" strokeWidth="1.8">
          <circle cx="36" cy="184" r="5" />
          <circle cx="166" cy="103" r="5" />
          <circle cx="181" cy="190" r="5" />
          <circle cx="267" cy="58" r="5" />
          <circle cx="350" cy="181" r="5" />
          <circle cx="388" cy="75" r="5" />
          <circle cx="292" cy="136" r="13" />
          <circle cx="292" cy="136" r="5" fill="currentColor" />
        </g>
      </svg>
    </div>
  );
}

/**
 * A area do console a partir do caminho. A raiz e o disparo manual. Rota
 * desconhecida (o Guia, por exemplo) fica sem `data-area` e herda a tinta
 * padrao do :root — de proposito: o Guia ja pinta por topico com --hue.
 */
function areaDaRota(caminho: string | null): string | undefined {
  if (!caminho) return undefined;
  if (caminho === '/') return 'manual';
  if (caminho.startsWith('/painel')) return 'painel';
  if (caminho.startsWith('/instalacao')) return 'instalacao';
  if (caminho.startsWith('/pixels')) return 'pixels';
  if (caminho.startsWith('/automatico')) return 'automatico';
  return undefined;
}

/** Desktop largo e sem preferencia por menos movimento. */
function usePodeAnimar() {
  const [pode, setPode] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const largo = window.matchMedia('(min-width: 1024px)');
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)');
    const avaliar = () => setPode(largo.matches && !calmo.matches);
    avaliar();
    largo.addEventListener('change', avaliar);
    calmo.addEventListener('change', avaliar);
    return () => {
      largo.removeEventListener('change', avaliar);
      calmo.removeEventListener('change', avaliar);
    };
  }, []);

  return pode;
}
