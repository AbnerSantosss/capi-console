/**
 * Recolhido — a explicação que fica fechada no fim da tela (seção 1.10 do
 * redesenho de 18/11/2026).
 *
 * `<details>` nativo: abre e fecha sem JavaScript, pelo teclado e pelo leitor
 * de tela. O `<summary>` é uma linha `text-label` muda com seta de 16px
 * ("Como funciona", "Por que um caminho só"). É o lugar das cenas ilustradas:
 * elas continuam existindo, mas não ficam acima do trabalho.
 */

import * as React from 'react';

import { ChevronDown } from '@/components/ui/icones';
import { cn } from '@/lib/utils';

export interface RecolhidoProps {
  /** O texto da linha que abre, ex.: "Como funciona". */
  titulo: string;
  children: React.ReactNode;
  className?: string;
}

export function Recolhido({ titulo, children, className }: RecolhidoProps) {
  return (
    <details className={cn('group min-w-0', className)}>
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control text-label text-fg-muted hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 -rotate-90 transition-transform group-open:rotate-0 motion-reduce:transition-none"
        />
        {titulo}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

export default Recolhido;
