import { redirecionarRotaAntiga, type BuscaDaPagina } from '../redirecionar-rota-antiga';

export const dynamic = 'force-dynamic';

/**
 * 🔴 COMPATIBILIDADE PERMANENTE — NÃO REMOVA ESTA ROTA.
 *
 * O Disparo automático mora em `/e/<slug>/regras` desde a V2 (v7). O `?aba=`
 * é traduzido, nunca repassado cru: `inbox` → `eventos?vista=fila`, `testes` →
 * `regras#testes-internos`, `retornos` → `regras#repasse`, `recebimento` e
 * `tag` → `fontes#webhook` e `fontes#tag`. Quem responde a `/automatico` é o
 * proxy, com 307; esta página é a reserva (`redirecionar-rota-antiga.ts`).
 */
export default async function AutomaticoEnderecoAntigo({
  searchParams,
}: {
  searchParams: Promise<BuscaDaPagina>;
}) {
  return redirecionarRotaAntiga('/automatico', searchParams);
}
