import { Settings } from '@/components/ui/icones';

import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';
import { ExcluirEmpresa, FormularioDeEmpresa } from '@/components/empresa/FormularioDeEmpresa';

import { empresaDosParams } from '../empresa-do-slug';

export const dynamic = 'force-dynamic';

/**
 * Configurações da empresa (`/e/<slug>/configuracoes`, V2 e V7 do v7).
 *
 * Uma ação principal: salvar os dados da empresa (os campos que `Empresa` tem
 * hoje, pelo `PUT /api/empresas`). Abaixo, separada, a exclusão — confirmada
 * com o nome digitado, e ausente na empresa padrão.
 *
 * A empresa vem do ENDEREÇO (`empresaDosParams`), nunca do cookie. O
 * `key={empresaId}` remonta o formulário quando o endereço troca de empresa:
 * sem ele, o rascunho de uma empresa apareceria na tela de outra (contrato de
 * C2).
 */
export default async function ConfiguracoesDaEmpresa({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const empresa = await empresaDosParams(params);
  const empresaId = empresa.id;

  return (
    <main className={consoleStyles.page} data-area="painel">
      <ConsolePageHeader
        title="Configurações"
        description="Os dados desta empresa: nome, logo, plataforma de vendas, apelido da URL e cor."
        icon={Settings}
      />
      <div key={empresaId} className="flex max-w-2xl flex-col gap-6">
        <FormularioDeEmpresa empresa={empresa} />
        <ExcluirEmpresa empresa={{ id: empresa.id, nome: empresa.nome, slug: empresa.slug }} />
      </div>
    </main>
  );
}
