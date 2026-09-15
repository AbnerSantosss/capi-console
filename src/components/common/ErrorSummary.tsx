'use client';

import React from 'react';
import { AlertTriangle } from '@/components/ui/icones';

import { useEventStore } from '@/stores/useEventStore';

/**
 * Resumo focavel de erros, exibido depois de uma tentativa de disparo.
 * Cada item leva ao campo correspondente — regra `error-summary` +
 * `focus-management`. Os erros inline continuam nos campos.
 */

const ID_DO_CAMPO: Record<string, string> = {
  eventName: 'campo-evento',
  customEventName: 'campo-custom',
  eventTime: 'campo-quando',
  eventId: 'campo-eventid',
  value: 'campo-valor',
  currency: 'campo-moeda',
  sourceUrl: 'campo-url',
  email: 'campo-email',
  phone: 'campo-telefone',
  ip: 'campo-ip',
  fbc: 'campo-fbc',
  fbp: 'campo-fbp',
};

export function ErrorSummary() {
  const submetido = useEventStore((s) => s.submetido);
  const erros = useEventStore((s) => s.erros)();

  if (!submetido || erros.length === 0) return null;

  return (
    <div
      id="resumo-erros"
      tabIndex={-1}
      role="alert"
      className="rounded-panel border border-danger/50 bg-danger/8 p-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
    >
      <p className="flex items-center gap-2 text-title font-semibold text-danger">
        <AlertTriangle className="size-5" aria-hidden />
        {erros.length === 1
          ? 'Corrija 1 campo antes de disparar'
          : `Corrija ${erros.length} campos antes de disparar`}
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {erros.map((e) => {
          const alvo = ID_DO_CAMPO[e.campo];
          return (
            <li key={e.campo} className="text-body text-fg-body">
              {alvo ? (
                <a
                  href={`#${alvo}`}
                  onClick={(ev) => {
                    ev.preventDefault();
                    const el = document.getElementById(alvo);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el?.focus();
                  }}
                  className="text-danger underline underline-offset-2 hover:no-underline"
                >
                  {e.mensagem}
                </a>
              ) : (
                <span>{e.mensagem}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ErrorSummary;
