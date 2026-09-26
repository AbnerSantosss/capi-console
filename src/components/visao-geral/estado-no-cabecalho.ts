'use client';

/**
 * O recado da Visão geral para o cabeçalho (V5 do plano v7).
 *
 * O `Header` mora no layout do grupo e não recebe dados de página nenhuma. É a
 * Visão geral que mede a empresa (o checklist lido no servidor), e ela publica
 * aqui, por slug, o estado da empresa e o próximo passo. O cabeçalho lê e mostra:
 *  - o selo de estado ("Falta configurar", "Com erro"...), com a causa por extenso;
 *  - a ação primária da Visão geral: o VERBO do próximo passo.
 *
 * Só o navegador escreve (dentro de efeito), então no servidor a leitura é
 * sempre `null` e nada vaza de uma requisição para outra.
 */

import { useSyncExternalStore } from 'react';
import type { EstadoDaEmpresa, PassoDoChecklist } from '@/lib/checklist-empresa';

export interface EstadoNoCabecalho {
  slug: string;
  estado: EstadoDaEmpresa;
  /** O próximo passo do checklist; `null` quando não sobrou nenhum. */
  proximo: PassoDoChecklist | null;
}

let publicados: ReadonlyMap<string, EstadoNoCabecalho> = new Map();
const ouvintes = new Set<() => void>();

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** A Visão geral chama isto depois de montar (e a cada leitura nova do servidor). */
export function publicarEstadoNoCabecalho(valor: EstadoNoCabecalho): void {
  publicados = new Map(publicados).set(valor.slug, valor);
  for (const ouvinte of ouvintes) ouvinte();
}

/** O último estado medido desta empresa, ou `null` se a Visão geral ainda não mediu. */
export function useEstadoNoCabecalho(slug: string | null): EstadoNoCabecalho | null {
  return useSyncExternalStore(
    assinar,
    () => (slug ? (publicados.get(slug) ?? null) : null),
    () => null
  );
}
