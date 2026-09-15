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
 *   C-14  sem ilustração. Ícone de 24px em --fg-muted, texto, botão.
 */

import * as React from 'react';
import { Inbox, SearchX, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Os três cenários de RD-18. Fechados de propósito. */
export type CenarioVazio = 'vazio' | 'filtrado' | 'erro';

/*
 * FASE 3a — por que `surface-2` e não `surface-1`.
 *
 * Dos 14 pontos de uso, 11 estão DENTRO de um cartão (`Section variant="card"`
 * ou `Panel`), que é `surface-1`. Depois que o cartão perdeu a borda, um vazio
 * em `surface-1` dentro dele não separa por nada: mesmo fill, sem linha —
 * exatamente o que o G3′ reprova (degrau de L = 0). Em `surface-2` ele fica
 * 0.053 acima do cartão e 0.114 acima do fundo, então separa nos dois lugares,
 * que é a condição para um componente que pode estar aninhado ou não.
 *
 * A borda TRACEJADA fica, e não é contradição com "linha só em controle": ela
 * não contorna uma superfície, ela diz o estado — "a moldura existe, o
 * conteúdo ainda não" —, e é o que C-13 usa para separar vazio de erro antes
 * de qualquer palavra ser lida.
 */
const CENARIO: Record<
  CenarioVazio,
  { icone: React.ElementType; caixa: string; cor: string }
> = {
  // Tracejado = "a lista existe e ainda não tem nada".
  vazio: {
    icone: Inbox,
    caixa: 'border-dashed border-line-strong bg-surface-2',
    cor: 'text-fg-muted',
  },
  filtrado: {
    icone: SearchX,
    caixa: 'border-dashed border-line-strong bg-surface-2',
    cor: 'text-fg-muted',
  },
  // Sólido e em perigo: o olho tem de separar isto de uma lista vazia antes
  // de ler qualquer palavra (C-13).
  erro: {
    icone: TriangleAlert,
    caixa: 'border-danger/40 bg-danger/8',
    cor: 'text-danger',
  },
};

export interface EstadoVazioProps {
  /** Padrão: `vazio`. Use `filtrado` quando houver busca ou filtro aplicado. */
  cenario?: CenarioVazio;
  /** Sobrepõe o ícone do cenário. Sempre 24px, sempre decorativo. */
  icone?: React.ElementType;
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
  titulo,
  motivo,
  acao,
  className,
}: EstadoVazioProps) {
  const c = CENARIO[cenario];
  const Icone = icone ?? c.icone;

  return (
    <div
      role={cenario === 'erro' ? 'alert' : undefined}
      className={cn(
        'flex flex-col items-center gap-3 rounded-panel border p-8 text-center',
        c.caixa,
        className
      )}
    >
      <Icone className={cn('size-6 shrink-0', c.cor)} strokeWidth={1.75} aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="text-label font-semibold text-fg-strong">{titulo}</p>
        <p className="mx-auto max-w-md text-caption text-fg-muted">{motivo}</p>
      </div>
      {acao}
    </div>
  );
}

export default EstadoVazio;
