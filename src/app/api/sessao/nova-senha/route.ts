import { NextResponse, type NextRequest } from 'next/server';

import { gravarSenhaNova } from '@/lib/acesso-admin';
import { SENHA_MIN, verificarTokenTroca } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

function semCache(corpo: unknown, status = 200) {
  return NextResponse.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST — grava a senha nova a partir do link do e-mail.
 * Depois de gravada, o link e todas as sessões abertas deixam de valer.
 */
export async function POST(req: NextRequest) {
  const tipo = req.headers.get('content-type') || '';
  const site = req.headers.get('sec-fetch-site');
  if (!tipo.toLowerCase().includes('application/json') || (site && site !== 'same-origin' && site !== 'none')) {
    return semCache({ erro: 'Requisição não permitida.' }, 403);
  }

  const corpo = (await req.json().catch(() => null)) as { token?: unknown; senha?: unknown } | null;
  const token = typeof corpo?.token === 'string' ? corpo.token : '';
  const senha = typeof corpo?.senha === 'string' ? corpo.senha : '';

  if (!verificarTokenTroca(token)) {
    return semCache({ erro: 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".' }, 400);
  }
  if (senha.length < SENHA_MIN) {
    return semCache({ erro: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.` }, 400);
  }

  await gravarSenhaNova(senha);
  return semCache({ ok: true });
}
