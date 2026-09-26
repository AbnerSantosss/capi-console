import { redirecionarRotaAntiga, type BuscaDaPagina } from '../redirecionar-rota-antiga';

export const dynamic = 'force-dynamic';

/**
 * 🔴 COMPATIBILIDADE PERMANENTE — NÃO REMOVA ESTA ROTA.
 *
 * Os Pixels moram em `/e/<slug>/pixels` desde a V2 (v7). Quem responde a
 * `/pixels` é o proxy, com 307; o `#<id do Pixel>` de quem digitou o navegador
 * mantém sozinho. Esta página é a reserva (`redirecionar-rota-antiga.ts`).
 */
export default async function PixelsEnderecoAntigo({
  searchParams,
}: {
  searchParams: Promise<BuscaDaPagina>;
}) {
  return redirecionarRotaAntiga('/pixels', searchParams);
}
