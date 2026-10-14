/**
 * Fio entre dois nós: o tracejado no acento + o pulso que viaja `ciclos` vezes
 * e assenta no meio (o quadro final). Os fios seguintes de uma mesma trilha
 * saem um pouco depois do anterior, como uma corrente.
 *
 * - `direcao="baixo"`: fio em pé (trilha em coluna). Em palco estreito todos
 *   os fios já ficam em pé sozinhos.
 * - `estado`: 'esperando' (âmbar; o único que repete sem parar, e só dentro de
 *   um palco também em espera), 'pausado' (âmbar, sem pulso), 'erro'
 *   (vermelho, sem pulso) e 'apagado' (esmaecido, sem pulso).
 */

import React from 'react';

import type { Estado, Ordem } from './assuntos';
import s from './cenas.module.css';

export type PropsDoFio = {
  ordem?: Ordem;
  direcao?: 'direita' | 'baixo';
  estado?: Estado;
};

export function Fio({ ordem = 0, direcao = 'direita', estado = 'ok' }: PropsDoFio) {
  return (
    <span className={s.fio} data-ordem={ordem} data-direcao={direcao} data-estado={estado}>
      <span className={s.trilhoDoPulso}>
        <i className={s.pulsoDoFio} />
      </span>
    </span>
  );
}
