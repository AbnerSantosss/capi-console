import { NextResponse, type NextRequest } from 'next/server';

import {
  COOKIE_SESSAO,
  SENHA_MIN,
  senhaForte,
  validarDestino,
  verificarSessao,
} from '@/lib/sessao';

/**
 * Autenticação do console (F2).
 *
 * O proxy roda no runtime Node.js (Next 16).
 *
 * Arquitetura de autenticação (D1, D4, D5, D12):
 * - O Basic Auth foi removido por completo: o único caminho é o cookie assinado `capi_sessao`.
 * - Sem cabeçalho `WWW-Authenticate`: o navegador nunca entra em laço de autenticação nativa.
 * - O EventSource da caixa de entrada trafega o cookie automaticamente por ser da mesma origem.
 * - Rotas de API sem sessão respondem HTTP 401 JSON (para clientes fetch consumirem).
 * - Rotas de página sem sessão sofrem redirect HTTP 307 para `/login?destino=<pathname validado>`.
 * - Todas as respostas protegidas recebem `Cache-Control: private, no-store`.
 *
 * Livres de senha:
 * - Webhooks da plataforma (`/api/webhook/in*`), protegidos por segredo no path.
 * - Coletor da tag do navegador (`/api/tag/coletar`), protegido pela chave
 *   pública da tag e pela lista branca de domínios cadastrados — o visitante
 *   nunca tem sessão, então exigir cookie aqui desligaria a coleta inteira.
 * - Healthcheck do Docker (`/api/health`).
 * - Tela de login (`/login`) e endpoint de autenticação (`/api/sessao`).
 * - Atalho de desenvolvimento (`/api/sessao/dev-admin`, desativado em produção).
 */
const LIVRES = [
  /^\/api\/webhook\/in(\/|$)/,
  /^\/api\/tag\/coletar$/, // hits do navegador; quem protege é a chave pública + a lista de domínios
  /^\/api\/health$/,
  /^\/login$/,
  /^\/api\/sessao$/,
  /^\/api\/sessao\/dev-admin$/, // atalho de dev — remover antes de subir para produção
];

/** Stream SSE da caixa de entrada: precisa de sessão, mas não pode ser comprimido. */
const SSE = /^\/api\/webhook\/stream$/;

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LIVRES.some((r) => r.test(pathname))) return NextResponse.next();

  if (!senhaForte(process.env.CONSOLE_PASSWORD)) {
    return new NextResponse(
      `Console fechado: defina CONSOLE_PASSWORD (mínimo ${SENHA_MIN} caracteres) nas variáveis de ambiente.`,
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const token = req.cookies.get(COOKIE_SESSAO)?.value;
  if (verificarSessao(token)) {
    const resposta = NextResponse.next();
    // `no-transform` é obrigatório no SSE: sem ele o middleware `compression` do
    // Next volta a comprimir o stream, o gzip junta bytes até encher o buffer e
    // o "tempo real" chega em blocos. A rota já manda o cabeçalho certo, mas
    // este set aqui sobrescreve a resposta inteira — então ele precisa manter o
    // no-transform de pé em vez de apagá-lo.
    resposta.headers.set(
      'Cache-Control',
      SSE.test(pathname) ? 'private, no-store, no-transform' : 'private, no-store'
    );
    return resposta;
  }

  // Requisições de API respondem 401 JSON sem WWW-Authenticate
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { erro: 'Sessão expirada ou ausente. Entre novamente em /login.', login: '/login' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  // Páginas do console: redirecionamento 307 com destino validado
  const destinoValido = validarDestino(pathname);
  const destinoUrl = new URL('/login', req.url);
  destinoUrl.searchParams.set('destino', destinoValido);

  const resposta = NextResponse.redirect(destinoUrl, 307);
  resposta.headers.set('Cache-Control', 'private, no-store');
  return resposta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/).*)'],
};

