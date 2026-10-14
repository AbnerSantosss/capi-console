/**
 * Trilha: nós e fios lado a lado (`No`, `Fio`, `No`…). Em palco estreito
 * (menos de 23rem) vira coluna sozinha, com qualquer número de nós.
 *
 * - `comBalao`: reserva espaço em cima para um `Balao` sobre a trilha.
 * - `direcao="baixo"`: coluna sempre (use também `direcao="baixo"` nos fios).
 */

import React from 'react';

import s from './cenas.module.css';

export type PropsDaTrilha = {
  comBalao?: boolean;
  direcao?: 'direita' | 'baixo';
  children: React.ReactNode;
};

export function Trilha({ comBalao = false, direcao = 'direita', children }: PropsDaTrilha) {
  return (
    <div className={s.trilha} data-balao={comBalao || undefined} data-direcao={direcao}>
      {children}
    </div>
  );
}
