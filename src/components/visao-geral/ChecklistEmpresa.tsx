'use client';

/**
 * A faixa do rodapé da Visão geral (V5 do plano v7; spec :27, :104):
 * "Configuração x de 6 · <passo pendente> · Ver configuração".
 *
 *  - Clicar em "Configuração x de 6" abre (e fecha) a lista dos 6 passos, cada
 *    um com o estado em TEXTO e cor, a prova (ou o que falta) e o verbo que
 *    resolve, levando à aba certa.
 *  - "Ver configuração" leva direto à aba do próximo passo: é o clique do dia
 *    em que falta alguma coisa.
 *  - O passo Domínio não tem prova nesta rodada, então a conta para em "5 de 6"
 *    e a frase dele diz isso, sem fingir um verde.
 */

import Link from 'next/link';
import { useId, useState } from 'react';
import consoleStyles from '@/components/layout/console.module.css';
import { StatusDot } from '@/components/common/primitives';
import { buttonVariants } from '@/components/ui/button';
import { ChevronDown } from '@/components/ui/icones';
import type { ChecklistDaEmpresa, EstadoDoPasso } from '@/lib/checklist-empresa';
import { cn } from '@/lib/utils';

const TOM_DO_PASSO: Record<EstadoDoPasso, 'success' | 'warning' | 'accent' | 'danger'> = {
  feito: 'success',
  pendente: 'warning',
  andamento: 'accent',
  erro: 'danger',
};

const ROTULO_DO_PASSO: Record<EstadoDoPasso, string> = {
  feito: 'Feito',
  pendente: 'Pendente',
  andamento: 'Em andamento',
  erro: 'Com erro',
};

export function ChecklistEmpresa({
  checklist,
  className,
}: {
  checklist: ChecklistDaEmpresa;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const idLista = `checklist-${base}`;
  const { proximo } = checklist;

  return (
    <section
      aria-label="Configuração da empresa"
      className={cn(consoleStyles.painel, 'flex min-w-0 flex-col gap-3 p-3 sm:px-5 sm:py-4', className)}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-controls={idLista}
          className="inline-flex items-center gap-1.5 rounded-control text-label font-semibold text-fg-strong transition-colors hover:text-tinta-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
        >
          <ChevronDown
            aria-hidden
            className={cn('size-4 shrink-0 text-fg-muted transition-transform', aberto && 'rotate-180')}
          />
          <span className="tabular-nums">Configuração {checklist.contagem}</span>
        </button>

        {proximo ? (
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-body">
            <span aria-hidden className="text-fg-muted">
              ·
            </span>
            <span className="font-medium text-fg-strong">{proximo.titulo}</span>
            <StatusDot tone={TOM_DO_PASSO[proximo.estado]}>{ROTULO_DO_PASSO[proximo.estado]}</StatusDot>
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-caption text-fg-body">· Nenhum passo pendente.</p>
        )}

        {proximo ? (
          <Link
            href={proximo.href}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            title={`${proximo.verbo}: abre a aba onde se resolve`}
          >
            Ver configuração
          </Link>
        ) : null}
      </div>

      <ol id={idLista} hidden={!aberto} className="flex flex-col divide-y divide-line border-t border-line">
        {checklist.passos.map((p, i) => (
          <li key={p.chave} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
            <span aria-hidden className="w-5 shrink-0 text-caption text-fg-muted tabular-nums">
              {i + 1}.
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-label font-medium text-fg-strong">{p.titulo}</span>
                <StatusDot tone={TOM_DO_PASSO[p.estado]}>{ROTULO_DO_PASSO[p.estado]}</StatusDot>
              </div>
              <p className="text-caption text-fg-muted">{p.frase}</p>
            </div>
            <Link href={p.href} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {p.verbo} →
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
