import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { Header } from '@/components/layout/Header';
import { ConsoleShell } from '@/components/layout/ConsoleShell';
import { COOKIE_SESSAO, verificarSessao } from '@/lib/sessao';

/**
 * Layout protegido do console (D11a).
 *
 * Route group `(console)`:
 * - Camada de defesa em profundidade no servidor (além do proxy).
 * - Verifica o cookie de sessão antes de renderizar qualquer página do console.
 * - Hospeda o componente `<Header />` compartilhado para todas as páginas protegidas.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  const sessao = verificarSessao(token);

  if (!sessao) {
    redirect('/login');
  }

  return (
    <ConsoleShell>
      <Header />
      {children}
    </ConsoleShell>
  );
}
