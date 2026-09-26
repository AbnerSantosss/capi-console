import { redirecionarRotaAntiga, type BuscaDaPagina } from '../redirecionar-rota-antiga';

export const dynamic = 'force-dynamic';

/**
 * 🔴 COMPATIBILIDADE PERMANENTE — NÃO REMOVA ESTA ROTA.
 *
 * O Painel de eventos mora em `/e/<slug>/eventos` desde a V2 (v7). Quem
 * responde a `/painel` é o proxy, com 307 e a query repassada (`?dias=`,
 * `?de=&ate=`); esta página é a reserva (`redirecionar-rota-antiga.ts`).
 */
export default async function PainelEnderecoAntigo({
  searchParams,
}: {
  searchParams: Promise<BuscaDaPagina>;
}) {
  return redirecionarRotaAntiga('/painel', searchParams);
}
