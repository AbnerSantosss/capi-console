'use client';

import React from 'react';
import { useEventStore } from '@/stores/useEventStore';
import { Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Trilha das etapas do disparo manual.
 *
 * Existe porque a tela nao dizia onde o fluxo comecava nem onde terminava: as
 * secoes numeradas ficam na coluna da esquerda, mas o passo que de fato envia
 * (escolher o pixel e apertar o botao) vive na coluna da direita, fora da
 * sequencia. A trilha junta os quatro num lugar so, no topo, e mostra o que ja
 * esta pronto e o que falta.
 *
 * O estado vem da mesma validacao que o botao de disparo usa
 * (`useEventStore.erros`), entao a trilha nunca diz "pronto" para um evento
 * que a Meta recusaria.
 */

/** Quais campos pertencem a cada etapa, para saber onde mora cada erro. */
const CAMPOS_POR_ETAPA: Record<number, readonly string[]> = {
  2: [
    'eventName',
    'customEventName',
    'eventTime',
    'eventId',
    'orderId',
    'contentName',
    'value',
    'currency',
    'sourceUrl',
  ],
  3: [
    'email',
    'phone',
    'firstName',
    'lastName',
    'externalId',
    'fbc',
    'fbp',
    'ip',
    'userAgent',
  ],
};

const ETAPAS = [
  {
    n: 1,
    titulo: 'De onde vem',
    alvo: 'secao-origem',
    ajuda: 'Escolha ou cole os dados',
  },
  {
    n: 2,
    titulo: 'O que aconteceu',
    alvo: 'secao-evento',
    ajuda: 'Evento, data e valor',
  },
  {
    n: 3,
    titulo: 'Quem é o cliente',
    alvo: 'secao-cliente',
    ajuda: 'Cliente e rastreamento',
  },
  {
    n: 4,
    titulo: 'Conferir e disparar',
    alvo: 'secao-disparo',
    ajuda: 'Confira antes de enviar',
  },
] as const;

type Estado = 'vazio' | 'pendente' | 'pronto';

const emptySubscribe = () => () => {};

export function Stepper({ className = '' }: { className?: string }) {
  const campos = useEventStore((s) => s.camposEvento)();
  const jsonPayload = useEventStore((s) => s.jsonPayload);
  const erros = useEventStore((s) => s.erros)();

  // O rascunho do zustand so volta do localStorage depois que o React hidrata.
  // Sem esperar, o servidor renderiza "1" e o cliente renderiza "✓" no mesmo
  // no, e o React aborta a hidratacao da arvore inteira. Ate montar, mostramos
  // o estado neutro — que e exatamente o que o servidor mandou.
  const montado = React.useSyncExternalStore(emptySubscribe, () => true, () => false);

  const errosDe = (n: number) =>
    erros.filter((e) => CAMPOS_POR_ETAPA[n]?.includes(e.campo)).length;

  // Etapa 1 nao tem campo proprio: ela esta "feita" quando existe conteudo
  // vindo de algum lugar — colado, carregado da caixa ou digitado a mao.
  const temConteudo = [
    jsonPayload,
    campos.email,
    campos.phone,
    campos.externalId,
    campos.value,
    campos.orderId,
  ].some((v) => v?.trim());

  const estados: Record<number, Estado> = montado
    ? {
        1: temConteudo ? 'pronto' : 'vazio',
        2: errosDe(2) > 0 ? 'pendente' : temConteudo ? 'pronto' : 'vazio',
        3: errosDe(3) > 0 ? 'pendente' : temConteudo ? 'pronto' : 'vazio',
        4: erros.length > 0 ? 'vazio' : 'pronto',
      }
    : { 1: 'vazio', 2: 'vazio', 3: 'vazio', 4: 'vazio' };

  const ir = (alvo: string) => {
    const el = document.getElementById(alvo);
    if (!el) return;
    el.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    });
  };

  return (
    <nav
      aria-label="Etapas do disparo"
      className={cn(
        'rounded-panel border border-line-strong bg-surface-1 p-2',
        className
      )}
    >
      <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {ETAPAS.map((etapa) => {
          const estado = estados[etapa.n];
          const pronto = estado === 'pronto';
          const pendente = estado === 'pendente';

          return (
            <li key={etapa.n} className="flex min-w-0 items-center">
              <button
                type="button"
                onClick={() => ir(etapa.alvo)}
                className={cn(
                  'group flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-control px-3 py-2 text-left transition-colors',
                  'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-caption font-bold transition-colors',
                    pronto && 'border-success/50 bg-success/12 text-success',
                    pendente && 'border-danger/50 bg-danger/12 text-danger',
                    estado === 'vazio' &&
                      'border-line-strong bg-surface-2 text-fg-muted'
                  )}
                >
                  {pronto ? (
                    <Check className="size-3.5" />
                  ) : pendente ? (
                    <AlertCircle className="size-3.5" />
                  ) : (
                    etapa.n
                  )}
                </span>

                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      'text-label font-semibold',
                      pendente ? 'text-danger' : 'text-fg-strong'
                    )}
                  >
                    {etapa.titulo}
                  </span>
                  <span className="text-caption leading-snug text-fg-muted normal-case">
                    {pendente ? 'Falta corrigir' : etapa.ajuda}
                  </span>
                </span>
              </button>

              {/* Conector: some no empilhamento vertical, onde nao faz sentido. */}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Stepper;
