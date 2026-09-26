import { EmpresaDoEndereco } from '@/components/empresa/EmpresaDoEndereco';
import { AbasDaEmpresa } from '@/components/layout/AbasDaEmpresa';
import { AvisoConfigIndisponivel } from '@/components/layout/AvisoConfigIndisponivel';
import consoleStyles from '@/components/layout/console.module.css';
import { ErroConfiguracaoIndisponivel } from '@/lib/config-store';

import { empresaDoSlug } from './empresa-do-slug';

export const dynamic = 'force-dynamic';

/**
 * Tudo que fica em `/e/<slug>/…` (V2 do v7): a empresa vira o primeiro nível
 * do endereço.
 *
 * O que este layout faz, e só isso:
 *
 *  - acha a empresa pelo slug (`acharEmpresaPorSlug`, comparação exata);
 *    slug que não existe → `notFound()`, "Empresa não encontrada";
 *  - monta `EmpresaDoEndereco`, que alinha o store e o cookie do navegador à
 *    empresa do endereço antes de os filhos montarem;
 *  - (V3) mostra as 7 abas da empresa no topo do conteúdo (`AbasDaEmpresa`).
 *    Elas ficam FORA do `EmpresaDoEndereco`: são links que só precisam do
 *    slug, e aparecem já no primeiro quadro, enquanto os filhos esperam o
 *    store chegar à empresa. Nome e aba da trilha do cabeçalho saem do
 *    endereço, no próprio cabeçalho, porque o layout do grupo, onde ele
 *    mora, não re-renderiza na navegação.
 *
 * O que ele NÃO faz: ler o cookie `capi_empresa` para decidir a empresa
 * (quem decide é o endereço) nem tentar gravá-lo (gravar cookie é proibido
 * durante a renderização de Server Component; quem grava é o proxy).
 *
 * `key={slug}`: trocar de empresa é navegar, e a árvore inteira da empresa
 * anterior sai de cena — nenhum `useState` de uma empresa sobrevive na outra.
 */
export default async function LayoutDaEmpresa({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let empresa;
  try {
    empresa = await empresaDoSlug(slug);
  } catch (erro) {
    // Registro de empresas ilegível: o aviso de sempre, sem cair na empresa
    // padrão. O `notFound()` (e qualquer outro erro) sobe como veio.
    if (!(erro instanceof ErroConfiguracaoIndisponivel)) throw erro;
    return (
      <main className={consoleStyles.page}>
        <AvisoConfigIndisponivel arquivo={erro.arquivo} />
      </main>
    );
  }

  return (
    <>
      <div className={consoleStyles.abasDaEmpresa}>
        <AbasDaEmpresa slug={slug} />
      </div>
      <EmpresaDoEndereco key={slug} slug={slug} empresaId={empresa.id} nome={empresa.nome}>
        {children}
      </EmpresaDoEndereco>
    </>
  );
}
