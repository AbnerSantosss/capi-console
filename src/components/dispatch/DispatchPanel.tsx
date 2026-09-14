'use client';

import React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, Eraser, FlaskConical, Target } from 'lucide-react';

import { useEventStore } from '@/stores/useEventStore';
import { useEmq } from '@/components/quality/QualityPanel';
// C-18: um so spinner no produto. O `Loader2` solto vivia aqui em duas
// copias; agora as duas chamam a mesma peca de `common/Esqueleto`.
import { Spinner } from '@/components/common/Esqueleto';
import { janelaRestante } from '@/lib/event-schema';
import { Panel, StatusDot, Callout } from '@/components/common/primitives';
import { Button, buttonVariants } from '@/components/ui/button';
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
  /**
   * Chamado quando o disparo para por falta de token: leva para onde o token
   * se resolve. Desde a criacao de /pixels isso e uma navegacao, e nao a
   * abertura de um modal — por isso os botoes "Trocar pixel" abaixo viraram
   * link, e so este caminho, que parte de dentro do `useDisparo`, continua
   * sendo uma funcao.
   */
  onAbrirMarcas: () => void;
}

/** Um so destino, um so link: "Trocar pixel" leva para a pagina dos Pixels. */
const LINK_TROCAR_PIXEL = '/pixels';

export function DestinationSummary() {
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
        <Link
          href={LINK_TROCAR_PIXEL}
          className={buttonVariants({ size: 'sm', variant: 'ghost' })}
        >
          Trocar pixel
        </Link>
      }
    >
      <dl className="grid gap-3 text-caption sm:grid-cols-3">
        {/* 8.B: o nome E a identidade do Pixel, e o ID do Pixel e o dado
            tecnico logo abaixo. Ate aqui eram dois rotulos — "Marca" e
            "Pixel" — para um unico registro, o que sugeria duas entidades
            onde ha uma. */}
        <div className="sm:col-span-2">
          <dt className="text-fg-muted">Pixel de destino</dt>
          <dd className="mt-1 flex min-w-0 flex-col">
            <span className="truncate text-title font-medium text-fg-strong">
              {ativa?.nome ?? '—'}
            </span>
            <span className="wrap-token font-mono text-caption text-fg-muted tabular">
              {ativa?.pixelId || '—'}
            </span>
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
      {/* A linha que separa esta tela do disparo automático, dita onde a mão
          do operador está: aqui é um evento por vez, conferido, e nada anda
          sozinho. O aviso de evento real continua abaixo, dentro do Panel —
          são coisas diferentes: este diz COMO sai, aquele diz o que sair
          custa. */}
      <p className="text-caption text-fg-muted">
        Um evento por vez, revisado por você. Nada vai para a Meta antes de você
        clicar em{' '}
        <strong className="font-medium text-fg-body">Disparar evento</strong>.
      </p>

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
          {/* 8.B: um bloco de identidade, nao dois rotulos. */}
          <div className="flex flex-col gap-0.5">
            <dt className="sr-only">Pixel de destino</dt>
            <dd className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <MetaMark size={14} />
                <span className="truncate text-title font-medium text-fg-strong">
                  {d.ativa?.nome ?? '—'}
                </span>
              </span>
              <span className="wrap-token font-mono text-caption text-fg-muted tabular">
                {d.ativa?.pixelId || '—'}
              </span>
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
              <Spinner />
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
        className="sticky bottom-0 z-30 border-t border-line-strong bg-surface-0/95 backdrop-blur-md xl:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href={LINK_TROCAR_PIXEL}
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
          </Link>

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
                <Spinner />
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
