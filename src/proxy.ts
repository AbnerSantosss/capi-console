import { NextResponse, type NextRequest } from 'next/server';

/**
 * Autenticacao do console (Basic Auth).
 *
 * Ate agora o console so existia em localhost. Na VPS ele fica acessivel pela
 * internet, e a tela mostra o segredo de entrada e permite disparar eventos que
 * custam dinheiro — entao precisa de senha. Basic Auth foi escolhido porque o
 * EventSource (SSE da caixa de entrada) reaproveita as credenciais sozinho, sem
 * codigo extra, e o curl tambem.
 *
 * Livres de senha: o recebimento de webhook (que ja se autentica pelo segredo
 * no caminho) e o healthcheck (que o Docker consulta e nao devolve segredo).
 *
 * Sem CONSOLE_PASSWORD definido o console responde 503 em vez de abrir: e
 * melhor o operador ver "console fechado" do que o console ficar publico por
 * esquecimento de variavel de ambiente.
 */
const LIVRES = [/^\/api\/webhook\/in(\/|$)/, /^\/api\/health$/];

/** Comparacao em tempo constante sem depender de node:crypto. */
function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LIVRES.some((r) => r.test(pathname))) return NextResponse.next();

  const usuario = process.env.CONSOLE_USER || 'admin';
  const senha = process.env.CONSOLE_PASSWORD || '';
  if (!senha || senha.length < 12) {
    return new NextResponse(
      'Console fechado: defina CONSOLE_PASSWORD (mínimo 12 caracteres) nas variáveis de ambiente.',
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Basic ')) {
    try {
      const decodificado = atob(auth.slice(6));
      const i = decodificado.indexOf(':');
      const u = decodificado.slice(0, i);
      const p = decodificado.slice(i + 1);
      if (iguais(u, usuario) && iguais(p, senha)) return NextResponse.next();
    } catch {
      /* base64 invalido */
    }
  }

  return new NextResponse('Autenticação necessária.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Meta CAPI Console", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/).*)'],
};
