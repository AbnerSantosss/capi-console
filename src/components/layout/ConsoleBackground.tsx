'use client';

import { usePathname } from 'next/navigation';

import styles from './console.module.css';

/**
 * Fundo das rotas internas. Uma camada, e so uma: o grao.
 *
 * FASE 3b — "quase preto, grao, e nada mais". Sairam daqui, nesta ordem, as
 * tres camadas que desenhavam:
 *   1. as duas radiais na tinta da area (viviam no `.background::before`);
 *   2. a grade de 32px — as DUAS versoes, a estatica em CSS (`.grade`) e a
 *      animada do motion (AnimatedGridPattern, que saiu do repositorio);
 *   3. a rede de eventos em SVG do canto superior direito (`.network`).
 * Grade, teia e halo sao ornamento com forma reconhecivel: a assinatura de
 * template que este redesenho existe para tirar (§8 do plano). Quem diz em
 * que area o operador esta agora e o sublinhado da aba, o glifo do titulo e a
 * linha de 2px do Destaque — cor de area so onde se AGE, nunca no ar atras do
 * dado. O ruido fica porque e textura, nao desenho: sem ele as superficies
 * grandes ficam com cara de chapa.
 *
 * Com o desenho foi tambem todo o custo de runtime: nao ha mais timer do
 * motion, nem leitura de preferencia, nem `matchMedia` — por isso a
 * preferencia "Fundo com movimento" deixou de existir na tela de Preferencias
 * (nao ha mais nada para ligar).
 *
 * A area continua saindo da rota para o `data-area` daqui, e nao do <main>: o
 * fundo e IRMAO do conteudo na arvore (ConsoleShell), entao a --tinta
 * declarada no <main> nunca chegaria ate ele. O atributo fica porque e o
 * gancho de area do fundo; hoje ele nao pinta nada, e esse e o ponto.
 *
 * O login nao usa este componente: ele vive fora do route group (console).
 */
export function ConsoleBackground() {
  const area = areaDaRota(usePathname());

  return (
    <div className={styles.background} data-area={area} aria-hidden="true">
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
