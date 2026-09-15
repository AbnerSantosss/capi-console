'use client';

import { usePathname } from 'next/navigation';

import styles from './console.module.css';

/**
 * Fundo das rotas internas: o video em laco, e o grao por cima dele.
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
 * O login nao usa este componente: ele vive fora do route group (console) —
 * la o fundo continua sendo a foto do papel na coluna da esquerda.
 *
 * O video entrou depois da FASE 3b, por pedido do dono, e e a excecao
 * declarada aquela regra: ele TEM forma reconhecivel. O que o mantem como
 * fundo e nao como desenho e a dose — 18% de opacidade e um veu de
 * `--surface-0` por cima, medidos em `.fundoVideo`. Ver `console.module.css`.
 */
export function ConsoleBackground() {
  const area = areaDaRota(usePathname());

  return (
    <div className={styles.background} data-area={area} aria-hidden="true">
      {/* Fundo em movimento. Duas pecas do mesmo material, uma deitada e uma em
          pe, porque um 16:9 esticado num telefone perde 60% da largura e o
          desenho vira listra. Quem escolhe e o CSS (`.fundoVideo`), nao um
          `matchMedia`: assim nao ha estado de cliente para hidratar nem troca
          de src no meio do caminho.

          `preload="metadata"` e o minimo que ainda deixa o laco comecar
          sozinho. Com `preload="none"` o Chrome cumpre a palavra ao pe da
          letra: o video fica em `readyState 0`, parado, e o `autoplay` nunca
          dispara porque nao ha o que tocar — medido na tela, nao suposto. Com
          `metadata`, quem esta visivel baixa o resto e toca; quem esta em
          `display: none` para nos cabecalhos, porque o Chrome nao inicia
          autoplay de elemento que nao renderiza. E e isso que impede o
          telefone de puxar os 1,9 MB da peca de desktop.

          Sem audio na faixa (o ffmpeg tirou), entao `muted` e garantia dupla —
          sem ele o navegador recusa o autoplay de qualquer jeito.

          `poster` ficou de fora de proposito. O primeiro quadro do arquivo e
          quase preto, igual ao fundo que ja esta pintado embaixo; um poster
          com o quadro cheio apareceria de uma vez e depois o video comecaria
          do preto, que e um salto. Sem poster, o video entra subindo. */}
      <div className={styles.fundoVideo}>
        <video
          ref={iniciarLaco}
          className={styles.fundoVideoDesktop}
          data-fonte="/brand/fundo/console-desktop.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        />
        <video
          ref={iniciarLaco}
          className={styles.fundoVideoMobile}
          data-fonte="/brand/fundo/console-mobile.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        />
      </div>
      {/* Grao: uma imagem de papel de verdade, repetida (ver `.noise` em
          console.module.css). Aqui morava um `feTurbulence` — ruido fractal
          calculado pelo navegador, que era desenho gerado justamente como as
          camadas que sairam na FASE 3b. A fibra fotografada nao tem esse
          ar sintetico e sai mais barata: 63 KB em cache contra um filtro SVG
          que o navegador recalcula a cada repintura de tela cheia. */}
      <div className={styles.noise} />
    </div>
  );
}

/**
 * Da o play. O `autoPlay` do elemento SOZINHO nao bastou: medido na tela, os
 * dois videos ficavam em `readyState 0` e `paused: true` mesmo com os tres
 * atributos certos no DOM (`autoplay`, `muted`, `playsinline` — conferidos por
 * `outerHTML`). O Chrome adia a carga de midia em aba que nao esta em primeiro
 * plano no momento da montagem, e nao volta atras sozinho quando ela aparece.
 * Um `play()` explicito resolve e nao custa nada: e uma chamada por montagem.
 *
 * O `src` NAO vem no JSX: vem de `data-fonte`, e so a peca visivel recebe o
 * seu. Com `src` cravado nas duas, o telefone baixava a peca de desktop
 * inteira — 1.955.792 bytes numa carga fria medida no ar, com
 * `preload="metadata"` e `display: none` valendo os dois. Esconder no CSS nao
 * impede o navegador de buscar; nao ter endereco impede. Sob
 * `prefers-reduced-motion` as duas ficam escondidas e nao se baixa nada: o
 * fundo vira a imagem parada que o CSS poe no lugar.
 *
 * O preco e a janela redimensionada atravessando os 48rem: o `ref` roda na
 * montagem, entao a peca que aparece depois fica sem endereco ate recarregar.
 * Num telefone isso nao acontece, e num desktop o que sobra e o fundo escuro
 * com o grao — o estado de repouso do desenho, nao um defeito visivel.
 *
 * A promessa e engolida de proposito: se a politica de autoplay recusar, o
 * lugar certo de falhar e em silencio, com o fundo escuro que ja estava la.
 * Fundo nao e funcao — nao ha nada para avisar ao operador.
 */
function iniciarLaco(el: HTMLVideoElement | null) {
  if (!el) return;
  if (getComputedStyle(el).display === 'none') return;
  const fonte = el.dataset.fonte;
  if (fonte && !el.getAttribute('src')) el.setAttribute('src', fonte);
  el.muted = true;
  void el.play().catch(() => {});
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
