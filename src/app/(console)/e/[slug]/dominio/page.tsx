import { AbaDominio } from '@/components/dominio/AbaDominio';
import { ErroConfiguracaoIndisponivel, lerIntegracoes } from '@/lib/config-store';
import { Globe } from '@/components/ui/icones';
import { AvisoConfigIndisponivel } from '@/components/layout/AvisoConfigIndisponivel';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';

import { empresaDosParams } from '../empresa-do-slug';

export const dynamic = 'force-dynamic';

const TITULO = 'Domínio';
const DESCRICAO =
  'O endereço próprio da tag dentro do site do cliente e o registro de DNS que ele cria.';

/**
 * Domínio da empresa (`/e/<slug>/dominio`, V2 do v7; conteúdo da V8).
 *
 * Desde a V8 esta aba monta a `AbaDominio`: só o endereço próprio de cada site
 * (subdomínio, registro de DNS, mensagem para o cliente e o estado medido). A
 * tag do site, os eventos extras, a chave pública e a lista de sites
 * permitidos ficam na aba Fontes. Aqui a empresa vem do ENDEREÇO; nada de
 * cookie.
 */
export default async function DominioDaEmpresa({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  let empresa;
  let integracoes;
  try {
    // Registro de empresas ilegível cai no mesmo aviso; slug desconhecido
    // (`notFound()`) sobe como veio.
    empresa = await empresaDosParams(params);
    integracoes = await lerIntegracoes(empresa.id);
  } catch (erro) {
    // Configuração ilegível NÃO cai no error boundary do Next (B1-e).
    if (!(erro instanceof ErroConfiguracaoIndisponivel)) throw erro;
    return (
      <main className={consoleStyles.page} data-area="instalacao">
        <ConsolePageHeader title={TITULO} description={DESCRICAO} icon={Globe} />
        <AvisoConfigIndisponivel arquivo={erro.arquivo} />
      </main>
    );
  }
  const empresaId = empresa.id;

  return (
    <main className={consoleStyles.page} data-area="instalacao">
      <ConsolePageHeader title={TITULO} description={DESCRICAO} icon={Globe} />
      {/* T1 (C2): `key` por empresa e `empresaId` no corpo de cada PUT. */}
      <AbaDominio
        key={empresaId}
        empresaId={empresaId}
        slug={empresa.slug}
        dominios={integracoes.tag.dominios}
        publicBaseUrl={process.env.PUBLIC_BASE_URL}
      />
    </main>
  );
}
