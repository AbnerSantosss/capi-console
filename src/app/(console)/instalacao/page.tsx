import { InstalacaoPage } from '@/components/instalacao/InstalacaoPage';
import { ErroConfiguracaoIndisponivel, lerIntegracoes } from '@/lib/config-store';
import { empresaDaPagina } from '@/lib/empresa-ativa';
import { Plug } from 'lucide-react';
import { AvisoConfigIndisponivel } from '@/components/layout/AvisoConfigIndisponivel';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';

export const dynamic = 'force-dynamic';

const TITULO = 'Instalação';
const DESCRICAO =
  'As duas portas por onde evento entra: o webhook da plataforma de vendas e a tag do site do cliente. Enquanto estas duas coisas não estiverem instaladas, nenhuma outra tela do console tem o que mostrar.';

export default async function Instalacao() {
  // Leitura única: esta tela não depende do log de entregas, e configuração
  // ilegível aqui é o caso que mais importa acertar — é a tela onde o operador
  // chega quando está montando um cliente novo.
  let integracoes;
  try {
    // A empresa ativa vem do cookie — página de servidor não vê header de
    // aplicação. Registro de empresas ilegível cai no mesmo catch abaixo, e é a
    // resposta certa: seguir na empresa padrão mostraria a URL de webhook do
    // Código Vencedor a quem está instalando outro cliente.
    integracoes = await lerIntegracoes(await empresaDaPagina());
  } catch (erro) {
    // B1-e: configuração ilegível NÃO cai no error boundary do Next. O boundary
    // mostraria "algo deu errado" numa tela em branco, que é exatamente a
    // mensagem que faz o operador achar que perdeu a configuração.
    if (!(erro instanceof ErroConfiguracaoIndisponivel)) throw erro;
    return (
      <main className={consoleStyles.page}>
        <ConsolePageHeader
          eyebrow="Primeiro passo"
          title={TITULO}
          description={DESCRICAO}
          icon={Plug}
        />
        <AvisoConfigIndisponivel arquivo={erro.arquivo} />
      </main>
    );
  }

  return (
    <main className={consoleStyles.page}>
      <ConsolePageHeader
        eyebrow="Primeiro passo"
        title={TITULO}
        description={DESCRICAO}
        icon={Plug}
      />
      <InstalacaoPage
        inicial={{ integracoes }}
        publicBaseUrl={process.env.PUBLIC_BASE_URL}
      />
    </main>
  );
}
