/**
 * Ícones de assunto (padrão HyperFrames §12, O3).
 *
 * - `IconeDoAssunto`: um ícone do barril na moldura e no tamanho dos ícones
 *   da Instalação, na cor do assunto. Entra e acende UMA vez quando aparece na
 *   tela; com movimento reduzido já nasce no quadro final. Decorativo
 *   (`aria-hidden`) e não é um palco: pode ficar ao lado de um `<Palco>`.
 * - `MolduraDeIcone`: a mesma moldura para um desenho de traço próprio
 *   (os 7 ícones da Instalação), com `classesDoIcone` para o movimento.
 *
 * Os dois podem ser usados por componentes do servidor: só a `Vigia` vira
 * código do navegador, e o desenho nunca atravessa essa fronteira.
 */

import React from 'react';

import { cn } from '@/lib/utils';

import { ICONE_DO_ASSUNTO, type Assunto } from './assuntos';
import s from './cenas.module.css';
import { Vigia } from './Vigia';

export type PropsDoIconeDoAssunto = {
  assunto: Assunto;
  /** Ícone do barril `@/components/ui/icones`. Sem ele, o padrão do assunto. */
  icone?: React.ComponentType<{ className?: string }>;
  /** 1.75rem em vez de 1.25rem (o tamanho dos títulos de seção). */
  grande?: boolean;
};

export function IconeDoAssunto({ assunto, icone, grande = false }: PropsDoIconeDoAssunto) {
  const Desenho = icone ?? ICONE_DO_ASSUNTO[assunto];
  return (
    <span
      className={cn(s.icone, s.assunto, s.iconeDoAssunto)}
      data-assunto={assunto}
      data-grande={grande || undefined}
      aria-hidden
    >
      <Desenho />
      <Vigia />
    </span>
  );
}

export type PropsDaMoldura = {
  assunto: Assunto;
  grande?: boolean;
  /** Os traços do desenho, num viewBox 24 × 24. */
  children: React.ReactNode;
};

/** A moldura de traço dos ícones da Instalação: svg 24 × 24, traço 1.8. */
export function MolduraDeIcone({ assunto, grande = false, children }: PropsDaMoldura) {
  return (
    <span
      className={cn(s.icone, s.assunto, s.desenhoDeTraco)}
      data-assunto={assunto}
      data-grande={grande || undefined}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      <Vigia />
    </span>
  );
}

/** Classes de movimento dos desenhos de traço (cada uma anda uma vez). */
export const classesDoIcone = {
  chaveEsq: s.chaveEsq,
  chaveDir: s.chaveDir,
  cursor: s.cursorDoIcone,
  pulso: s.pulsoDoIcone,
  trilho: s.trilhoDoIcone,
  brilho: s.brilho,
  raioCheio: s.raioCheio,
  meridiano: s.meridiano,
  reflexo: s.reflexo,
  subindo: s.subindo,
} as const;
