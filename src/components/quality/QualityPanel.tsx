'use client';

import React, { useState } from 'react';
import { CheckCircle2, XCircle, Gauge, Lock } from 'lucide-react';

import { useEventStore } from '@/stores/useEventStore';
import { calcularEmq, CORES_EMQ, type ResultadoEmq } from '@/lib/emq';
import { Panel, HelpTip } from '@/components/common/primitives';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { NumeroAnimado, BarraAnimada } from '@/components/common/motion';

/** Le os campos do store e devolve o EMQ. Um unico ponto de calculo. */
export function useEmq(): ResultadoEmq {
  const email = useEventStore((s) => s.email);
  const phone = useEventStore((s) => s.phone);
  const firstName = useEventStore((s) => s.firstName);
  const lastName = useEventStore((s) => s.lastName);
  const externalId = useEventStore((s) => s.externalId);
  const fbc = useEventStore((s) => s.fbc);
  const fbp = useEventStore((s) => s.fbp);
  const ip = useEventStore((s) => s.ip);
  const userAgent = useEventStore((s) => s.userAgent);
  const sourceUrl = useEventStore((s) => s.sourceUrl);
  const eventId = useEventStore((s) => s.eventId);

  return calcularEmq({
    email,
    phone,
    firstName,
    lastName,
    externalId,
    fbc,
    fbp,
    ip,
    userAgent,
    sourceUrl,
    eventId,
  });
}

/* ------------------------------------------------------------------ */
/* Painel compacto — vive no painel de controle, sempre visivel        */
/* ------------------------------------------------------------------ */

export function QualityPanel() {
  const [detalhe, setDetalhe] = useState(false);
  const emq = useEmq();
  const cor = CORES_EMQ[emq.nivel];
  const pior = emq.faltando[0];

  return (
    <>
      <Panel
        title="Qualidade do evento"
        icon={Gauge}
        tone={emq.nivel === 'alto' ? 'success' : emq.nivel === 'medio' ? 'warning' : 'danger'}
        action={
          <HelpTip
            side="left"
            content="Soma ponderada dos 9 parâmetros que a Meta usa para casar o evento com um perfil. Acima de 8.0 a atribuição ao anúncio é direta."
          />
        }
      >
        <div className="flex items-baseline gap-2">
          <span
            className={cn('text-data font-bold tabular', cor.texto)}
            aria-label={`Nota ${emq.notaFormatada} de 10`}
          >
            <NumeroAnimado valor={emq.nota} />
          </span>
          <span className="text-caption text-fg-muted tabular">/ 10</span>
          <span className={cn('ml-auto text-caption font-medium', cor.texto)}>
            {emq.rotulo}
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={emq.percentual}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Aproveitamento dos parâmetros de correspondência"
        >
          <BarraAnimada
            percentual={emq.percentual}
            corBarra={cor.barra}
            className="mt-3"
          />
        </div>

        <p className="mt-2 text-caption text-fg-muted">
          <span className="font-semibold text-fg-body tabular">
            {emq.presentes} de {emq.total}
          </span>{' '}
          parâmetros preenchidos
        </p>

        {/* Chips: estado por icone + sigla, nunca so por cor */}
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {emq.parametros.map((p) => (
            <li key={p.id}>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-micro',
                  p.presente
                    ? 'border-success/40 bg-success/10 text-success'
                    : p.critico
                      ? 'border-danger/40 bg-danger/10 text-danger'
                      : 'border-line-strong bg-surface-2 text-fg-muted'
                )}
              >
                {p.presente ? (
                  <CheckCircle2 className="size-3" aria-hidden />
                ) : (
                  <XCircle className="size-3" aria-hidden />
                )}
                {p.sigla}
                <span className="sr-only">
                  {p.presente ? ' presente' : ' ausente'}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {pior && (
          <p className="mt-3 rounded-control border border-line bg-surface-2 p-2.5 text-caption text-fg-muted">
            Maior ganho agora: preencher{' '}
            <strong className="font-mono text-fg-body">{pior.sigla}</strong> vale{' '}
            <strong className="text-fg-body tabular">+{pior.peso.toFixed(1)}</strong>{' '}
            {pior.peso === 1 ? 'ponto' : 'pontos'}.
          </p>
        )}

        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => setDetalhe(true)}
        >
          Ver os 9 parâmetros
        </Button>
      </Panel>

      <QualityModal open={detalhe} onOpenChange={setDetalhe} emq={emq} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhe — a coluna "como obter" substitui os 9 tooltips antigos     */
/* ------------------------------------------------------------------ */

export function QualityModal({
  open,
  onOpenChange,
  emq,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  emq: ResultadoEmq;
}) {
  const cor = CORES_EMQ[emq.nivel];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-heading font-semibold text-fg-strong">
            Qualidade do evento
          </DialogTitle>
          <DialogDescription className="text-caption text-fg-muted">
            Os 9 parâmetros que a Meta usa para casar esta conversão com um
            perfil no Facebook ou no Instagram.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 rounded-panel border border-line-strong bg-surface-1 p-4">
          <span className={cn('text-data font-bold tabular', cor.texto)}>
            <NumeroAnimado valor={emq.nota} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('text-label font-semibold', cor.texto)}>
              {emq.rotulo}
            </p>
            <BarraAnimada
              percentual={emq.percentual}
              corBarra={cor.barra}
              className="mt-2"
            />
            <div className="mt-1 flex justify-between text-micro text-fg-muted tabular">
              <span>0</span>
              <span>5 · mínimo aceitável</span>
              <span className="text-success">8+ · excelente</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Parâmetros de correspondência avançada e como obter cada um
            </caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 text-micro font-semibold tracking-wide text-fg-muted uppercase">
                  Parâmetro
                </th>
                <th scope="col" className="py-2 pr-3 text-micro font-semibold tracking-wide text-fg-muted uppercase">
                  Peso
                </th>
                <th scope="col" className="py-2 pr-3 text-micro font-semibold tracking-wide text-fg-muted uppercase">
                  Situação
                </th>
                <th scope="col" className="py-2 text-micro font-semibold tracking-wide text-fg-muted uppercase">
                  Como obter
                </th>
              </tr>
            </thead>
            <tbody>
              {emq.parametros.map((p) => (
                <tr key={p.id} className="border-b border-line align-top">
                  <td className="py-3 pr-3">
                    <span className="block text-label font-medium text-fg-body">
                      {p.nome}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-micro text-fg-muted">
                      {p.sigla}
                      {p.hash && (
                        <span
                          className="inline-flex items-center gap-0.5 text-success"
                          title="Criptografado em SHA-256 antes do envio"
                        >
                          <Lock className="size-2.5" aria-hidden />
                          SHA-256
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-label text-fg-body tabular">
                    {p.peso.toFixed(1)}
                    {p.critico && (
                      <span className="mt-0.5 block text-micro font-semibold text-warning uppercase">
                        crítico
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    {p.presente ? (
                      <span className="inline-flex items-center gap-1.5 text-caption font-medium text-success">
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        Preenchido
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-caption font-medium',
                          p.critico ? 'text-danger' : 'text-fg-muted'
                        )}
                      >
                        <XCircle className="size-3.5" aria-hidden />
                        Ausente
                      </span>
                    )}
                    {p.amostra && (
                      <span className="wrap-token mt-1 block max-w-40 font-mono text-micro text-fg-muted">
                        {p.amostra}
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-caption text-fg-muted">{p.comoObter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default QualityPanel;
