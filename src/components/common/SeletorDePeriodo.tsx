'use client';

import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { CalendarRange } from '@/components/ui/icones';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dataIsoValida, dataLocalIso } from '@/lib/inbox-resumo';
import { cn } from '@/lib/utils';

/**
 * O filtro de período, num controle segmentado só.
 *
 * Os cinco períodos ficam FORA de qualquer menu: quem abre a tela vê, sem
 * clicar, quais recortes existem e qual está valendo. O sexto pedaço, "Datas",
 * abre o intervalo livre num painel por cima — duas datas de calendário,
 * inclusivas nas duas pontas.
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

export const PERIODO_PADRAO: PeriodoEscolhido = { dias: 'hoje', de: null, ate: null };

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
  return FIXOS.find((f) => f.valor === p.dias)?.longo ?? 'Hoje';
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
 * no período padrão (hoje) e mostraria um total diferente do número que foi clicado.
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
  const idPainel = useId();
  const hoje = useHojeEmBrasilia();
  const caixa = useRef<HTMLDivElement>(null);

  const meio = valor.de !== null && valor.ate !== null;
  const umSo = (valor.de !== null || valor.ate !== null) && !meio;
  const livre = valor.dias === 'livre' && meio;

  // 14/10 (pedido do dono: "filtros de data bagunçados, ocupando a página"):
  // as duas datas saíram da linha e moram num painel que abre por cima, a
  // partir do pedaço "Datas". A garantia de antes continua: filtro valendo
  // nunca fica escondido — com as duas datas, o próprio pedaço vira o
  // intervalo e fica marcado; com uma só, fechar o painel limpa a metade.
  const [aberto, setAberto] = useState(false);

  function fechar() {
    // Data pela metade não vale para o número; fechar o painel com ela ali
    // seria um campo escondido mentindo sobre o filtro. Então ela sai.
    if (umSo) aoMudar({ dias: valor.dias === 'livre' ? 'hoje' : valor.dias, de: null, ate: null });
    setAberto(false);
  }

  // Clique fora ou Esc fecham o painel. Sem lista de dependências de
  // propósito: o `fechar` precisa enxergar a data da vez.
  useEffect(() => {
    if (!aberto) return;
    function foraDaCaixa(e: PointerEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) fechar();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar();
    }
    document.addEventListener('pointerdown', foraDaCaixa);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', foraDaCaixa);
      document.removeEventListener('keydown', tecla);
    };
  });

  function escolherFixo(dias: DiasEscolhidos) {
    // Limpar as datas junto é o que mantém a tela honesta: campo preenchido
    // que não está valendo é um filtro mentindo sobre o número ao lado.
    aoMudar({ dias, de: null, ate: null });
    setAberto(false);
  }

  function trocarData(campo: 'de' | 'ate', bruto: string) {
    const proximo = { ...valor, [campo]: bruto === '' ? null : bruto };
    const completo = dataIsoValida(proximo.de) && dataIsoValida(proximo.ate);
    aoMudar({
      ...proximo,
      // Só vira `livre` com as duas datas de pé. Apagar uma delas devolve o
      // painel para hoje em vez de deixá-lo num intervalo pela metade.
      dias: completo ? 'livre' : valor.dias === 'livre' ? 'hoje' : valor.dias,
    });
  }

  const classeDoSegmento = (ativo: boolean) =>
    cn(
      'inline-flex h-control-md min-w-0 items-center justify-center gap-1.5 rounded-control px-2 text-label font-medium whitespace-nowrap transition-colors sm:h-full sm:px-3',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tinta-texto',
      ativo ? 'bg-tinta/15 text-tinta-texto' : 'text-fg-muted hover:bg-surface-2 hover:text-fg-body'
    );

  return (
    <div ref={caixa} className={cn('relative min-w-0', className)}>
      {/* Um controle só, segmentado: seis pedaços dentro da mesma moldura, em
          vez de cinco botões soltos mais dois campos de data sempre abertos.
          No celular vira 3 × 2: seis numa linha só deixavam os rótulos colados. */}
      <div
        role="group"
        aria-label={rotuloDoGrupo}
        className="grid min-w-0 grid-cols-3 gap-0.5 rounded-control border border-line bg-surface-1 p-0.5 sm:inline-flex sm:h-control-md"
      >
        {FIXOS.map((f) => {
          const ativo = valor.dias === f.valor;
          return (
            <button
              key={f.valor}
              type="button"
              aria-pressed={ativo}
              aria-label={f.longo}
              onClick={() => escolherFixo(f.valor)}
              className={classeDoSegmento(ativo)}
            >
              {f.curto}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={livre}
          aria-expanded={aberto}
          aria-controls={idPainel}
          aria-label={livre ? `Datas: ${rotuloDoPeriodo(valor)}` : 'Escolher datas'}
          onClick={() => (aberto ? fechar() : setAberto(true))}
          className={classeDoSegmento(livre || aberto)}
        >
          <CalendarRange className="hidden size-4 shrink-0 sm:block" aria-hidden />
          {livre ? rotuloCurtoDasDatas(valor) : 'Datas'}
        </button>
      </div>

      {aberto && (
        <div
          id={idPainel}
          role="group"
          aria-label="Intervalo de datas"
          className="absolute right-0 top-full z-30 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-panel border border-line-strong bg-surface-1 p-4 shadow-realce"
        >
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <label htmlFor={idDe} className="text-caption text-fg-muted">
              De
            </label>
            <Input
              id={idDe}
              type="date"
              value={valor.de ?? ''}
              max={valor.ate ?? hoje ?? undefined}
              onChange={(e) => trocarData('de', e.target.value)}
              className="w-full min-w-0"
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
              className="w-full min-w-0"
              aria-invalid={umSo && valor.ate === null ? true : undefined}
            />
          </div>
          {umSo && (
            <span role="status" className="text-caption text-fg-body">
              Falta a outra data para o intervalo valer.
            </span>
          )}
          <Button size="sm" variant="outline" className="self-end" onClick={fechar}>
            {livre ? 'Pronto' : 'Fechar'}
          </Button>
        </div>
      )}
    </div>
  );
}

/** "12/10 a 14/10": curto para caber no pedaço; o ano fica no rótulo longo. */
function rotuloCurtoDasDatas(p: PeriodoEscolhido): string {
  if (!p.de || !p.ate) return 'Datas';
  const curto = (iso: string) => porExtenso(iso).slice(0, 5);
  return p.de === p.ate ? curto(p.de) : `${curto(p.de)} a ${curto(p.ate)}`;
}
