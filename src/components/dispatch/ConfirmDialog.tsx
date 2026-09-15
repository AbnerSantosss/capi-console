'use client';

import React from 'react';
import { AlertTriangle, Send } from '@/components/ui/icones';

import { useEventStore } from '@/stores/useEventStore';
import { useEmq } from '@/components/quality/QualityPanel';
import { Callout } from '@/components/common/primitives';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { MarcaPublica } from '@/stores/useBrandStore';

/**
 * Confirmação de envio em produção.
 *
 * Não é um "tem certeza?" decorativo: mostra o Pixel de destino, a nota de
 * qualidade e o que está faltando, para que a leitura de dois segundos antes
 * do clique seja informada.
 *
 * É um `alertdialog` e não um `dialog` (13.4.3): o envio entra nas métricas
 * reais da conta, então clicar fora não pode descartar a pergunta e o leitor
 * de tela precisa ouvir o aviso junto do título.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirmar,
  marca,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirmar: () => void;
  marca?: MarcaPublica;
}) {
  const emq = useEmq();
  const eventName = useEventStore((s) => s.eventName);
  const customEventName = useEventStore((s) => s.customEventName);
  const value = useEventStore((s) => s.value);
  const currency = useEventStore((s) => s.currency);

  const nomeEvento =
    eventName === 'Custom' ? customEventName || 'Personalizado' : eventName;

  const valorFormatado =
    value && !Number.isNaN(Number(value))
      ? new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: currency || 'BRL',
        }).format(Number(value))
      : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-warning" aria-hidden />
            Confirmar envio real
          </AlertDialogTitle>
          <AlertDialogDescription>
            Não há código de teste ativo nesta marca.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2 rounded-control border border-line-control bg-surface-2 p-3 text-caption">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Evento</dt>
              <dd className="font-mono font-semibold text-fg-strong">
                {nomeEvento}
              </dd>
            </div>
            {valorFormatado && (
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Valor</dt>
                <dd className="font-semibold text-fg-strong tabular">
                  {valorFormatado}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Pixel</dt>
              <dd className="font-mono text-fg-body tabular">
                {marca?.pixelId ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Qualidade</dt>
              <dd className="font-semibold text-fg-body tabular">
                {emq.notaFormatada} / 10
              </dd>
            </div>
            {emq.faltando.length > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Faltando</dt>
                <dd className="text-right font-mono text-fg-muted">
                  {emq.faltando.map((p) => p.sigla).join(' · ')}
                </dd>
              </div>
            )}
          </dl>

          <Callout tone="warning" icon={AlertTriangle}>
            Esta conversão entra nas métricas oficiais da conta e alimenta o
            algoritmo de otimização. Só confirme se a venda aconteceu de verdade.
          </Callout>

          {!emq.temFbc && (
            <Callout tone="warning">
              Sem o <code className="font-mono">fbc</code> a Meta ainda registra a
              conversão pelo e-mail e telefone, mas a atribuição ao criativo pode
              ficar imprecisa.
            </Callout>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction onClick={onConfirmar}>
            <Send className="size-4" aria-hidden />
            Confirmar envio
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDialog;
