'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/common/primitives';
import { cn } from '@/lib/utils';
import type { DispatchResult } from './tipos';

export function ResultPanel({
  resultado,
  onClose,
}: {
  resultado: DispatchResult;
  onClose: () => void;
}) {
  const [tecnico, setTecnico] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const resposta = resultado.dados?.resposta;
  const atribuicao = resultado.dados?.atribuicao;
  const fbtrace = resposta?.fbtrace_id ?? resposta?.error?.fbtrace_id;
  const ok = resultado.sucesso;

  const copiar = async (texto: string, chave: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(chave);
    setTimeout(() => setCopiado(null), 2000);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-panel border bg-surface-1 p-5',
        ok ? 'border-success/50' : 'border-danger/50'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {ok ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          )}
          <div className="min-w-0">
            <h2
              className={cn(
                'text-title font-semibold',
                ok ? 'text-success' : 'text-danger'
              )}
            >
              {ok ? 'Evento recebido pela Meta' : 'A Meta recusou o evento'}
            </h2>
            <p className="mt-1 text-caption text-fg-muted tabular">
              HTTP {resultado.httpStatus}
              {resposta?.events_received !== undefined &&
                ` · ${resposta.events_received} evento confirmado`}
            </p>
          </div>
        </div>

        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Fechar o resultado"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      {/* Erros */}
      {!ok && (resultado.erros?.length ?? 0) > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {resultado.erros!.map((e, i) => (
            <li key={i}>
              <Callout tone="danger" icon={AlertTriangle}>
                {e}
              </Callout>
            </li>
          ))}
        </ul>
      )}

      {/* Rastreio + criativo */}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {fbtrace && (
          <div className="rounded-control border border-line-strong bg-surface-2 p-3">
            <dt className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
              fbtrace_id
            </dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="wrap-token min-w-0 flex-1 font-mono text-caption text-fg-body">
                {fbtrace}
              </code>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => copiar(fbtrace, 'trace')}
                aria-label="Copiar o fbtrace_id"
              >
                {copiado === 'trace' ? (
                  <Check className="size-3.5 text-success" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
              </Button>
            </dd>
          </div>
        )}

        {atribuicao?.adId && (
          <div className="rounded-control border border-line-strong bg-surface-2 p-3">
            <dt className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
              Criativo que converteu
            </dt>
            <dd className="mt-1 flex flex-col gap-1.5">
              <code className="font-mono text-caption text-fg-body tabular">
                {atribuicao.adId}
              </code>
              <div className="flex flex-wrap gap-3 text-caption">
                {atribuicao.links.anuncio && (
                  <a
                    href={atribuicao.links.anuncio}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent-text underline-offset-2 hover:underline"
                  >
                    Abrir no Gerenciador
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
                {atribuicao.links.biblioteca && (
                  <a
                    href={atribuicao.links.biblioteca}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent-text underline-offset-2 hover:underline"
                  >
                    Biblioteca de Anúncios
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </div>
            </dd>
          </div>
        )}
      </dl>

      {atribuicao && atribuicao.faltando.length > 0 && (
        <Callout tone="warning" icon={AlertTriangle} className="mt-3">
          Link do criativo incompleto. Faltou: {atribuicao.faltando.join(', ')}.
        </Callout>
      )}

      {/* Detalhe tecnico */}
      <div className="mt-4 border-t border-line pt-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setTecnico((v) => !v)}
          aria-expanded={tecnico}
        >
          <ChevronDown
            className={cn('size-3.5 transition-transform', tecnico && 'rotate-180')}
            aria-hidden
          />
          {tecnico ? 'Ocultar' : 'Ver'} resposta técnica
        </Button>

        {tecnico && (
          <div className="mt-3 flex flex-col gap-3">
            <BlocoJson
              titulo="Resposta da Meta"
              dados={resposta}
              onCopiar={(t) => copiar(t, 'resp')}
              copiado={copiado === 'resp'}
            />
            <BlocoJson
              titulo="Payload enviado"
              dados={resultado.dados?.eventoMontado}
              onCopiar={(t) => copiar(t, 'payload')}
              copiado={copiado === 'payload'}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BlocoJson({
  titulo,
  dados,
  onCopiar,
  copiado,
}: {
  titulo: string;
  dados: unknown;
  onCopiar: (t: string) => void;
  copiado: boolean;
}) {
  if (!dados) return null;
  const texto = JSON.stringify(dados, null, 2);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
          {titulo}
        </p>
        <Button size="sm" variant="ghost" onClick={() => onCopiar(texto)}>
          {copiado ? (
            <Check className="size-3.5 text-success" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          Copiar
        </Button>
      </div>
      <pre className="wrap-token max-h-64 overflow-auto rounded-control border border-line-strong bg-surface-2 p-3 font-mono text-caption text-fg-muted">
        {texto}
      </pre>
    </div>
  );
}

export default ResultPanel;
