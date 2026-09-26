import type { Viewport } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { Header } from '@/components/layout/Header';
import { ConsoleShell } from '@/components/layout/ConsoleShell';
import { GavetaDeEmpresas } from '@/components/layout/GavetaDeEmpresas';
import { LateralDeEmpresas } from '@/components/layout/LateralDeEmpresas';
import { ErroConfiguracaoIndisponivel } from '@/lib/config-store';
import { listarEmpresas, publicarEmpresa, type EmpresaPublica } from '@/lib/empresas';
import { COOKIE_SESSAO, verificarSessao } from '@/lib/sessao';

/**
 * A cor da barra do navegador dentro do console é o `--surface-0` da paleta
 * do console (v7). Next 16 junta o `viewport` da raiz até o segmento mais
 * perto da página e troca as chaves repetidas, então só as rotas do console
 * mudam; o login continua com o `themeColor` de `src/app/layout.tsx`. O
 * gate G7 (`scripts/contrast-check.mjs`) compara este valor com o
 * `--surface-0` do primeiro `:root` de `globals.css`.
 */
export const viewport: Viewport = { themeColor: '#07121E' };

/**
 * Layout protegido do console (D11a).
 *
 * Route group `(console)`:
 * - Camada de defesa em profundidade no servidor (além do proxy).
 * - Verifica o cookie de sessão antes de renderizar qualquer página do console.
 * - Hospeda o componente `<Header />` compartilhado para todas as páginas protegidas.
 * - V3 (v7): lê a lista de empresas UMA vez e a entrega à lateral (a partir
 *   de `lg`), à gaveta (abaixo) e ao cabeçalho (a trilha). Em `/empresas` e
 *   `/guia` nenhuma empresa fica marcada: a marcada é sempre a do endereço.
 *   Registro ilegível não derruba o console: a lista vem vazia, e cada página
 *   mostra o aviso de configuração indisponível no lugar dela.
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

  let empresas: EmpresaPublica[] = [];
  try {
    empresas = (await listarEmpresas()).map(publicarEmpresa);
  } catch (erro) {
    if (!(erro instanceof ErroConfiguracaoIndisponivel)) throw erro;
  }

  return (
    <ConsoleShell lateral={<LateralDeEmpresas empresas={empresas} />}>
      <Header empresas={empresas} gaveta={<GavetaDeEmpresas empresas={empresas} />} />
      {children}
    </ConsoleShell>
  );
}
