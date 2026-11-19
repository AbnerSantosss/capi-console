'use client';

/**
 * M-01 — a faixa "a Meta recusou o envio", no topo de todas as abas da empresa.
 *
 * Uma faixa só, do Pixel com mais recusas, e uma ação só: abrir o cartão dele
 * em /pixels. Sem recusa em aberto, não ocupa espaço nenhum (devolve `null`).
 *
 * Os textos vêm de `src/lib/erro-meta.ts`. Este arquivo não escreve frase.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Callout } from '@/components/common/primitives';
import consoleStyles from '@/components/layout/console.module.css';
import { buttonVariants } from '@/components/ui/button';
import { AlertTriangle } from '@/components/ui/icones';
import { useRecusasDaMeta } from '@/hooks/useRecusasDaMeta';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { avisoDeRecusa } from '@/lib/erro-meta';
import { useBrandStore } from '@/stores/useBrandStore';
import { useEmpresaStore } from '@/stores/useEmpresaStore';

export function FaixaDeRecusaDaMeta({ slug, empresaId }: { slug: string; empresaId: string }) {
  const pathname = usePathname();
  const { recusas, cobreAJanela } = useRecusasDaMeta(empresaId, pathname);
  const marcas = useBrandStore((s) => s.marcas);
  const empresaAtivaId = useEmpresaStore((s) => s.empresaAtivaId);

  const pior = recusas[0];
  if (!pior) return null;

  // O nome só entra quando a lista de Pixels em memória é DESTA empresa: o id
  // `default` existe em todas, e o nome de outra empresa aqui seria mentira.
  const nome =
    empresaAtivaId === empresaId ? (marcas.find((m) => m.id === pior.marcaId)?.nome ?? null) : null;
  const aviso = avisoDeRecusa(pior, nome, cobreAJanela);

  return (
    <div className={consoleStyles.abasDaEmpresa}>
      {/* Aviso compacto (redesenho de 18/11/2026): uma linha, a ação em
          contorno à direita, nunca amarela. */}
      <Callout
        tone="danger"
        icon={AlertTriangle}
        title={aviso.titulo}
        acao={
          <Link
            href={`${enderecoDaAba(slug, 'pixels')}#${pior.marcaId}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {aviso.acao}
          </Link>
        }
      >
        <p>{aviso.texto}</p>
      </Callout>
    </div>
  );
}
