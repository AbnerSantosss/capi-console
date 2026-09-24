'use client';

/**
 * Selo numerado LOCAL de uma etapa clicável — não é o `step` de `Section`
 * (`primitives.tsx:324-330`).
 *
 * Por que um componente à parte em vez de reaproveitar/editar o de
 * `primitives.tsx`: aquele arquivo tem 25 consumidores em 10 rotas, e o selo
 * de lá é ORNAMENTO puro (`aria-hidden`, nunca um controle). Este aqui é
 * outra coisa — um `<button>` que abre o `ModalDeEtapa` — e uma mudança de
 * COMPORTAMENTO ali obrigaria a conferir as dez rotas de novo. Vive fora,
 * em `src/components/instalacao/`, para quem precisa de selo clicável usar
 * este e ninguém mais correr esse risco.
 *
 * Contraste corrigido em relação ao selo antigo de `OndeInstalarTag.tsx`
 * (`bg-surface-3 text-fg-muted`, medido em 4,81:1 dentro de um círculo de
 * 20px — o número que o operador mais olha): agora `bg-surface-2
 * text-fg-strong`, `border-line-control` mantida, e `size-6` (24px) no
 * lugar de `size-5`.
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

export interface SeloDeEtapaProps
  extends Omit<React.ComponentProps<'button'>, 'aria-label' | 'children'> {
  /** Número do passo (1-based) — o que aparece dentro do selo. */
  numero: number;
  /**
   * Resumo em TEXTO PURO do passo (sem JSX), usado só para montar o
   * `aria-label` (`Passo N: <titulo>`). O passo em si costuma ser
   * `React.ReactNode` com `<strong>`/`<em>` embutido — use `resumoDeEtapa()`
   * deste arquivo para extrair o texto antes de passar aqui.
   */
  titulo: string;
}

export function SeloDeEtapa({
  numero,
  titulo,
  className,
  ...props
}: SeloDeEtapaProps) {
  return (
    <button
      type="button"
      aria-label={`Passo ${numero}: ${titulo}`}
      className={cn(
        'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-control bg-surface-2 font-mono text-caption font-semibold tabular text-fg-strong transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto',
        className
      )}
      {...props}
    >
      {numero}
    </button>
  );
}

/**
 * Extrai o texto puro de um `React.ReactNode` — percorre `<strong>`, `<em>`,
 * fragmentos e arrays recursivamente e concatena só as strings. Não usa
 * `react-dom/server` de propósito: isso bastaria para HTML, mas o objetivo
 * aqui é só juntar texto para um `aria-label`, não gerar marcação.
 */
export function textoPlano(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textoPlano).join('');
  }
  if (React.isValidElement(node)) {
    const { children } = node.props as { children?: React.ReactNode };
    return textoPlano(children);
  }
  return '';
}

/**
 * `textoPlano()` já pronto para virar continuação de "Passo N:" — primeira
 * letra minúscula, sem ponto final. Reaproveitável por qualquer outra tela
 * com sequência numerada (webhook do xWinner, disparo manual).
 */
export function resumoDeEtapa(node: React.ReactNode): string {
  const texto = textoPlano(node).trim().replace(/\.$/, '');
  if (!texto) return '';
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

export default SeloDeEtapa;
