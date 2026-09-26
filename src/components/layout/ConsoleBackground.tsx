import styles from './console.module.css';

/**
 * Fundo das rotas internas: a imagem do design do dono, o veu e o grao.
 *
 * v7 (tarefa V1). Sai o video em laco que a FASE 3b tinha aceitado por pedido
 * do dono (dois `<video>`, 1,9 MB e 1,3 MB, com o `iniciarLaco` que dava o
 * play na mao) e entra o fundo principal do design "Abner Tracker": uma
 * imagem parada, servida em AVIF com WebP de reserva (~19 KB cada, contra os
 * 3,3 MB de video). Imagem parada nao tem movimento, entao
 * `prefers-reduced-motion` deixou de precisar de regra propria aqui.
 *
 * O fundo e UM so para o console inteiro. O `data-area` que este componente
 * lia da rota (`areaDaRota`) saiu junto: ele nao pintava nada desde a FASE 3b,
 * e a imagem do dono nao muda por area. Sem hook nenhum, o componente deixou
 * de ser de cliente — nao ha estado, efeito nem evento, e o fundo chega pronto
 * no HTML do servidor.
 *
 * `<picture>` e nao `next/image`: o otimizador do Next escolhe UM formato por
 * pedido e nao aceita `<source>` por tipo; aqui os dois arquivos ja saem
 * otimizados de `scripts/gerar-fundos.mjs`, e o navegador escolhe o AVIF quando
 * sabe ler e o WebP quando nao sabe. O enquadramento (`cover`, `right top`), o
 * veu de `--surface-0` que garante a leitura do texto por cima e a razao do
 * numero do veu estao em `.fundoPrincipal`, no `console.module.css`.
 *
 * O login nao usa este componente: ele vive fora do route group (console) e
 * carrega o proprio fundo em `LoginForm.tsx`.
 */
export function ConsoleBackground() {
  return (
    <div className={styles.background} aria-hidden="true">
      <picture className={styles.fundoPrincipal}>
        <source type="image/avif" srcSet="/brand/fundo/principal.avif" />
        <source type="image/webp" srcSet="/brand/fundo/principal.webp" />
        {/* Decorativo: `alt=""` e o `aria-hidden` do pai tiram a imagem da
            arvore de acessibilidade. (A regra `no-img-element` do Next nao
            reclama de `<img>` dentro de `<picture>`.) */}
        <img
          src="/brand/fundo/principal.webp"
          alt=""
          width={1536}
          height={1024}
          decoding="async"
        />
      </picture>
      {/* Grao: uma imagem de papel de verdade, repetida (ver `.noise` em
          console.module.css). Fica por cima da imagem e tira dela o ar de
          renderizacao — o mesmo material do resto da tela. */}
      <div className={styles.noise} />
    </div>
  );
}
