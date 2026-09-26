import { InstalacaoPage } from '@/components/instalacao/InstalacaoPage';
import { ErroConfiguracaoIndisponivel, lerIntegracoes } from '@/lib/config-store';
import { Plug } from '@/components/ui/icones';
import { AvisoConfigIndisponivel } from '@/components/layout/AvisoConfigIndisponivel';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';

import { empresaDosParams } from '../empresa-do-slug';

export const dynamic = 'force-dynamic';

const TITULO = 'Fontes';
const DESCRICAO =
  'Por onde o evento entra: o webhook da plataforma de vendas e a tag do site do cliente.';

/**
 * Fontes da empresa (`/e/<slug>/fontes`, V2 do v7): a antiga `/instalacao`,
 * com a empresa vinda do ENDEREÇO e não do cookie.
 *
 * Até a V8, Fontes e Domínio montam a mesma tela (`InstalacaoPage`): a V8
 * separa o webhook (aqui) da tag e do domínio próprio (lá). Copiar a URL do
 * webhook e o script da tag continua a um clique, como era em `/instalacao`.
 */
export default async function FontesDaEmpresa({
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
    // Configuração ilegível NÃO cai no error boundary do Next (B1-e): a tela
    // em branco faria o operador achar que perdeu a configuração.
    if (!(erro instanceof ErroConfiguracaoIndisponivel)) throw erro;
    return (
      <main className={consoleStyles.page} data-area="instalacao">
        <ConsolePageHeader title={TITULO} description={DESCRICAO} icon={Plug} />
        <AvisoConfigIndisponivel arquivo={erro.arquivo} />
      </main>
    );
  }
  const empresaId = empresa.id;

  return (
    <main className={consoleStyles.page} data-area="instalacao">
      <ConsolePageHeader title={TITULO} description={DESCRICAO} icon={Plug} />
      {/* T1 (C2): a `key` por empresa força a montagem nova, e `empresaId` vai
          no corpo de cada PUT: o servidor recusa (409) se a empresa ativa já
          não é a destes dados. */}
      <InstalacaoPage
        key={empresaId}
        empresaId={empresaId}
        inicial={{ integracoes }}
        publicBaseUrl={process.env.PUBLIC_BASE_URL}
      />
    </main>
  );
}
