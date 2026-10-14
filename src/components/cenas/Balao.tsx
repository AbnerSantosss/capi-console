/**
 * Balão de fala de uma cena: até 3 palavras, `text-caption`.
 *
 * Três camadas, para posição e movimento nunca brigarem pelo mesmo
 * `transform`: o invólucro tem a POSIÇÃO (e o centro, com `centro`), o meio
 * ESTOURA na entrada e o corpo FLUTUA `ciclos` vezes e para.
 *
 * Em palco estreito (menos de 23rem) o balão sai da posição absoluta, entra
 * no fluxo embaixo do que vem antes, e só o primeiro balão da cena aparece.
 * `opcional` some primeiro.
 */

import React from 'react';

import type { Ordem } from './assuntos';
import s from './cenas.module.css';

export type PropsDoBalao = {
  /** Distância da esquerda (ou da direita, com `daDireita`), em % do palco. */
  x: string;
  /** Distância do topo (ou da base, com `deBaixo`), em % do palco. */
  y: string;
  daDireita?: boolean;
  deBaixo?: boolean;
  /** Centraliza o balão no ponto `x` (o corpo continua livre para flutuar). */
  centro?: boolean;
  /** O único destaque da cena. */
  forte?: boolean;
  /** Contorno tracejado: "não conta como venda" (teste). */
  tracejado?: boolean;
  /** Some primeiro quando o palco é estreito. */
  opcional?: boolean;
  ordem?: Ordem;
  children: string;
};

export function Balao({
  x,
  y,
  daDireita = false,
  deBaixo = false,
  centro = false,
  forte = false,
  tracejado = false,
  opcional = false,
  ordem = 0,
  children,
}: PropsDoBalao) {
  const posicao: React.CSSProperties = {
    [daDireita ? 'right' : 'left']: x,
    [deBaixo ? 'bottom' : 'top']: y,
  };
  return (
    <span
      className={s.balao}
      style={posicao}
      data-ordem={ordem}
      data-centro={centro || undefined}
      data-forte={forte || undefined}
      data-tracejado={tracejado || undefined}
      data-opcional={opcional || undefined}
    >
      <span className={s.balaoEntra}>
        <span className={`${s.balaoCorpo} text-caption`}>{children}</span>
      </span>
    </span>
  );
}
