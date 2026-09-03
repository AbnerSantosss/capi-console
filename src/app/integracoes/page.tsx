import { Header } from '@/components/layout/Header';
import { IntegrationsPage } from '@/components/integrations/IntegrationsPage';
import { lerIntegracoes } from '@/lib/config-store';
import { listarEntregas } from '@/lib/relay';

export const dynamic = 'force-dynamic';

export default async function Integracoes() {
  const [integracoes, entregas] = await Promise.all([
    lerIntegracoes(),
    listarEntregas(50),
  ]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-10">
          <h1 className="text-heading font-bold text-fg-strong">Integrações</h1>
          <p className="mt-1.5 max-w-2xl text-body text-fg-muted">
            Receba webhooks das plataformas de venda e devolva ao n8n o que a
            Meta respondeu. Elimina o copiar e colar manual, que é onde o{' '}
            <code className="font-mono text-fg-body">fbc</code> costuma se perder.
          </p>
        </div>
        <IntegrationsPage
          inicial={{ integracoes, entregas }}
          publicBaseUrl={process.env.PUBLIC_BASE_URL}
        />
      </main>
    </div>
  );
}
