import 'server-only';

import { cache } from 'react';
import { notFound } from 'next/navigation';

import { acharEmpresaPorSlug, type Empresa } from '@/lib/empresas';

/**
 * A empresa de `/e/<slug>`, para o layout e as páginas do segmento (V2 do v7).
 *
 * O ENDEREÇO é a única fonte: nada de cookie aqui. Quem grava o cookie
 * `capi_empresa` da empresa do endereço é o proxy (bloco (b) de
 * `src/proxy.ts`), e quem alinha o store do navegador é o `EmpresaDoEndereco`.
 *
 * `cache` do React: o layout e a página pedem a mesma empresa na mesma
 * requisição, e o registro é lido do disco uma vez só.
 *
 * Slug que não existe → `notFound()` (a tela "Empresa não encontrada" deste
 * segmento). Registro ilegível → `ErroConfiguracaoIndisponivel` sobe para
 * quem chamou, que mostra o aviso de configuração indisponível; cair na
 * empresa padrão mostraria os dados de um cliente no endereço de outro.
 */
export const empresaDoSlug = cache(async (slug: string): Promise<Empresa> => {
  const empresa = await acharEmpresaPorSlug(slug);
  if (!empresa) notFound();
  return empresa;
});

/** Atalho das páginas: `params` do Next 16 é Promise. */
export async function empresaDosParams(params: Promise<{ slug: string }>): Promise<Empresa> {
  const { slug } = await params;
  return empresaDoSlug(slug);
}
