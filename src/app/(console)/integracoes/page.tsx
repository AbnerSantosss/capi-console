import { IntegrationsPage } from '@/components/integrations/IntegrationsPage';
import { ErroConfiguracaoIndisponivel, lerIntegracoes } from '@/lib/config-store';
import { listarEntregas } from '@/lib/relay';
import { Workflow } from 'lucide-react';
import { AvisoConfigIndisponivel } from '@/components/layout/AvisoConfigIndisponivel';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';

export const dynamic = 'force-dynamic';

export default async function Integracoes() {
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
          eyebrow="Webhook xWinner → regras → Meta"
          title="Disparo automático"
          description="Os eventos chegam sozinhos do xWinner, passam pelas regras e vão para a Meta sem você digitar nada. Aqui você liga, desliga e confere o que passou."
          icon={Workflow}
        />
        <AvisoConfigIndisponivel arquivo={cfg.reason.arquivo} />
      </main>
    );
  }

  return (
    <main className={consoleStyles.page}>
      <ConsolePageHeader
        eyebrow="Webhook xWinner → regras → Meta"
        title="Disparo automático"
        description="Os eventos chegam sozinhos do xWinner, passam pelas regras e vão para a Meta sem você digitar nada. Aqui você liga, desliga e confere o que passou."
        icon={Workflow}
      />
      <IntegrationsPage
        inicial={{
          integracoes: cfg.value,
          entregas: log.status === 'fulfilled' ? log.value : [],
        }}
        publicBaseUrl={process.env.PUBLIC_BASE_URL}
      />
    </main>
  );
}
