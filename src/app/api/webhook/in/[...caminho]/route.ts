import { NextRequest, NextResponse } from 'next/server';
import { processarWebhook } from '@/lib/webhook-handler';

export const dynamic = 'force-dynamic';

/**
 * Recebimento com o segredo no caminho da URL. Duas formas, as duas valem para
 * sempre — a de um segmento esta cadastrada no xWinner AGORA, entregando venda:
 *
 *   POST /api/webhook/in/<segredo>
 *   POST /api/webhook/in/<rotulo>/<segredo>
 *
 * O segredo e SEMPRE o ultimo segmento, e o rotulo e so apelido legivel: quem
 * autentica e o segredo, comparado em tempo constante no handler. Rotulo
 * diferente do configurado nao recusa nada; vira aviso na caixa de entrada.
 *
 * E uma rota catch-all, e nao um `[segredo]` fixo, porque duas rotas dinamicas
 * no mesmo nivel (`[segredo]` e `[...caminho]`) nao coexistem no App Router.
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
  { params }: { params: Promise<{ caminho: string[] }> }
) {
  const { caminho } = await params;
  const partes = caminho ?? [];

  // Mais de dois segmentos nao e forma valida. Responde igualzinho a segredo
  // errado — de proposito: quem sonda a URL nao aprende nada com a diferenca.
  if (partes.length < 1 || partes.length > 2) {
    const r = NextResponse.json({ erro: 'Segredo inválido no caminho da URL.' }, { status: 401 });
    for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
    return r;
  }

  const segredo = partes[partes.length - 1];
  const rotulo = partes.length === 2 ? partes[0] : undefined;

  const r = await processarWebhook(request, segredo, rotulo);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}
