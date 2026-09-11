import { IntegrationsPage } from '@/components/integrations/IntegrationsPage';
import { lerIntegracoes } from '@/lib/config-store';
import { listarEntregas } from '@/lib/relay';
import { Workflow } from 'lucide-react';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';

export const dynamic = 'force-dynamic';

export default async function Integracoes() {
  const [integracoes, entregas] = await Promise.all([
    lerIntegracoes(),
    listarEntregas(50),
  ]);

  return (
    <main className={consoleStyles.page}>
      <ConsolePageHeader
        eyebrow="Webhook xWinner → regras → Meta"
        title="Disparo automático"
        description="Os eventos chegam sozinhos do xWinner, passam pelas regras e vão para a Meta sem você digitar nada. Aqui você liga, desliga e confere o que passou."
        icon={Workflow}
      />
      <IntegrationsPage
        inicial={{ integracoes, entregas }}
        publicBaseUrl={process.env.PUBLIC_BASE_URL}
      />
    </main>
  );
}
