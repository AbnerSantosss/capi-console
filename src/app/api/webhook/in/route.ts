import { NextRequest } from 'next/server';
import { processarWebhook } from '@/lib/webhook-handler';

export const dynamic = 'force-dynamic';

/**
 * Recebimento com o segredo no header.
 *
 *   POST /api/webhook/in
 *   X-CAPI-Secret: <segredo>
 *
 * Use este formato quando o remetente permite header customizado (n8n, curl,
 * codigo proprio). Para o backoffice do xWinner, que so aceita a URL, use
 * /api/webhook/in/<segredo> ou /api/webhook/in/<rotulo>/<segredo>, na rota
 * catch-all ao lado. As tres formas convivem; nenhuma e depreciada.
 */
export async function POST(request: NextRequest) {
  return processarWebhook(request);
}
