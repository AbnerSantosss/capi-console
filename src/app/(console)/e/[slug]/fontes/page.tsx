import { InstalacaoPage } from '@/components/instalacao/InstalacaoPage';
import { ErroConfiguracaoIndisponivel, lerIntegracoes } from '@/lib/config-store';
import { recebimentosDaEmpresa } from '@/lib/inbox';
import { Plug } from '@/components/ui/icones';
import { AvisoConfigIndisponivel } from '@/components/layout/AvisoConfigIndisponivel';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';

import { empresaDosParams } from '../empresa-do-slug';

export const dynamic = 'force-dynamic';

// A aba se chama Instalação na tela inteira (13/10, pedido do dono: "tem que
// ter explícito que é a instalação"). Só o endereço continua `/fontes`: ele
// não muda, porque há links e redirecionamentos apontando para ele.
const TITULO = 'Instalação';
const DESCRICAO = 'Dois passos para a venda chegar à Meta.';

/** O relógio do servidor, fora do componente: a renderização não lê o relógio direto. */
function agoraIso(): string {
  return new Date().toISOString();
}

/**
 * Instalação da empresa (`/e/<slug>/fontes`, V2 do v7): a antiga `/instalacao`,
 * com a empresa vinda do ENDEREÇO e não do cookie.
 *
 * O webhook e a tag do site ficam aqui; o domínio próprio fica na aba Domínio
 * (V8). Copiar a URL do webhook e o script da tag continua a um clique, como
 * era em `/instalacao`.
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

  // M-14: a última entrega REAL da plataforma (M-02). Falha de leitura não
  // derruba a tela: o selo diz "Nenhum recebimento ainda".
  const recebimentos = await recebimentosDaEmpresa(empresaId).catch(() => null);
  const recebimento = {
    ultimaEm: recebimentos?.plataforma?.ultimaEm ?? null,
    lidoEm: agoraIso(),
  };

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
        recebimento={recebimento}
      />
    </main>
  );
}
