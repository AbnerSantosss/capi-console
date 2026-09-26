import { IntegrationsPage } from '@/components/integrations/IntegrationsPage';
import { ErroConfiguracaoIndisponivel, lerIntegracoes } from '@/lib/config-store';
import { listarEntregas } from '@/lib/relay';
import { Workflow } from '@/components/ui/icones';
import { AvisoConfigIndisponivel } from '@/components/layout/AvisoConfigIndisponivel';
import { ExplicacaoDoDisparo } from '@/components/common/ExplicacaoDoDisparo';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';

import { empresaDosParams } from '../empresa-do-slug';
import { AbaInicialDeRegras } from './AbaInicialDeRegras';

export const dynamic = 'force-dynamic';

const TITULO = 'Regras';
const DESCRICAO = 'Ligue, desligue e confira o que já passou pelas regras.';

/**
 * Regras da empresa (`/e/<slug>/regras`, V2 do v7): o antigo Disparo
 * automático (`/automatico`), com a empresa vinda do ENDEREÇO.
 *
 * A chave que liga e desliga o envio automático fica no topo da tela, fora
 * das sub-abas, como era: um clique, em qualquer sub-aba. A V7 troca as
 * sub-abas por blocos; até lá, `AbaInicialDeRegras` abre a sub-aba Regras (e
 * não a Caixa de entrada, que agora mora em Eventos).
 *
 * As duas leituras são independentes de propósito (`allSettled`): o log de
 * entregas nunca fica indisponível junto com a configuração, e o histórico é a
 * primeira coisa que o operador quer ver mesmo em modo degradado.
 */
export default async function RegrasDaEmpresa({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Uma leitura da empresa, esperada duas vezes. Registro ilegível → as duas
  // rejeitam e caem no aviso de configuração indisponível; slug desconhecido
  // → `notFound()`, relançado abaixo.
  const promessaDaEmpresa = empresaDosParams(params);
  const [cfg, log] = await Promise.allSettled([
    promessaDaEmpresa.then((e) => lerIntegracoes(e.id)),
    promessaDaEmpresa.then((e) => listarEntregas(50, e.id)),
  ]);

  // B1-e: configuração ilegível NÃO cai no error boundary do Next.
  if (cfg.status === 'rejected') {
    if (!(cfg.reason instanceof ErroConfiguracaoIndisponivel)) throw cfg.reason;
    // O apelido do endereço basta para o cartão "Envio manual" (V7): a
    // empresa pode não ter sido lida, mas a aba Eventos dela existe.
    const { slug } = await params;
    return (
      <main className={consoleStyles.page} data-area="automatico">
        <ConsolePageHeader title={TITULO} description={DESCRICAO} icon={Workflow} />
        <ExplicacaoDoDisparo atual="automatico" slug={slug} className="mb-6" />
        <AvisoConfigIndisponivel arquivo={cfg.reason.arquivo} />
      </main>
    );
  }

  // A configuração foi lida, então a promessa da empresa já resolveu.
  const empresa = await promessaDaEmpresa;
  const empresaId = empresa.id;

  return (
    <main className={consoleStyles.page} data-area="automatico">
      <ConsolePageHeader title={TITULO} description={DESCRICAO} icon={Workflow} />
      <ExplicacaoDoDisparo atual="automatico" slug={empresa.slug} className="mb-6" />
      <AbaInicialDeRegras />
      {/* T1 (C2): a `key` por empresa força a montagem nova, e `empresaId` vai
          no corpo do PUT para o servidor recusar (409) dados de outra empresa. */}
      <IntegrationsPage
        key={empresaId}
        empresaId={empresaId}
        inicial={{
          integracoes: cfg.value,
          entregas: log.status === 'fulfilled' ? log.value : [],
        }}
      />
    </main>
  );
}
