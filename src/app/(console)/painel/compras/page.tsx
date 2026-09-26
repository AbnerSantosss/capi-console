import { redirecionarRotaAntiga, type BuscaDaPagina } from '../../redirecionar-rota-antiga';

export const dynamic = 'force-dynamic';

/**
 * 🔴 COMPATIBILIDADE PERMANENTE — NÃO REMOVA ESTA ROTA.
 *
 * "Quem comprou" mora em `/e/<slug>/eventos?vista=compras` desde a V2 (v7).
 * Quem responde a `/painel/compras` é o proxy, com 307 e o período repassado;
 * esta página é a reserva (`redirecionar-rota-antiga.ts`).
 */
export default async function ComprasEnderecoAntigo({
  searchParams,
}: {
  searchParams: Promise<BuscaDaPagina>;
}) {
  return redirecionarRotaAntiga('/painel/compras', searchParams);
}
