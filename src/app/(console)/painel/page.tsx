import { Gauge } from 'lucide-react';

import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';
import { PainelDeEventos } from '@/components/painel/PainelDeEventos';

export const dynamic = 'force-dynamic';

/**
 * A primeira tela do console (decisão D-1' e D-2' do plano do Painel).
 *
 * Antes, quem abria o console caía no disparo manual — uma tela de trabalho,
 * que não responde a primeira pergunta de quem chega: "está entrando venda e
 * está saindo para a Meta?". O Painel responde isso antes de qualquer clique,
 * e cada número dele abre a lista dos eventos que o compõem.
 *
 * O conteúdo carrega no cliente, pelo `PainelDeEventos`, e não aqui no
 * servidor: é o mesmo `X-Empresa-Id` do resto do console que decide de qual
 * empresa são os números, e ele vem do store do navegador. Trocar de empresa no
 * cabeçalho refaz a conta sem recarregar a página.
 */
export default function Painel() {
  return (
    <main className={consoleStyles.page} data-area="painel">
      <ConsolePageHeader
        title="Painel de eventos"
        description="O que chegou, o que saiu para a Meta e de onde veio o tráfego. Os testes da equipe ficam fora das porcentagens."
        icon={Gauge}
      />
      <PainelDeEventos />
    </main>
  );
}
