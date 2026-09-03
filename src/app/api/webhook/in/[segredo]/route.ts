import { NextRequest, NextResponse } from 'next/server';
import { processarWebhook } from '@/lib/webhook-handler';

export const dynamic = 'force-dynamic';

/**
 * Recebimento com o segredo no caminho da URL.
 *
 *   POST /api/webhook/in/<segredo>
 *
 * Existe porque o backoffice do xWinner so oferece o campo "URL (https)" ao
 * cadastrar um endpoint de saida: nao ha onde colocar um header.
 *
 * Sobre o CORS liberado abaixo: CORS protege o NAVEGADOR de um usuario, nao o
 * servidor. Qualquer processo (curl, n8n, a plataforma de vendas) ja podia
 * postar aqui sem passar por CORS; quem protege este endpoint e o segredo no
 * caminho. Liberar a origem permite que uma pagina no navegador — por exemplo
 * o proprio backoffice, ao reenviar eventos historicos — poste direto para o
 * console local, sem o payload precisar transitar por outro lugar.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** No Next 16 `params` e uma Promise e precisa de await. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ segredo: string }> }
) {
  const { segredo } = await params;
  const r = await processarWebhook(request, segredo);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}
