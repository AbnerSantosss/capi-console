import { redirecionarRotaAntiga, type BuscaDaPagina } from './redirecionar-rota-antiga';

export const dynamic = 'force-dynamic';

/**
 * 🔴 COMPATIBILIDADE PERMANENTE — NÃO REMOVA ESTA ROTA.
 *
 * `/` é a chegada do login e de todo favorito antigo do console. Desde a V2
 * (v7) ela leva à Visão geral da empresa ativa, `/e/<slug>`. Quem responde é
 * o proxy, com 307; esta página é a reserva (`redirecionar-rota-antiga.ts`).
 *
 * O envio manual que morava aqui está em `/e/<slug>/eventos?vista=manual`.
 */
export default async function Inicio({
  searchParams,
}: {
  searchParams: Promise<BuscaDaPagina>;
}) {
  return redirecionarRotaAntiga('/', searchParams);
}
