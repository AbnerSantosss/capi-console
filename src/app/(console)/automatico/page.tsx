import { IntegrationsPage } from '@/components/integrations/IntegrationsPage';
import { ErroConfiguracaoIndisponivel, lerIntegracoes } from '@/lib/config-store';
import { listarEntregas } from '@/lib/relay';
import { empresaDaPagina } from '@/lib/empresa-ativa';
import { Workflow } from '@/components/ui/icones';
import { AvisoConfigIndisponivel } from '@/components/layout/AvisoConfigIndisponivel';
import { ExplicacaoDoDisparo } from '@/components/common/ExplicacaoDoDisparo';
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
//
// A descrição encolheu quando o bloco `ExplicacaoDoDisparo` entrou logo abaixo
// do cabeçalho: ela dizia, palavra por palavra, o que o bloco agora diz — o
// que a tela faz e de onde os eventos vêm. Dito duas vezes na mesma dobra,
// ninguém lê nenhuma das duas. Aqui sobrou o que só o cabeçalho diz: o que o
// operador vem fazer nesta tela.
const TITULO = 'Disparo automático';
const DESCRICAO = 'Ligue, desligue e confira o que já passou pelas regras.';

export default async function Automatico() {
  // As duas leituras são independentes de propósito. `listarEntregas` lê o log
  // de relay, que nunca fica indisponível junto com a configuração — e mesmo em
  // modo degradado o histórico é a primeira coisa que o operador quer ver. Por
  // isso `allSettled`: um `Promise.all` faria a falha da configuração levar as
  // entregas embora sem motivo.
  //
  // A empresa ativa vem do cookie — página de servidor não vê header de
  // aplicação. Uma leitura só, esperada duas vezes: se ela falhar (registro de
  // empresas ilegível), as DUAS promessas rejeitam e a falha cai no mesmo aviso
  // de configuração indisponível daqui de baixo, já nomeando o arquivo certo.
  //
  // 🔴 Sem fallback para a empresa padrão: mostrar a configuração do Código
  // Vencedor a quem estava olhando outro cliente é pior que a tela degradada.
  const empresa = empresaDaPagina();
  const [cfg, log] = await Promise.allSettled([
    empresa.then((id) => lerIntegracoes(id)),
    empresa.then((id) => listarEntregas(50, id)),
  ]);

  // B1-e: configuração ilegível NÃO cai no error boundary do Next. O boundary
  // mostraria "algo deu errado" numa tela em branco, que é exatamente a
  // mensagem que faz o operador achar que perdeu a configuração.
  if (cfg.status === 'rejected') {
    if (!(cfg.reason instanceof ErroConfiguracaoIndisponivel)) throw cfg.reason;
    return (
      <main className={consoleStyles.page} data-area="automatico">
        <ConsolePageHeader
          title={TITULO}
          description={DESCRICAO}
          icon={Workflow}
        />
        <ExplicacaoDoDisparo atual="automatico" className="mb-6" />
        <AvisoConfigIndisponivel arquivo={cfg.reason.arquivo} />
      </main>
    );
  }

  return (
    <main className={consoleStyles.page} data-area="automatico">
      <ConsolePageHeader
        title={TITULO}
        description={DESCRICAO}
        icon={Workflow}
      />
      <ExplicacaoDoDisparo atual="automatico" className="mb-6" />
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
