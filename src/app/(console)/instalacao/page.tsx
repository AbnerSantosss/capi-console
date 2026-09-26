import { redirecionarRotaAntiga, type BuscaDaPagina } from '../redirecionar-rota-antiga';

export const dynamic = 'force-dynamic';

/**
 * 🔴 COMPATIBILIDADE PERMANENTE — NÃO REMOVA ESTA ROTA.
 *
 * O webhook e a tag do site moram em `/e/<slug>/fontes` desde a V2 (v7). Quem
 * responde a `/instalacao` é o proxy, com 307; `#webhook` e `#tag` o navegador
 * mantém sozinho. Esta página é a reserva (`redirecionar-rota-antiga.ts`).
 */
export default async function InstalacaoEnderecoAntigo({
  searchParams,
}: {
  searchParams: Promise<BuscaDaPagina>;
}) {
  return redirecionarRotaAntiga('/instalacao', searchParams);
}
