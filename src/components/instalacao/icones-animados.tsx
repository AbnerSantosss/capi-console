/**
 * Ícones animados dos tópicos da instalação (13/10, pedido do dono).
 *
 * Técnica emprestada do HyperFrames (wiki `Especialistas/18 - Hyperframes`):
 * desenho em SVG puro + animação em CSS, sem biblioteca. Cada ícone carrega a
 * cor do ASSUNTO do tópico e ignora a cor e o tamanho que `Section`/`Panel`
 * passam no `className`: o glifo de 14px do `Panel` sumia ao lado do título, e
 * o tópico precisa ser reconhecido pela cor, não só pelo nome.
 *
 * Desde 14/10 a moldura e o movimento vêm de `@/components/cenas`
 * (`MolduraDeIcone` + `classesDoIcone`): cada ícone se mexe UMA vez quando
 * aparece na tela e para; com `prefers-reduced-motion` já nasce parado.
 * Decorativo: sempre `aria-hidden`.
 */

import React from 'react';

import { MolduraDeIcone, classesDoIcone as c } from '@/components/cenas';

/** Tag do site — `</>` com o cursor piscando entre os sinais. */
export function IconeTag() {
  return (
    <MolduraDeIcone assunto="tag" grande>
      <path className={c.chaveEsq} d="M8 7 3 12l5 5" />
      <path className={c.chaveDir} d="m16 7 5 5-5 5" />
      <path className={c.cursor} d="M12.8 5.5 11.2 18.5" />
    </MolduraDeIcone>
  );
}

/** Webhook — um pulso que sai da plataforma e chega no console. */
export function IconeWebhook() {
  return (
    <MolduraDeIcone assunto="webhook" grande>
      <circle cx="5" cy="17" r="2.4" />
      <circle cx="19" cy="17" r="2.4" />
      <circle cx="12" cy="5.5" r="2.4" />
      <path className={c.trilho} d="M6.3 15 10.7 7.6M13.3 7.6 17.7 15M7.4 17h9.2" />
      <circle className={c.pulso} r="1.5" />
    </MolduraDeIcone>
  );
}

/** Gerar a tag — a caixa (contêiner do GTM) com um brilho subindo. */
export function IconeGerar() {
  return (
    <MolduraDeIcone assunto="tag">
      <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
      <path className={c.brilho} d="M19 2.5v3M17.5 4h3" />
    </MolduraDeIcone>
  );
}

/** Eventos extras — o raio, com um lampejo preenchido por cima. */
export function IconeExtras() {
  return (
    <MolduraDeIcone assunto="evento">
      <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z" />
      <path className={c.raioCheio} d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z" />
    </MolduraDeIcone>
  );
}

/** Sites permitidos — o globo com o meridiano girando. */
export function IconeSites() {
  return (
    <MolduraDeIcone assunto="webhook">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <ellipse className={c.meridiano} cx="12" cy="12" rx="4" ry="9" />
    </MolduraDeIcone>
  );
}

/** Chave pública — a chave com um reflexo passando. */
export function IconeChave() {
  return (
    <MolduraDeIcone assunto="regra">
      <circle cx="7.5" cy="15.5" r="4" />
      <path d="m10.4 12.6 9.1-9.1M16.5 6.5l2.5 2.5M14 9l2 2" />
      <circle className={c.reflexo} cx="7.5" cy="15.5" r="1.3" />
    </MolduraDeIcone>
  );
}

/** Expor para a internet — a seta subindo e voltando. */
export function IconeExpor() {
  return (
    <MolduraDeIcone assunto="regra">
      <path d="M4 20h16" />
      <g className={c.subindo}>
        <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5" />
      </g>
    </MolduraDeIcone>
  );
}
