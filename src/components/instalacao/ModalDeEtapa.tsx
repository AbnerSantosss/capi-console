'use client';

/**
 * Modal de etapa — componente COMUM para as sequências numeradas do console
 * (instalação por GTM/site aqui, webhook do xWinner e disparo manual nas
 * próximas tarefas do plano). Abre o conteúdo completo de UM passo por vez,
 * com o número e o título no cabeçalho — a lista da página continua sendo o
 * resumo; isto aqui é o detalhe, com mais espaço para ler.
 *
 * Usa `ui/dialog.tsx` (fundo `--surface-3`) sem a prop `variant`: ela está
 * marcada `@deprecated` ali — "não faz nada" — e não deve voltar a aparecer
 * em código novo.
 */

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface ModalDeEtapaProps {
  /** Número do passo (1-based), mostrado no selo do cabeçalho. */
  numero: number;
  /** Título da etapa (curto — cabe ao lado do selo no cabeçalho). */
  titulo: React.ReactNode;
  /** Controla se o modal está aberto. */
  aberto: boolean;
  /** Chamado ao fechar — clique fora, Esc, X ou o botão "Fechar". */
  aoFechar: () => void;
  /** Conteúdo completo do passo. */
  children: React.ReactNode;
  className?: string;
}

export function ModalDeEtapa({
  numero,
  titulo,
  aberto,
  aoFechar,
  children,
  className,
}: ModalDeEtapaProps) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent
        className={cn('w-[calc(100vw-2rem)] sm:max-w-md', className)}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-control bg-surface-2 font-mono text-caption font-semibold tabular text-fg-strong"
            >
              {numero}
            </span>
            <span className="min-w-0">{titulo}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="text-body text-fg-body">{children}</div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ModalDeEtapa;
