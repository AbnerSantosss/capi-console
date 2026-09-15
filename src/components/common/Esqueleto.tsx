'use client';

/**
 * Esqueleto e a escada de espera (13.3.6, U4).
 *
 * O diagnóstico achou seis tratamentos de carregamento e nenhum esqueleto, com
 * dois spinners diferentes para a mesma coisa. Este arquivo é o lugar único de
 * "estamos esperando".
 *
 * Regras que ele carrega:
 *   C-15  esqueleto só entre 1s e 10s. Abaixo de 400ms nada aparece; de 0,4s a
 *         1s, spinner; acima de 10s, progresso determinado. Quem decide é
 *         `useEscadaDeEspera`, não o olho de quem escreve a tela.
 *   C-16  geometria real: o esqueleto tem a forma do conteúdo que vem. Por isso
 *         `Esqueleto` é uma peça crua que cada tela compõe na forma da sua
 *         lista, e não um retângulo genérico pronto.
 *   C-17  é placeholder de LAYOUT, não revelação. Ele reserva o espaço do que
 *         ainda não chegou; nunca esconde o que já está na tela. Preferência
 *         registrada do dono: nada importante aparece só depois de animação.
 *   C-18  um só spinner no produto, e é o `Loader2`. `LoginForm` está fora de
 *         escopo (decisão irreversível #13) e mantém o dele.
 *
 * A animação é `animate-pulse`; o bloco `prefers-reduced-motion` de
 * globals.css:337 já a zera para quem pediu menos movimento.
 */

import * as React from 'react';
import { Loader2 } from '@/components/ui/icones';

import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* A escada de espera (P18)                                            */
/* ------------------------------------------------------------------ */

export type FaseDeEspera = 'nada' | 'spinner' | 'esqueleto' | 'progresso';

/** Os três degraus, em ms. Nomeados para não virarem número mágico na tela. */
const DEGRAU_SPINNER_MS = 400;
const DEGRAU_ESQUELETO_MS = 1_000;
const DEGRAU_PROGRESSO_MS = 10_000;

/**
 * Devolve o que mostrar enquanto `esperando` for verdadeiro.
 *
 * Abaixo de 400ms devolve `'nada'` de propósito: piscar um spinner numa
 * resposta de 120ms comunica lentidão que não existe.
 */
export function useEscadaDeEspera(esperando: boolean): FaseDeEspera {
  const [fase, setFase] = React.useState<FaseDeEspera>('nada');
  const [esperandoAnterior, setEsperandoAnterior] = React.useState(esperando);

  // Zerar a escada DURANTE a renderizacao, e nao dentro do efeito: o efeito so
  // roda depois da pintura, entao um `setFase('nada')` la dentro pintaria um
  // quadro com a fase da espera anterior antes de voltar ao zero — e o lint
  // (react-hooks/set-state-in-effect) reprova, com razao, a renderizacao em
  // cascata que isso produz. Este e o padrao de "ajustar estado quando a
  // propriedade muda".
  if (esperando !== esperandoAnterior) {
    setEsperandoAnterior(esperando);
    setFase('nada');
  }

  React.useEffect(() => {
    if (!esperando) return;
    const aoSpinner = setTimeout(() => setFase('spinner'), DEGRAU_SPINNER_MS);
    const aoEsqueleto = setTimeout(() => setFase('esqueleto'), DEGRAU_ESQUELETO_MS);
    const aoProgresso = setTimeout(() => setFase('progresso'), DEGRAU_PROGRESSO_MS);
    return () => {
      clearTimeout(aoSpinner);
      clearTimeout(aoEsqueleto);
      clearTimeout(aoProgresso);
    };
  }, [esperando]);

  return esperando === esperandoAnterior ? fase : 'nada';
}

/* ------------------------------------------------------------------ */
/* Esqueleto — peça crua de geometria                                  */
/* ------------------------------------------------------------------ */

export interface EsqueletoProps extends React.ComponentProps<'div'> {
  /**
   * Forma do bloco que está por vir. Passe a MESMA altura, largura e raio do
   * conteúdo real — é isso que separa C-16 de um retângulo qualquer.
   * Padrão: uma linha de texto de altura `text-body`.
   */
  className?: string;
}

export function Esqueleto({ className, ...props }: EsqueletoProps) {
  return (
    <div
      aria-hidden
      className={cn('h-[22px] w-full animate-pulse rounded-control bg-surface-2', className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Spinner — o único do produto (C-18)                                 */
/* ------------------------------------------------------------------ */

export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof Loader2>) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden {...props} />;
}

/* ------------------------------------------------------------------ */
/* Região de espera — o rótulo que o leitor de tela ouve               */
/* ------------------------------------------------------------------ */

/**
 * Envelope acessível para qualquer espera: o esqueleto é `aria-hidden`, então
 * sem isto quem usa leitor de tela ouve silêncio. `aria-busy` + um texto
 * `sr-only` dizem o que está acontecendo.
 */
export function RegiaoDeEspera({
  rotulo,
  children,
  className,
}: {
  /** Ex.: "Carregando a caixa de entrada". */
  rotulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-busy aria-live="polite" className={className}>
      <span className="sr-only">{rotulo}</span>
      {children}
    </div>
  );
}

export default Esqueleto;
