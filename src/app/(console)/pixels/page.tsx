import { Target } from '@/components/ui/icones';

import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';
import { PixelsPanel } from '@/components/pixels/PixelsPanel';

/**
 * A casa do Pixel (7.A).
 *
 * O Pixel e a entidade central do produto — tudo o que o console faz e mandar
 * evento para um Pixel — e ate aqui era a unica coisa importante sem rota:
 * vivia num modal aberto por um botao do cabecalho. Sem rota nao ha link para
 * um Pixel, nao ha como ver o estado de um Pixel sem abrir o modal, e o
 * controle de disparo automatico por Pixel (FASE 6) nao teria onde morar sem
 * ficar num modal de cabecalho — que para um controle que liga conversao real
 * seria erro de arquitetura antes de ser erro de interface.
 *
 * A lista carrega no cliente, pelo `useBrandStore`, e nao aqui no servidor: e
 * o mesmo store que o cabecalho e o disparo manual leem, e e isso que faz
 * trocar o Pixel ativo aparecer nos tres lugares sem recarregar a pagina.
 */
export default function Pixels() {
  return (
    <main className={consoleStyles.page} data-area="pixels">
      <ConsolePageHeader
        title="Pixels"
        description="Cada Pixel guarda o número, o token da API de Conversões e o código de teste — é ele que separa teste de venda real."
        icon={Target}
      />
      <PixelsPanel />
    </main>
  );
}
