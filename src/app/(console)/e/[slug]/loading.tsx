import { Esqueleto, RegiaoDeEspera } from '@/components/common/Esqueleto';
import consoleStyles from '@/components/layout/console.module.css';

/**
 * O que aparece entre o clique numa aba da empresa e a chegada da página
 * (T-M18, plano v8).
 *
 * Todas as páginas de `/e/<slug>/…` leem o disco no servidor a cada pedido.
 * Sem este arquivo, a tela antiga ficava parada até a nova chegar. Com ele,
 * o Next troca o conteúdo por este esqueleto na hora do clique, e a aba
 * clicada já fica marcada, porque as abas moram no `layout.tsx`, que
 * continua montado.
 *
 * Um arquivo só, nesta pasta: ele vale para a página daqui e para as das
 * pastas de dentro (`dominio/`, `fontes/`, `pixels/`, `eventos/`, `teste/`,
 * `regras/`, `configuracoes/`). Não suba este arquivo para `(console)/`: lá
 * ele esconderia as abas junto com o conteúdo.
 *
 * A forma é a de qualquer aba: o título, a linha de descrição e o bloco do
 * conteúdo. Componente de servidor, sem leitura nenhuma: ele não pode
 * esperar nada, porque é mostrado antes de tudo.
 */
export default function CarregandoAAba() {
  return (
    <main className={consoleStyles.page}>
      <RegiaoDeEspera rotulo="Abrindo a aba" className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Esqueleto className="h-9 w-56 max-w-full" />
          <Esqueleto className="h-5 w-80 max-w-full" />
        </div>
        <Esqueleto className="h-96 rounded-panel" />
      </RegiaoDeEspera>
    </main>
  );
}
