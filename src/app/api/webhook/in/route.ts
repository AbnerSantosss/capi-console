import { NextRequest } from 'next/server';
import { processarWebhook } from '@/lib/webhook-handler';
import { erroDeRota } from '@/lib/erro-api';

export const dynamic = 'force-dynamic';

/**
 * Recebimento com o segredo no header.
 *
 *   POST /api/webhook/in
 *   X-CAPI-Secret: <segredo>
 *
 * Use este formato quando o remetente permite header customizado (n8n, curl,
 * codigo proprio). Para backoffices que so aceitam a URL (como o do xWinner), use
 * /api/webhook/in/<segredo> ou /api/webhook/in/<rotulo>/<segredo>, na rota
 * catch-all ao lado. As tres formas convivem; nenhuma e depreciada.
 */
export async function POST(request: NextRequest) {
  try {
    return await processarWebhook(request);
  } catch (e) {
    // B10-b: um 500 cru do Next sai em HTML. A plataforma registra a entrega como
    // falha sem corpo legivel, e o operador nao descobre por que a venda sumiu.
    // 500 aqui, nunca 401: 401 e "segredo errado" e faz o remetente desistir.
    return erroDeRota(e, 'Não foi possível processar o evento agora. Tente novamente.');
  }
}
