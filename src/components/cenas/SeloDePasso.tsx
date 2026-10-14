/**
 * O número grande do passo, no acento (decorativo, `aria-hidden`).
 * Não substitui `instalacao/SeloDeEtapa.tsx`, que é um botão.
 *
 * - 'atual' (padrão): preenchido no acento.
 * - 'feito': preenchido, com o check no lugar do número.
 * - 'proximo': só o contorno.
 *
 * A cor vem do cartão/palco em volta, ou de `assunto`.
 */

import React from 'react';

import { Check } from '@/components/ui/icones';
import { cn } from '@/lib/utils';

import type { Assunto } from './assuntos';
import s from './cenas.module.css';

export type PropsDoSelo = {
  numero: number;
  estado?: 'atual' | 'feito' | 'proximo';
  assunto?: Assunto;
};

export function SeloDePasso({ numero, estado = 'atual', assunto }: PropsDoSelo) {
  return (
    <span
      className={cn(s.selo, assunto && s.assunto, 'text-title')}
      data-assunto={assunto}
      data-estado={estado}
      aria-hidden
    >
      {estado === 'feito' ? <Check className={s.marca} /> : numero}
    </span>
  );
}
