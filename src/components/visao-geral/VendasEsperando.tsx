'use client';

/**
 * O aviso "N vendas esperando você" da Visão geral (T-M08, plano v8).
 *
 * Desde o redesenho de 18/11/2026 é uma linha do bloco "Precisa de você",
 * depois dos números (D-R1). Só aparece quando há venda parada na Fila. Sem
 * venda parada, ou enquanto a contagem não chegou, não ocupa lugar nenhum.
 * Um botão só, que abre a Fila: amarelo quando é a primeira linha do bloco
 * (`principal`), de contorno nos outros casos.
 */
import Link from 'next/link';

import { LinhaDaLista } from '@/components/common/ListaEmLinhas';
import { buttonVariants } from '@/components/ui/button';
import { Inbox } from '@/components/ui/icones';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { textoDeVendasEsperando } from '@/lib/vendas-esperando';

export function VendasEsperando({
  slug,
  quantas,
  principal = false,
}: {
  slug: string;
  quantas: number | null;
  principal?: boolean;
}) {
  if (quantas === null || quantas <= 0) return null;
  return (
    <LinhaDaLista
      inicio={<Inbox aria-hidden className="size-4 text-warning" />}
      titulo={textoDeVendasEsperando(quantas)}
      detalhe="Chegaram e ainda não foram enviadas à Meta."
      fim={
        <Link href={`${enderecoDaAba(slug, 'eventos')}?vista=fila`}
          className={buttonVariants({ variant: principal ? 'default' : 'outline', size: 'sm' })}
        >
          Abrir a Fila
        </Link>
      }
    />
  );
}
