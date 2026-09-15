import { Suspense } from 'react';
import { ShoppingBag } from 'lucide-react';

import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';
import { Esqueleto } from '@/components/common/Esqueleto';
import { ListaDePessoas } from '@/components/painel/ListaDePessoas';

export const dynamic = 'force-dynamic';

/**
 * Quem comprou — o destino do cartão de compras do Painel.
 *
 * O cartão do Painel diz quantas compras e quanto em dinheiro; esta tela diz de
 * quem foram. É rota própria, e não um recorte aberto embaixo do cartão, porque
 * o operador precisa do link: mandar para o financeiro, deixar aberta numa aba,
 * voltar pelo botão do navegador.
 *
 * O período chega pela URL (`?dias=` ou `?de=&ate=`), escrito pelo clique lá no
 * Painel. É o que garante que esta lista tenha o tamanho do número clicado.
 */
export default function ComprasDoPainel() {
  return (
    <main className={consoleStyles.page} data-area="painel">
      <ConsolePageHeader
        title="Quem comprou"
        description="As pessoas por trás das compras do período. O e-mail aparece mascarado; o nome, inteiro, para você achar a pessoa no backoffice."
        icon={ShoppingBag}
      />
      {/* `useSearchParams` precisa de fronteira de suspense mesmo em rota
          dinâmica: sem ela o build reclama e a tela inteira vira esqueleto. */}
      <Suspense fallback={<Esqueleto className="h-96 rounded-panel" />}>
        <ListaDePessoas
          recorte={{ compras: true }}
          titulo="Compras do período"
          descricao="Tudo o que chegou como Purchase nesta janela, na ordem em que entrou."
        />
      </Suspense>
    </main>
  );
}
