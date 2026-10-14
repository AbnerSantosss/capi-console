/**
 * Nó de uma trilha: um lugar por onde o evento passa (Site, Plataforma,
 * Console, Meta, Pixel). Rótulo de até 10 caracteres, `text-caption`.
 *
 * - `forte`: o nó que recebe (o console, quase sempre). Acende um halo quando
 *   o pulso chega; parado, fica só com o contorno no acento.
 * - `estado`: vem do dado real. 'pausado' (âmbar, pausa), 'erro' (vermelho,
 *   alerta), 'esperando' (âmbar, relógio) e 'apagado' (tracejado, apagado).
 *   O ícone do estado ocupa o lugar do `icone`.
 */

import React from 'react';

import { AlertTriangle, Clock, PauseCircle, type Icone } from '@/components/ui/icones';

import type { Estado, Ordem } from './assuntos';
import s from './cenas.module.css';

const ICONE_DO_ESTADO: Partial<Record<Estado, Icone>> = {
  pausado: PauseCircle,
  erro: AlertTriangle,
  esperando: Clock,
};

export type PropsDoNo = {
  rotulo: string;
  forte?: boolean;
  estado?: Estado;
  ordem?: Ordem;
  icone?: Icone;
};

export function No({ rotulo, forte = false, estado = 'ok', ordem = 0, icone }: PropsDoNo) {
  const Desenho = ICONE_DO_ESTADO[estado] ?? icone;
  return (
    <span
      className={`${s.no} text-caption`}
      data-forte={forte || undefined}
      data-estado={estado}
      data-ordem={ordem}
    >
      {Desenho ? <Desenho className={s.iconeDoNo} aria-hidden /> : null}
      <span>{rotulo}</span>
    </span>
  );
}
