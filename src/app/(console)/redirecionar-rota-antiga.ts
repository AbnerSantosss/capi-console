import 'server-only';

import { redirect } from 'next/navigation';

import { ErroConfiguracaoIndisponivel } from '@/lib/config-store';
import { empresaDaPagina } from '@/lib/empresa-ativa';
import { listarEmpresas } from '@/lib/empresas';
import { destinoDaRotaAntiga } from '@/lib/rotas-antigas';

/** O `searchParams` de uma página do App Router, já resolvido. */
export type BuscaDaPagina = Record<string, string | string[] | undefined>;

/** A busca da página de volta a `?a=1&b=2`, com os valores repetidos. */
function buscaComoTexto(busca: BuscaDaPagina): string {
  const consulta = new URLSearchParams();
  for (const [chave, valor] of Object.entries(busca)) {
    if (Array.isArray(valor)) {
      for (const item of valor) consulta.append(chave, item);
    } else if (valor !== undefined) {
      consulta.append(chave, valor);
    }
  }
  const texto = consulta.toString();
  return texto ? `?${texto}` : '';
}

/**
 * 🔴 COMPATIBILIDADE PERMANENTE — a reserva das rotas de antes da V2 (v7).
 *
 * Quem responde a `/painel`, `/pixels`, `/instalacao`, `/automatico`,
 * `/integracoes` e `/` é o proxy (`src/proxy.ts`, bloco (a)), com 307 num
 * salto só. Esta função é a rede embaixo dele: se a página antiga chegar a
 * renderizar (o proxy não achou a empresa ativa, ou a navegação veio por um
 * caminho que o proxy não viu), ela faz a mesma conta e responde 307 também.
 *
 * Endereço publicado não expira (a irreversível nº 10): a rota antiga continua
 * respondendo, nunca vira 404.
 *
 * Nada mais que isto: a empresa ativa pelo cookie (`empresaDaPagina`), o slug
 * dela e a tabela de `destinoDaRotaAntiga`. Registro de empresas ilegível →
 * `/empresas`, que mostra o aviso de configuração indisponível em vez de uma
 * tela em branco. `redirect()` fica FORA do `try`: ele funciona lançando um
 * erro que o Next precisa receber.
 */
export async function redirecionarRotaAntiga(
  pathname: string,
  searchParams?: Promise<BuscaDaPagina>
): Promise<never> {
  const busca = searchParams ? buscaComoTexto(await searchParams) : '';

  let destino: string | null = null;
  try {
    const idDaAtiva = await empresaDaPagina();
    const slugDaAtiva = (await listarEmpresas()).find((e) => e.id === idDaAtiva)?.slug;
    if (slugDaAtiva) destino = destinoDaRotaAntiga(pathname, busca, slugDaAtiva);
  } catch (erro) {
    if (!(erro instanceof ErroConfiguracaoIndisponivel)) throw erro;
  }

  redirect(destino ?? '/empresas');
}
