/**
 * ListaEmLinhas — a lista de itens iguais num painel só, uma linha por item
 * (seção 1.9 do redesenho de 18/11/2026). Substitui a grade de cartões iguais.
 *
 *   <ListaEmLinhas rotulo="Sites">
 *     <LinhaDaLista
 *       inicio={<StatusDot tone="warning">…</StatusDot>}
 *       titulo="loja.exemplo.com.br"
 *       detalhe="CNAME aguardando"
 *       fim={<Button variant="outline" size="sm">Conferir</Button>}
 *     />
 *   </ListaEmLinhas>
 *
 * Cada linha tem no mínimo 44px e quatro lugares: início (ponto de estado ou
 * ícone de 16px), título (`text-label` semibold, cortado com reticências),
 * detalhe (`text-caption` mudo) e fim (no máximo um selo e uma ação
 * `outline sm`). O estado é dito uma vez por linha.
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

export interface ListaEmLinhasProps {
  children: React.ReactNode;
  /** Nome acessível da lista, quando a tela não tem um título logo acima. */
  rotulo?: string;
  className?: string;
}

export function ListaEmLinhas({ children, rotulo, className }: ListaEmLinhasProps) {
  return (
    <ul
      aria-label={rotulo}
      className={cn(
        'min-w-0 divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface-1',
        className
      )}
    >
      {children}
    </ul>
  );
}

export interface LinhaDaListaProps {
  inicio?: React.ReactNode;
  titulo: React.ReactNode;
  detalhe?: React.ReactNode;
  fim?: React.ReactNode;
  /** Conteúdo que abre embaixo da linha (ex.: a tabela de DNS de um site). */
  children?: React.ReactNode;
  className?: string;
}

export function LinhaDaLista({ inicio, titulo, detalhe, fim, children, className }: LinhaDaListaProps) {
  return (
    <li className={cn('min-w-0', className)}>
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
          {inicio && <span className="flex shrink-0 items-center">{inicio}</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-label font-semibold text-fg-strong">{titulo}</p>
            {detalhe && <p className="truncate text-caption text-fg-muted">{detalhe}</p>}
          </div>
        </div>
        {fim && <div className="flex shrink-0 items-center gap-2">{fim}</div>}
      </div>
      {children && <div className="border-t border-line px-4 py-3">{children}</div>}
    </li>
  );
}

export default ListaEmLinhas;
