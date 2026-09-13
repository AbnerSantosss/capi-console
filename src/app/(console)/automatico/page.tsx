import { IntegrationsPage } from '@/components/integrations/IntegrationsPage';
import { ErroConfiguracaoIndisponivel, lerIntegracoes } from '@/lib/config-store';
import { listarEntregas } from '@/lib/relay';
import { Workflow } from 'lucide-react';
import { AvisoConfigIndisponivel } from '@/components/layout/AvisoConfigIndisponivel';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';

export const dynamic = 'force-dynamic';

// Os três textos ficam em constantes porque o cabeçalho aparece DUAS vezes
// nesta função — uma no modo degradado, outra no normal. Duas cópias literais
// já saíram de sincronia uma vez.
//
// O nome da plataforma saiu daqui na FASE A: o produto mede qualquer
// plataforma de vendas que entregue webhook, e o console citava uma só. O que
// esta tela faz não depende de quem manda o evento.
const EYEBROW = 'Recebido → regras → Meta';
const TITULO = 'Disparo automático';
const DESCRICAO =
  'Os eventos que já chegaram passam pelas regras e vão para a Meta sem você digitar nada. Aqui você liga, desliga e confere o que passou. Quem faz o evento chegar é a tela de Instalação.';

export default async function Automatico() {
  // As duas leituras são independentes de propósito. `listarEntregas` lê o log
  // de relay, que nunca fica indisponível junto com a configuração — e mesmo em
  // modo degradado o histórico é a primeira coisa que o operador quer ver. Por
  // isso `allSettled`: um `Promise.all` faria a falha da configuração levar as
  // entregas embora sem motivo.
  const [cfg, log] = await Promise.allSettled([lerIntegracoes(), listarEntregas(50)]);

  // B1-e: configuração ilegível NÃO cai no error boundary do Next. O boundary
  // mostraria "algo deu errado" numa tela em branco, que é exatamente a
  // mensagem que faz o operador achar que perdeu a configuração.
  if (cfg.status === 'rejected') {
    if (!(cfg.reason instanceof ErroConfiguracaoIndisponivel)) throw cfg.reason;
    return (
      <main className={consoleStyles.page}>
        <ConsolePageHeader
          eyebrow={EYEBROW}
          title={TITULO}
          description={DESCRICAO}
          icon={Workflow}
        />
        <AvisoConfigIndisponivel arquivo={cfg.reason.arquivo} />
      </main>
    );
  }

  return (
    <main className={consoleStyles.page}>
      <ConsolePageHeader
        eyebrow={EYEBROW}
        title={TITULO}
        description={DESCRICAO}
        icon={Workflow}
      />
      {/* `publicBaseUrl` saiu daqui na FASE A: a unica coisa que precisava da
          URL publica era a aba de Recebimento, que agora mora em
          `/instalacao` — e e de la que a rota le a variavel. */}
      <IntegrationsPage
        inicial={{
          integracoes: cfg.value,
          entregas: log.status === 'fulfilled' ? log.value : [],
        }}
      />
    </main>
  );
}
