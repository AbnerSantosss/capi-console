'use client';

/**
 * Palco: a moldura de UMA cena (padrão HyperFrames §2.2).
 *
 * - A cena é ilustração: `aria-hidden` fixo, nunca recebe foco nem link. O que
 *   ela mostra tem de estar também no texto ao lado.
 * - O movimento só começa quando 30% do palco está na tela
 *   (`data-visivel`) e para com a aba do navegador escondida (`data-oculto`).
 * - `estado` vem do dado real e é a fonte ÚNICA do laço contínuo: só o estado
 *   "esperando" repete sem parar, e só ele ganha o botão "Pausar animação",
 *   que fica FORA da parte escondida do leitor de tela.
 * - `ciclos` (padrão 2) diz quantas vezes o pulso e os balões repetem antes
 *   de parar no quadro final. Com 2, a cena inteira cabe em 5 s.
 *
 * Só recebe props simples (texto e número) + `children`, para poder ser usado
 * por componentes do servidor.
 */

import React, { useState } from 'react';

import { cn } from '@/lib/utils';

import type { Assunto, Estado } from './assuntos';
import s from './cenas.module.css';
import { Vigia } from './Vigia';

export type AlturaDoPalco = 'baixa' | 'media' | 'livre';

export type PropsDoPalco = {
  assunto: Assunto;
  /** Estado real da cena inteira. Padrão: 'ok'. */
  estado?: Estado;
  /** Repetições do pulso e dos balões depois da entrada. Padrão: 2. */
  ciclos?: 1 | 2 | 3;
  /** 'baixa' = 7rem, 'media' = 8.5rem (a aprovada), 'livre' = cresce com o conteúdo (funil). */
  altura?: AlturaDoPalco;
  children: React.ReactNode;
};

export function Palco({ assunto, estado = 'ok', ciclos = 2, altura = 'media', children }: PropsDoPalco) {
  const [parado, setParado] = useState(false);
  const emEspera = estado === 'esperando';

  return (
    <div className={s.comControle}>
      <div
        className={cn(s.palco, s.assunto)}
        aria-hidden
        data-assunto={assunto}
        data-estado={estado}
        data-altura={altura}
        data-ciclos={ciclos}
        data-pausado={(emEspera && parado) || undefined}
      >
        {/* Escreve data-visivel (30% na tela) e data-oculto (aba escondida) neste palco. */}
        <Vigia />
        <div className={s.cena}>{children}</div>
      </div>
      {emEspera ? (
        <button
          type="button"
          className={cn(s.pausar, 'text-caption')}
          aria-pressed={parado}
          onClick={() => setParado((atual) => !atual)}
        >
          Pausar animação
        </button>
      ) : null}
    </div>
  );
}
