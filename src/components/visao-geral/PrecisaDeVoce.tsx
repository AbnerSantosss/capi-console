'use client';

/**
 * "Precisa de você": o bloco dos avisos da Visão geral (redesenho de
 * 18/11/2026, D-R1). Vem depois dos números e junta, numa lista só, o que
 * pede uma ação da pessoa: vendas paradas na Fila, avisos da instalação e a
 * configuração incompleta. Um item por linha, cada um com uma ação.
 *
 * Sem nada a fazer, o bloco não aparece. A ação amarela é uma só por tela: só
 * a primeira linha a recebe (prop `principal` de cada linha); as outras usam
 * o botão de contorno.
 */

import Link from 'next/link';
import { Children, isValidElement, type ReactNode } from 'react';

import { LinhaDaLista, ListaEmLinhas } from '@/components/common/ListaEmLinhas';
import { buttonVariants } from '@/components/ui/button';
import { TriangleAlert } from '@/components/ui/icones';

export function PrecisaDeVoce({ children }: { children: ReactNode }) {
  const linhas = Children.toArray(children).filter(isValidElement);
  if (linhas.length === 0) return null;
  return (
    <section aria-labelledby="precisa-de-voce" className="flex min-w-0 flex-col gap-2">
      <h2 id="precisa-de-voce" className="text-label font-semibold text-fg-strong">
        Precisa de você <span className="font-normal text-fg-muted tabular-nums">· {linhas.length}</span>
      </h2>
      <ListaEmLinhas>{linhas}</ListaEmLinhas>
    </section>
  );
}

/** Um aviso da instalação como linha do bloco. */
export function LinhaDeAviso({
  titulo,
  corpo,
  href,
  principal = false,
}: {
  titulo: string;
  corpo: string;
  href: string;
  /** A primeira linha do bloco leva a ação amarela; as outras, contorno. */
  principal?: boolean;
}) {
  return (
    <LinhaDaLista
      inicio={<TriangleAlert aria-hidden className="size-4 text-warning" />}
      titulo={titulo}
      detalhe={<span title={corpo}>{corpo}</span>}
      fim={
        <Link href={href} className={buttonVariants({ variant: principal ? 'default' : 'outline', size: 'sm' })}>
          Abrir Instalação
        </Link>
      }
    />
  );
}
