'use client';

/**
 * A linha "Configuração x de 6" da Visão geral (V5 do plano v7; spec :27,
 * :104). Desde o redesenho de 18/11/2026 é uma linha do bloco "Precisa de
 * você", montada uma vez só, e só quando falta algum passo.
 *
 *  - O detalhe da linha diz o próximo passo e o estado dele, em texto.
 *  - "Ver configuração" abre (e fecha) os 6 passos ali mesmo, embaixo da
 *    linha: cada um com o estado em texto e cor, a prova (ou o que falta) e o
 *    verbo que resolve, levando à aba certa.
 *  - O passo Domínio não tem prova nesta rodada, então a conta para em "5 de 6"
 *    e a frase dele diz isso, sem fingir um verde.
 */

import Link from 'next/link';
import { useId, useState } from 'react';
import { LinhaDaLista } from '@/components/common/ListaEmLinhas';
import { StatusDot } from '@/components/common/primitives';
import { buttonVariants } from '@/components/ui/button';
import { ChevronDown, ClipboardCheck } from '@/components/ui/icones';
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
  principal = false,
}: {
  checklist: ChecklistDaEmpresa;
  /** A primeira linha do bloco leva a ação amarela; as outras, contorno. */
  principal?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const idLista = `checklist-${base}`;
  const { proximo } = checklist;

  return (
    <LinhaDaLista
      inicio={<ClipboardCheck aria-hidden className="size-4 text-warning" />}
      titulo={<span className="tabular-nums">Configuração {checklist.contagem}</span>}
      detalhe={proximo ? `Próximo: ${proximo.titulo} · ${ROTULO_DO_PASSO[proximo.estado]}` : 'Nenhum passo pendente.'}
      fim={
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-controls={aberto ? idLista : undefined}
          className={buttonVariants({ variant: principal ? 'default' : 'outline', size: 'sm' })}
        >
          Ver configuração
          <ChevronDown aria-hidden className={cn('size-4 shrink-0 transition-transform', aberto && 'rotate-180')} />
        </button>
      }
    >
      {aberto ? (
        <ol id={idLista} aria-label="Os passos da configuração" className="flex flex-col divide-y divide-line">
          {checklist.passos.map((p, i) => (
            <li key={p.chave} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
              <span aria-hidden className="w-5 shrink-0 text-caption text-fg-muted tabular-nums">
                {i + 1}.
              </span>
              <div className="flex min-w-0 flex-1 basis-48 flex-col">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-label font-medium text-fg-strong">{p.titulo}</span>
                  <StatusDot tone={TOM_DO_PASSO[p.estado]}>{ROTULO_DO_PASSO[p.estado]}</StatusDot>
                </div>
                <p className="text-caption text-fg-muted">{p.frase}</p>
              </div>
              <Link href={p.href} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                {p.verbo}
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </LinhaDaLista>
  );
}
