import { FlaskConical } from '@/components/ui/icones';

import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';
import { lerIntegracoes } from '@/lib/config-store';

import { empresaDosParams } from '../empresa-do-slug';
import { EventosDeTeste } from './EventosDeTeste';

export const dynamic = 'force-dynamic';

/**
 * Eventos de teste da empresa (`/e/<slug>/teste`, pedido do dono de 25/09).
 *
 * Dispara os 8 eventos do funil, um por vez, com dados de teste gerados
 * sozinhos, para o operador ver cada um chegar em "Testar eventos" do
 * Gerenciador de Eventos. Quem garante que nada disso vira conversão é a rota
 * `/api/enviar-teste`: sem código `TEST…` nada sai.
 *
 * A empresa vem do ENDEREÇO (nada de cookie), e `key={empresaId}` remonta a
 * tela por empresa: nenhum resultado de uma empresa aparece na outra.
 */
export default async function TesteDaEmpresa({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const empresa = await empresaDosParams(params);
  const empresaId = empresa.id;

  // O domínio da tag só serve para o `event_source_url` do teste. Sem ele (ou
  // com a configuração ilegível) o teste sai sem URL, e isso não impede nada.
  let dominio = '';
  try {
    const integracoes = await lerIntegracoes(empresaId);
    dominio = integracoes.tag?.dominios?.[0]?.host ?? '';
  } catch {
    dominio = '';
  }

  return (
    <main className={consoleStyles.page} data-area="manual">
      <ConsolePageHeader
        title="Eventos de teste"
        description="Envie os eventos do funil em sequência, com dados de teste, e veja cada um chegar em Testar eventos."
        icon={FlaskConical}
      />
      <EventosDeTeste key={empresaId} empresaId={empresaId} dominio={dominio} />
    </main>
  );
}
