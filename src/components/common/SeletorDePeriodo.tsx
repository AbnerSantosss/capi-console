'use client';

import React, { useId, useSyncExternalStore } from 'react';
import { CalendarRange } from '@/components/ui/icones';

import { Input } from '@/components/ui/input';
import { dataIsoValida, dataLocalIso } from '@/lib/inbox-resumo';
import { cn } from '@/lib/utils';

/**
 * O filtro de período, em botões visíveis.
 *
 * Os cinco períodos ficam FORA de qualquer menu: quem abre a tela vê, sem
 * clicar, quais recortes existem e qual está valendo. Ao lado, o intervalo
 * livre — duas datas de calendário, inclusivas nas duas pontas.
 *
 * Quem decide o que cada período significa é `janelaDoPeriodo`, no servidor.
 * Aqui só se escolhe e se passa adiante: `hoje` e `ontem` são dia de
 * calendário no fuso de Brasília, os números são janela corrida.
 */

export type DiasEscolhidos = 'hoje' | 'ontem' | '7' | '30' | '90' | 'livre';

export interface PeriodoEscolhido {
  /** Um dos cinco fixos, ou `'livre'` quando as duas datas mandam. */
  dias: DiasEscolhidos;
  /** Texto cru do campo "de" — pode estar pela metade enquanto se digita. */
  de: string | null;
  ate: string | null;
}

export const PERIODO_PADRAO: PeriodoEscolhido = { dias: '30', de: null, ate: null };

const FIXOS = [
  { valor: 'hoje', curto: 'Hoje', longo: 'Hoje' },
  { valor: 'ontem', curto: 'Ontem', longo: 'Ontem' },
  { valor: '7', curto: '7 dias', longo: 'Últimos 7 dias' },
  { valor: '30', curto: '30 dias', longo: 'Últimos 30 dias' },
  { valor: '90', curto: '90 dias', longo: 'Últimos 90 dias' },
] as const;

function porExtenso(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** O que a tela escreve ao lado dos números. */
export function rotuloDoPeriodo(p: PeriodoEscolhido): string {
  if (p.dias === 'livre' && p.de && p.ate) {
    return p.de === p.ate ? porExtenso(p.de) : `${porExtenso(p.de)} a ${porExtenso(p.ate)}`;
  }
  return FIXOS.find((f) => f.valor === p.dias)?.longo ?? 'Últimos 30 dias';
}

/** A busca da URL, do jeito que `periodoValido` espera ler do outro lado. */
export function buscaDoPeriodo(p: PeriodoEscolhido): string {
  if (p.dias === 'livre' && p.de && p.ate) {
    return `de=${encodeURIComponent(p.de)}&ate=${encodeURIComponent(p.ate)}`;
  }
  return `dias=${encodeURIComponent(p.dias)}`;
}

/**
 * O caminho de volta: a escolha que uma URL está pedindo.
 *
 * É o inverso exato de `buscaDoPeriodo`, e existe porque as telas abertas por
 * clique (`/painel/compras`, `/painel/eventos`) nascem com o período JÁ
 * escolhido na tela anterior — ele viaja na URL. Sem esta função a lista abriria
 * nos 30 dias padrão e mostraria um total diferente do número que foi clicado.
 *
 * 🔴 Só aceita o intervalo livre com as DUAS datas válidas, a mesma régua do
 * `periodoValido` do servidor. URL pela metade cai no padrão em vez de virar um
 * filtro meio aplicado — que é o jeito de a tela mentir sem avisar.
 */
export function periodoDaBusca(params: {
  get(nome: string): string | null;
}): PeriodoEscolhido {
  const de = params.get('de');
  const ate = params.get('ate');
  if (dataIsoValida(de) && dataIsoValida(ate)) {
    // Ordem invertida é o mesmo engano que `periodoValido` conserta do outro
    // lado; consertar aqui também mantém os botões e o número de acordo.
    return de <= ate ? { dias: 'livre', de, ate } : { dias: 'livre', de: ate, ate: de };
  }
  const dias = params.get('dias');
  const conhecido = FIXOS.some((f) => f.valor === dias);
  return conhecido ? { dias: dias as DiasEscolhidos, de: null, ate: null } : PERIODO_PADRAO;
}

/**
 * A resposta que chegou é desta escolha?
 *
 * Existe para a tela nunca mostrar número de uma janela com o rótulo de outra
 * enquanto a troca de período ainda está no ar.
 */
export function respostaEhDoPeriodo(resposta: unknown, p: PeriodoEscolhido): boolean {
  if (p.dias === 'livre') {
    if (typeof resposta !== 'object' || resposta === null) return false;
    const r = resposta as { de?: unknown; ate?: unknown };
    return r.de === p.de && r.ate === p.ate;
  }
  return String(resposta) === p.dias;
}

/**
 * Hoje em Brasília, e `null` enquanto está no servidor.
 *
 * `useSyncExternalStore` com instantâneo de servidor diferente é o jeito que o
 * React dá para renderizar algo que só o navegador sabe, sem `setState` dentro
 * de efeito (que o `react-hooks/set-state-in-effect` reprova no lint) e sem
 * discordância de hidratação na virada do dia. O assinar devolve função vazia
 * de propósito: a data não muda sozinha na tela, quem recarrega é a navegação.
 */
const SEM_ASSINATURA = () => () => {};

function useHojeEmBrasilia(): string | null {
  return useSyncExternalStore(
    SEM_ASSINATURA,
    () => dataLocalIso(Date.now()),
    () => null
  );
}

export function SeletorDePeriodo({
  valor,
  aoMudar,
  rotuloDoGrupo = 'Período',
  className,
}: {
  valor: PeriodoEscolhido;
  aoMudar: (p: PeriodoEscolhido) => void;
  rotuloDoGrupo?: string;
  className?: string;
}) {
  const idDe = useId();
  const idAte = useId();
  const hoje = useHojeEmBrasilia();

  const meio = valor.de !== null && valor.ate !== null;
  const umSo = (valor.de !== null || valor.ate !== null) && !meio;

  function escolherFixo(dias: DiasEscolhidos) {
    // Limpar as datas junto é o que mantém a tela honesta: campo preenchido
    // que não está valendo é um filtro mentindo sobre o número ao lado.
    aoMudar({ dias, de: null, ate: null });
  }

  function trocarData(campo: 'de' | 'ate', bruto: string) {
    const proximo = { ...valor, [campo]: bruto === '' ? null : bruto };
    const completo = dataIsoValida(proximo.de) && dataIsoValida(proximo.ate);
    aoMudar({
      ...proximo,
      // Só vira `livre` com as duas datas de pé. Apagar uma delas devolve o
      // painel para os 30 dias em vez de deixá-lo num intervalo pela metade.
      dias: completo ? 'livre' : valor.dias === 'livre' ? '30' : valor.dias,
    });
  }

  const classeDoCampo = 'w-full min-w-0 sm:w-40 md:w-36';

  return (
    <div
      className={cn('flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:gap-3', className)}
      role="group"
      aria-label={rotuloDoGrupo}
    >
      <div className="flex min-w-0 flex-wrap gap-1">
        {FIXOS.map((f) => {
          const ativo = valor.dias === f.valor;
          return (
            <button
              key={f.valor}
              type="button"
              aria-pressed={ativo}
              aria-label={f.longo}
              onClick={() => escolherFixo(f.valor)}
              className={cn(
                'h-control-lg rounded-control border px-3 text-label font-medium whitespace-nowrap transition-colors md:h-control-md',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto',
                ativo
                  ? 'border-tinta-texto/50 bg-tinta/10 text-tinta-texto'
                  : 'border-line text-fg-muted hover:border-line-control hover:text-fg-body'
              )}
            >
              {f.curto}
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <CalendarRange className="size-4 shrink-0 text-fg-muted" aria-hidden />
        <label htmlFor={idDe} className="text-caption text-fg-muted">
          De
        </label>
        <Input
          id={idDe}
          type="date"
          value={valor.de ?? ''}
          max={valor.ate ?? hoje ?? undefined}
          onChange={(e) => trocarData('de', e.target.value)}
          className={classeDoCampo}
          aria-invalid={umSo && valor.de === null ? true : undefined}
        />
        <label htmlFor={idAte} className="text-caption text-fg-muted">
          até
        </label>
        <Input
          id={idAte}
          type="date"
          value={valor.ate ?? ''}
          min={valor.de ?? undefined}
          max={hoje ?? undefined}
          onChange={(e) => trocarData('ate', e.target.value)}
          className={classeDoCampo}
          aria-invalid={umSo && valor.ate === null ? true : undefined}
        />
        {umSo && (
          <span role="status" className="text-caption text-fg-body">
            Falta a outra data para o intervalo valer.
          </span>
        )}
      </div>
    </div>
  );
}
