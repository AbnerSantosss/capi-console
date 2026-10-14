/**
 * Janela do navegador: a barra com os três pontinhos e o endereço
 * (`text-caption`, corta com reticências) e o corpo na cor do acento.
 * `CodigoComCursor` é o `</>` com o cursor que pisca três vezes e fica aceso.
 */

import React from 'react';

import type { Ordem } from './assuntos';
import s from './cenas.module.css';

export type PropsDaJanela = {
  endereco: string;
  ordem?: Ordem;
  children: React.ReactNode;
};

export function JanelaDoNavegador({ endereco, ordem = 0, children }: PropsDaJanela) {
  return (
    <div className={s.janela} data-ordem={ordem}>
      <div className={s.janelaBarra}>
        <span />
        <span />
        <span />
        <em className="text-caption">{endereco}</em>
      </div>
      <div className={s.janelaCorpo}>{children}</div>
    </div>
  );
}

export function CodigoComCursor() {
  return (
    <svg
      className={s.codigo}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 7 3 12l5 5" />
      <path d="m16 7 5 5-5 5" />
      <path className={s.cursor} d="M12.8 5.5 11.2 18.5" />
    </svg>
  );
}
