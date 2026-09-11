import { NextResponse } from 'next/server';

import {
  COOKIE_SESSAO,
  SESSAO_PADRAO_H,
  assinarSessao,
  senhaForte,
  usuarioConfigurado,
} from '@/lib/sessao';

export const dynamic = 'force-dynamic';

/**
 * ATALHO DE DESENVOLVIMENTO — entra como admin sem digitar senha.
 *
 * REMOVER ESTE ARQUIVO (e o botão em LoginForm.tsx que o chama) antes de
 * subir para produção. Até lá, o `next build`/`next start` de produção já
 * desativa a rota como segunda trava: NODE_ENV nunca é 'production' durante
 * `next dev`, e é sempre 'production' num build de produção — não depende de
 * nenhuma variável extra ser lembrada no Portainer.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ erro: 'Não encontrado.' }, { status: 404 });
  }
  if (!senhaForte(process.env.CONSOLE_PASSWORD)) {
    return NextResponse.json({ erro: 'Console fechado.' }, { status: 503 });
  }

  const token = await assinarSessao(usuarioConfigurado(), SESSAO_PADRAO_H);
  if (!token) {
    return NextResponse.json({ erro: 'Não foi possível abrir a sessão.' }, { status: 503 });
  }

  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // atalho e so para localhost em dev
    path: '/',
    maxAge: SESSAO_PADRAO_H * 3600,
  });
  resposta.headers.set('Cache-Control', 'no-store');
  return resposta;
}
