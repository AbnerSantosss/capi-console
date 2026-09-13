'use client';

import React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Eraser, FlaskConical, Loader2, Target } from 'lucide-react';

import { useEventStore } from '@/stores/useEventStore';
import { useEmq } from '@/components/quality/QualityPanel';
import { janelaRestante } from '@/lib/event-schema';
import { Panel, StatusDot, Callout } from '@/components/common/primitives';
import { Button } from '@/components/ui/button';
import { MetaMark } from '@/components/ui/brand-icons';
import { NumeroAnimado } from '@/components/common/motion';
import { ConfirmDialog } from './ConfirmDialog';
import { useDisparo } from './useDisparo';
import { CORES_EMQ } from '@/lib/emq';
import { cn } from '@/lib/utils';
import type { DispatchResult } from './tipos';
import { useBrandStore } from '@/stores/useBrandStore';

interface Props {
  onResult: (r: DispatchResult) => void;
  onAbrirMarcas: () => void;
}

export function DestinationSummary({ onAbrirMarcas }: { onAbrirMarcas: () => void }) {
  const marcas = useBrandStore((state) => state.marcas);
  const marcaAtivaId = useBrandStore((state) => state.marcaAtivaId);
  const ativa = marcas.find((marca) => marca.id === marcaAtivaId) ?? marcas[0];
  const emTeste = Boolean(ativa?.testCode?.trim());

  return (
    <Panel
      title="Pixel e ambiente"
      icon={Target}
      tone={emTeste ? 'default' : 'warning'}
      action={
        <Button size="sm" variant="ghost" onClick={onAbrirMarcas}>
          Trocar pixel
        </Button>
      }
    >
      <dl className="grid gap-3 text-caption sm:grid-cols-3">
        <div>
          <dt className="text-fg-muted">Marca</dt>
          <dd className="mt-1 font-medium text-fg-body">{ativa?.nome ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Pixel</dt>
          <dd className="mt-1 wrap-token font-mono text-fg-body tabular">
            {ativa?.pixelId || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">Ambiente e token</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2">
            <StatusDot tone={emTeste ? 'accent' : 'warning'}>
              {emTeste ? 'Teste' : 'Produção'}
            </StatusDot>
            <StatusDot tone={ativa?.temToken ? 'success' : 'danger'}>
              {ativa?.temToken ? 'Token configurado' : 'Token ausente'}
            </StatusDot>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

/* ================================================================== */
/* Painel lateral — a partir de 1280px                                */
/* ================================================================== */

export function DispatchPanel({ onResult, onAbrirMarcas }: Props) {
  const d = useDisparo(onResult, onAbrirMarcas);

  const eventName = useEventStore((s) => s.eventName);
  const customEventName = useEventStore((s) => s.customEventName);
  const eventTime = useEventStore((s) => s.eventTime);
  const reset = useEventStore((s) => s.reset);

  const nomeEvento =
    eventName === 'Custom' ? customEventName || 'Personalizado' : eventName;
  const janela = janelaRestante(eventTime);

  return (
    <>
      <Panel
        title="Pixel de destino"
        icon={Target}
        tone={d.emTeste ? 'default' : 'warning'}
        action={
          <Button size="sm" variant="ghost" onClick={onAbrirMarcas}>
            Trocar pixel
          </Button>
        }
      >
        <dl className="flex flex-col gap-2 text-caption">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-muted">Marca</dt>
            <dd className="flex min-w-0 items-center gap-1.5 font-medium text-fg-body">
              <MetaMark size={14} />
              <span className="truncate">{d.ativa?.nome ?? '—'}</span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-muted">Pixel</dt>
            <dd className="font-mono text-fg-body tabular">
              {d.ativa?.pixelId || '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-muted">Token</dt>
            <dd>
              <StatusDot tone={d.ativa?.temToken ? 'success' : 'danger'}>
                {d.ativa?.temToken ? 'configurado' : 'ausente'}
              </StatusDot>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-muted">Evento</dt>
            <dd className="font-mono font-medium text-fg-body">{nomeEvento}</dd>
          </div>
          {janela && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-muted">Janela</dt>
              <dd>
                <StatusDot tone={janela.expirado ? 'danger' : 'neutral'}>
                  {janela.texto}
                </StatusDot>
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-3 border-t border-line pt-3">
          {d.emTeste ? (
            <Callout tone="info" icon={FlaskConical}>
              Modo teste com o código{' '}
              <code className="font-mono">{d.ativa?.testCode}</code>. O evento
              aparece em <strong>Testar eventos</strong> e não entra nas métricas.
            </Callout>
          ) : (
            <Callout tone="warning" icon={AlertTriangle} title="Produção — evento real">
              Esta conversão entra nas métricas da conta e alimenta o algoritmo.
              Só dispare vendas que aconteceram de verdade.
            </Callout>
          )}
        </div>
      </Panel>

      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="w-full"
          onClick={d.solicitar}
          disabled={d.enviando}
        >
          {d.enviando ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Enviando…
            </>
          ) : (
            <>
              <MetaMark size={16} mono />
              Disparar evento
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            reset();
            toast.success('Formulário limpo.');
          }}
          disabled={d.enviando}
        >
          <Eraser className="size-4" aria-hidden />
          Limpar
        </Button>
      </div>

      <ConfirmDialog
        open={d.confirmar}
        onOpenChange={d.setConfirmar}
        marca={d.ativa}
        onConfirmar={() => {
          d.setConfirmar(false);
          void d.executar();
        }}
      />
    </>
  );
}

/* ================================================================== */
/* Barra fixa inferior — abaixo de 1280px                             */
/* ================================================================== */

/**
 * Sem isto, em notebook ou celular o operador precisaria rolar todo o
 * formulário para encontrar o botão. A barra carrega o mínimo para decidir:
 * ambiente, nota de qualidade e a ação.
 */
export function DispatchBar({ onResult, onAbrirMarcas }: Props) {
  const d = useDisparo(onResult, onAbrirMarcas);
  const emq = useEmq();
  const cor = CORES_EMQ[emq.nivel];

  return (
    <>
      <div
        className="sticky bottom-0 z-30 border-t border-line-strong bg-surface-0/95 backdrop-blur-md min-[1200px]:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onAbrirMarcas}
            className={cn(
              'flex h-control-lg shrink-0 items-center gap-2 rounded-control border px-3 text-caption font-semibold tracking-wide uppercase',
              d.emTeste
                ? 'border-accent-text/40 bg-accent-text/10 text-accent-text'
                : 'border-warning/50 bg-warning/10 text-warning'
            )}
          >
            {d.emTeste ? (
              <FlaskConical className="size-4" aria-hidden />
            ) : (
              <AlertTriangle className="size-4" aria-hidden />
            )}
            <span>
              {d.emTeste ? 'Teste' : 'Produção'}
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <p className={cn('text-label font-bold tabular', cor.texto)}>
              <NumeroAnimado valor={emq.nota} />
              <span className="text-caption font-normal text-fg-muted"> / 10</span>
            </p>
            <p className="truncate text-caption text-fg-muted">
              {emq.presentes} de {emq.total} parâmetros
            </p>
          </div>

          <Button size="lg" onClick={d.solicitar} disabled={d.enviando}>
            {d.enviando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Enviando…
              </>
            ) : (
              <>
                <MetaMark size={16} mono />
                Disparar
              </>
            )}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={d.confirmar}
        onOpenChange={d.setConfirmar}
        marca={d.ativa}
        onConfirmar={() => {
          d.setConfirmar(false);
          void d.executar();
        }}
      />
    </>
  );
}

export default DispatchPanel;
