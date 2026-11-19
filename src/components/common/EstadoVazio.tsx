'use client';

/**
 * EstadoVazio — o único desenho de "não há nada aqui" do produto (13.3.5, U7).
 *
 * A auditoria achou oito estados vazios em três desenhos diferentes para um
 * único cenário. Este componente existe para que o cenário passe a ser dito, e
 * não só a ausência.
 *
 * Regras que ele carrega:
 *   C-11  três partes obrigatórias — o que está vazio · por quê · a ação que
 *         resolve. Por isso `acao` NÃO é opcional: um vazio sem saída é um
 *         beco, e beco não é estado, é defeito.
 *   C-12  "vazio" ≠ "filtrado". O filtrado oferece limpar o filtro.
 *   C-13  "vazio" ≠ "erro". O erro tem borda sólida, tom de perigo e
 *         `role="alert"` — nunca se disfarça de lista vazia.
 *   C-14  sem ilustração. Ícone em --fg-muted, texto, botão.
 *
 * Dois tamanhos (seção 1.11 do redesenho de 18/11/2026):
 *   `bloco` (padrão)  o vazio de uma página ou de um painel inteiro: alinhado
 *                     à esquerda, ícone de 20px, título `text-title`, motivo
 *                     `text-body` mudo e a ação embaixo.
 *   `linha`           o vazio de uma lista dentro de um painel: uma linha de
 *                     ~44px, ícone de 16px, título `text-label`, motivo
 *                     `text-caption` e a ação à direita.
 */

import * as React from 'react';
import { Inbox, SearchX, TriangleAlert } from '@/components/ui/icones';

import { cn } from '@/lib/utils';

/** Os três cenários de RD-18. Fechados de propósito. */
export type CenarioVazio = 'vazio' | 'filtrado' | 'erro';

/*
 * Vazio e filtrado: `surface-2` com linha fina, sem tracejado (redesenho de
 * 18/11/2026). `surface-2` separa tanto dentro de um painel (`surface-1`)
 * quanto solto no fundo. O erro continua sólido, em tom de perigo e com
 * `role="alert"`: o olho separa ele de uma lista vazia antes de ler (C-13).
 */
const CENARIO: Record<
  CenarioVazio,
  { icone: React.ElementType; caixa: string; cor: string }
> = {
  vazio: {
    icone: Inbox,
    caixa: 'border-line bg-surface-2',
    cor: 'text-fg-muted',
  },
  filtrado: {
    icone: SearchX,
    caixa: 'border-line bg-surface-2',
    cor: 'text-fg-muted',
  },
  // Sólido e em perigo: o olho tem de separar isto de uma lista vazia antes
  // de ler qualquer palavra (C-13).
  erro: {
    icone: TriangleAlert,
    caixa: 'border-danger/40 bg-danger/10',
    cor: 'text-danger',
  },
};

export interface EstadoVazioProps {
  /** Padrão: `vazio`. Use `filtrado` quando houver busca ou filtro aplicado. */
  cenario?: CenarioVazio;
  /** Sobrepõe o ícone do cenário. 20px no bloco, 16px na linha; decorativo. */
  icone?: React.ElementType;
  /** `bloco` (padrão) para página ou painel; `linha` para lista em painel. */
  tamanho?: 'bloco' | 'linha';
  /** O que está vazio. Uma frase curta, sem ponto final. */
  titulo: string;
  /** Por que está vazio. É a parte que a maioria dos empty states esquece. */
  motivo: React.ReactNode;
  /** A ação que resolve. Obrigatória por C-11 — normalmente um `<Button>`. */
  acao: React.ReactNode;
  className?: string;
}

export function EstadoVazio({
  cenario = 'vazio',
  icone,
  tamanho = 'bloco',
  titulo,
  motivo,
  acao,
  className,
}: EstadoVazioProps) {
  const c = CENARIO[cenario];
  const Icone = icone ?? c.icone;
  const role = cenario === 'erro' ? 'alert' : undefined;

  if (tamanho === 'linha') {
    return (
      <div
        role={role}
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 rounded-control border px-3 py-2',
          c.caixa,
          className
        )}
      >
        <div className="flex min-w-0 flex-1 basis-60 items-center gap-2">
          <Icone className={cn('size-4 shrink-0', c.cor)} aria-hidden />
          <div className="min-w-0">
            <p className="text-label font-semibold text-fg-strong">{titulo}</p>
            <p className="text-caption text-fg-muted">{motivo}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{acao}</div>
      </div>
    );
  }

  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-start gap-3 rounded-panel border p-4 sm:p-5',
        c.caixa,
        className
      )}
    >
      <Icone className={cn('size-5 shrink-0', c.cor)} aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="text-title font-semibold text-fg-strong">{titulo}</p>
        <p className="max-w-prose text-body text-fg-muted">{motivo}</p>
      </div>
      {acao}
    </div>
  );
}

export default EstadoVazio;
