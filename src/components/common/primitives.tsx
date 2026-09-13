'use client';

/**
 * Pecas comuns do console.
 *
 * Politica de ajuda (plano-redesign-ux-v2.md secao 6.4):
 *   1. helper text persistente  -> explicacao normal de campo
 *   2. <HelpTip>                -> so parametro tecnico que o helper nao cobre.
 *                                  Maximo 1 por linha, 3 por painel, 0 em botao.
 *   3. /guia                    -> tudo que precisa de mais de uma frase
 */

import * as React from 'react';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* ParamChip — o nome do parametro da API, fora do rotulo             */
/* ------------------------------------------------------------------ */

export function ParamChip({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <code
      className={cn(
        'rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-caption text-fg-muted',
        className
      )}
    >
      {children}
    </code>
  );
}

/* ------------------------------------------------------------------ */
/* HelpTip — tooltip com uso restrito                                  */
/* ------------------------------------------------------------------ */

export function HelpTip({
  content,
  side = 'top',
  label = 'Mais informações',
}: {
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className="relative inline-flex size-5 cursor-help items-center justify-center rounded text-fg-muted transition-colors hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text after:absolute after:top-1/2 after:left-1/2 after:size-[36px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
      >
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-72">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/* Field — rotulo + chip + controle + helper + erro                   */
/* ------------------------------------------------------------------ */

export interface FieldProps {
  id: string;
  /** No maximo 3 palavras. Sem traducao entre parenteses. */
  label: string;
  /** Nome do parametro da Meta, renderizado como chip mono ao lado. */
  param?: string;
  /** Persistente, 12px. Uma frase, ate ~90 caracteres. */
  helper?: React.ReactNode;
  /** Mensagem de erro. Coexiste com o helper, nao o substitui. */
  error?: string;
  /** Use com parcimonia — ver politica no topo do arquivo. */
  tip?: React.ReactNode;
  required?: boolean;
  /** Conteudo extra a direita do rotulo (ex.: botao "agora"). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  id,
  label,
  param,
  helper,
  error,
  tip,
  required,
  action,
  className = '',
  children,
}: FieldProps) {
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <label
            htmlFor={id}
            className="cursor-pointer text-label font-medium text-fg-body"
          >
            {label}
            {required && (
              <span className="ml-1 text-danger" aria-hidden>
                *
              </span>
            )}
            {required && <span className="sr-only"> (obrigatório)</span>}
          </label>
          {param && <ParamChip>{param}</ParamChip>}
          {tip && <HelpTip content={tip} />}
        </div>
        {action}
      </div>

      {/* O controle recebe os ids de descricao via contexto do consumidor. */}
      <FieldDescribedBy.Provider value={{ describedBy, invalid: Boolean(error) }}>
        {children}
      </FieldDescribedBy.Provider>

      {helper && (
        <p id={helperId} className="text-caption text-fg-muted">
          {helper}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-caption font-medium text-danger"
        >
          <span aria-hidden>⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/** Liga automaticamente aria-describedby / aria-invalid ao controle do Field. */
const FieldDescribedBy = React.createContext<{
  describedBy?: string;
  invalid: boolean;
}>({ invalid: false });

export function useFieldA11y() {
  const { describedBy, invalid } = React.useContext(FieldDescribedBy);
  return {
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
  } as const;
}

/* ------------------------------------------------------------------ */
/* Section — passo numerado da coluna de trabalho                      */
/* ------------------------------------------------------------------ */

export function Section({
  step,
  title,
  description,
  action,
  children,
  className = '',
  id,
  icon: Icon,
  variant = 'plain',
}: {
  step?: number;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  icon?: React.ElementType;
  variant?: 'plain' | 'card';
}) {
  const headingId = id ? `${id}-titulo` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col gap-4 scroll-mt-32',
        variant === 'card' &&
          'rounded-xl border border-line-strong bg-surface-1/95 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.14)] sm:p-6',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-3">
          {step !== undefined && (
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 font-mono text-caption font-semibold text-fg-muted"
            >
              {step}
            </span>
          )}
          <div className="min-w-0">
            <h2
              id={headingId}
              className="flex items-center gap-2 text-title font-semibold text-fg-strong"
            >
              {Icon && (
                <Icon
                  className="size-5 shrink-0 text-accent-text"
                  strokeWidth={1.75}
                  aria-hidden
                />
              )}
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-caption text-fg-muted">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* StatusDot — nunca comunica estado so pela cor                       */
/* ------------------------------------------------------------------ */

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

const TONE: Record<Tone, { dot: string; text: string }> = {
  success: { dot: 'bg-success', text: 'text-success' },
  warning: { dot: 'bg-warning', text: 'text-warning' },
  danger: { dot: 'bg-danger', text: 'text-danger' },
  accent: { dot: 'bg-accent-text', text: 'text-accent-text' },
  neutral: { dot: 'bg-fg-disabled', text: 'text-fg-muted' },
};

export function StatusDot({
  tone = 'neutral',
  icon: Icon,
  children,
  className = '',
}: {
  tone?: Tone;
  icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5', t.text, className)}>
      {Icon ? (
        <Icon className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <span className={cn('size-2 shrink-0 rounded-full', t.dot)} aria-hidden />
      )}
      <span className="text-caption font-medium">{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Panel — superficie do painel de controle                            */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className = '',
  tone = 'default',
}: {
  title?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const borda = {
    default: 'border-line-strong',
    warning: 'border-warning/40',
    danger: 'border-danger/40',
    success: 'border-success/40',
  }[tone];

  return (
    <div
      className={cn(
        'rounded-panel border bg-surface-1 p-4',
        borda,
        className
      )}
    >
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-caption font-semibold tracking-wide text-fg-muted uppercase">
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Callout — aviso inline                                              */
/* ------------------------------------------------------------------ */

export function Callout({
  tone = 'warning',
  icon: Icon,
  title,
  children,
  className = '',
  id,
}: {
  tone?: 'warning' | 'danger' | 'success' | 'info';
  icon?: React.ElementType;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const estilo = {
    warning: 'border-warning/40 bg-warning/8 text-warning',
    danger: 'border-danger/40 bg-danger/8 text-danger',
    success: 'border-success/40 bg-success/8 text-success',
    info: 'border-accent-text/40 bg-accent-text/8 text-accent-text',
  }[tone];

  return (
    <div
      id={id}
      className={cn(
        'flex items-start gap-2.5 rounded-control border p-3',
        estilo,
        className
      )}
    >
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="text-label font-semibold">{title}</p>}
        {children && (
          <div className={cn('text-caption text-fg-body', title && 'mt-1')}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GuiaLink — leva para a documentacao em vez de virar mais um tooltip */
/* ------------------------------------------------------------------ */

export function GuiaLink({
  anchor,
  children,
}: {
  anchor: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/guia#${anchor}`}
      className="text-accent-text underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}
