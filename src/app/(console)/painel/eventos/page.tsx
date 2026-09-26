import { redirecionarRotaAntiga, type BuscaDaPagina } from '../../redirecionar-rota-antiga';

export const dynamic = 'force-dynamic';

/**
 * 🔴 COMPATIBILIDADE PERMANENTE — NÃO REMOVA ESTA ROTA.
 *
 * "Quem mandou este evento" mora em `/e/<slug>/eventos?evento=<nome>` desde a
 * V2 (v7); sem `?evento=`, a aba Eventos abre no resumo. Quem responde a
 * `/painel/eventos` é o proxy, com 307 e a query repassada; esta página é a
 * reserva (`redirecionar-rota-antiga.ts`).
 */
export default async function EventosEnderecoAntigo({
  searchParams,
}: {
  searchParams: Promise<BuscaDaPagina>;
}) {
  return redirecionarRotaAntiga('/painel/eventos', searchParams);
}
