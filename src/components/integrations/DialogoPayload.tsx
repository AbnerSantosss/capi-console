'use client';

/**
 * "Ver payload": o JSON CRU que a plataforma entregou, sem tradução nenhuma.
 *
 * 🔴 Aqui NÃO se mascara nada, e é de propósito (B.2.13 do plano). A linha da
 * lista continua mostrando `emailMascarado` — ali o dado aparece de relance,
 * na tela aberta ao lado de quem passa. Este diálogo é o oposto: o operador
 * precisou clicar para chegar nele, e o motivo de existir é conferir por que a
 * Meta recusou um evento ou de onde saiu um valor errado. Payload mascarado
 * seria um visualizador que não visualiza. A rota `/api/inbox` já devolve o
 * payload inteiro; esta tela só imprime o que o servidor já mandou.
 */

import React from 'react';
import { toast } from 'sonner';
import { Copy, FileJson } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** O mínimo que o diálogo precisa. Estrutural para não importar o componente da lista. */
export interface ItemComPayload {
  id: string;
  recebidoEm: string;
  origem: string;
  evento?: string;
  eventoOrigem?: string;
  payload: unknown;
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/**
 * `JSON.stringify` pode estourar em objeto com ciclo. Payload vem de
 * `JSON.parse`, então ciclo é impossível na prática — mas o item `__naoLido`
 * guarda uma amostra de texto e um dia alguém guarda outra coisa aqui.
 */
function formatar(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2) ?? String(payload);
  } catch {
    return String(payload);
  }
}

export function DialogoPayload({
  item,
  onFechar,
}: {
  item: ItemComPayload | null;
  onFechar: () => void;
}) {
  const texto = item ? formatar(item.payload) : '';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Payload copiado.');
    } catch {
      toast.error('O navegador bloqueou a cópia.', {
        description: 'Selecione o texto na janela e copie pelo teclado.',
      });
    }
  };

  return (
    <Dialog open={item !== null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent
        variant="console"
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-heading font-semibold text-fg-strong">
            <FileJson className="size-5 text-accent-text" aria-hidden />
            Payload recebido
          </DialogTitle>
          <DialogDescription className="text-caption text-fg-muted">
            {item ? (
              <>
                <span className="font-mono">
                  {item.eventoOrigem ?? item.evento ?? 'sem nome de evento'}
                </span>
                {' · '}
                <span className="tabular">{hora(item.recebidoEm)}</span>
                {' · '}
                {item.origem === 'tag' ? 'tag do site' : 'webhook'}
              </>
            ) : (
              '—'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Linha longa (URL com fbclid) quebra em vez de rolar; overflow-auto fica de rede de segurança. */}
        <pre className="wrap-token max-h-[60vh] overflow-auto rounded-control border border-line bg-surface-2 p-3 font-mono text-caption whitespace-pre-wrap break-all text-fg-body">
          {texto}
        </pre>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <Button onClick={copiar}>
            <Copy className="size-4" aria-hidden />
            Copiar JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DialogoPayload;
