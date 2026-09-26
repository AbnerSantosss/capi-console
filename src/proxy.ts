import { NextResponse, type NextRequest } from 'next/server';

import { COOKIE_EMPRESA, COOKIE_EMPRESA_MAX_AGE, resolverEmpresaId } from '@/lib/empresa-ativa';
import { empresaIdDoEndereco, slugDoEndereco } from '@/lib/empresa-do-endereco';
import { listarEmpresas } from '@/lib/empresas';
import { caminhoDoCliente, classificarHost, hostDoConsoleDoAmbiente } from '@/lib/host-do-console';
import { destinoDaRotaAntiga, ehRotaAntiga } from '@/lib/rotas-antigas';
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
 *
 * Tudo isso só no endereço do console e no interno (localhost). No endereço
 * do cliente, `responderNoHostDoCliente` responde antes.
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

/**
 * (a) Rota antiga → 307 num salto só para a aba nova da empresa ATIVA (V2 do
 * v7; tabela em `rotas-antigas.ts`).
 *
 * A ativa sai do cookie `capi_empresa`, lido pela API do `NextRequest` (como
 * a sessão), e é resolvida por `resolverEmpresaId`: vazio, inválido ou de
 * empresa apagada → a padrão. 307 e não 308: o destino depende da empresa
 * ativa, e o navegador guardaria um 308 para sempre.
 *
 * `null` = seguir adiante: não é rota antiga, ou o registro de empresas não
 * pôde ser lido — aí quem responde é a página antiga de reserva, que sabe
 * mostrar o aviso de configuração indisponível.
 */
async function redirecionarRotaAntiga(req: NextRequest): Promise<NextResponse | null> {
  const { pathname, search } = req.nextUrl;
  if (!ehRotaAntiga(pathname)) return null;

  let slugDaAtiva: string | undefined;
  try {
    const empresas = await listarEmpresas();
    const idDaAtiva = resolverEmpresaId([req.cookies.get(COOKIE_EMPRESA)?.value], empresas);
    slugDaAtiva = empresas.find((e) => e.id === idDaAtiva)?.slug;
  } catch {
    return null;
  }
  if (!slugDaAtiva) return null;

  const destino = destinoDaRotaAntiga(pathname, search, slugDaAtiva);
  if (!destino) return null;

  const urlDoDestino = new URL(destino, req.url);
  const resposta = NextResponse.redirect(urlDoDestino, 307);
  resposta.headers.set('Cache-Control', 'private, no-store');
  return resposta;
}

/**
 * (b) `/e/<slug>[/<aba>]` → cookie `capi_empresa` alinhado à empresa do
 * ENDEREÇO (contrato I4).
 *
 * Quem grava é o proxy porque Server Component não pode `cookies().set()`
 * durante a renderização: assim a primeira requisição do servidor já sai com
 * o cookie certo, e o `EmpresaDoEndereco` alinha o store do navegador.
 *
 * Só grava quando o id é conhecido e DIFERENTE do cookie. Slug desconhecido →
 * nada (o layout de `[slug]` dá "Empresa não encontrada"). `/api/**` nunca
 * passa por aqui: a API é da empresa que o `X-Empresa-Id` diz, não do endereço
 * da página. Os quatro atributos são os de `atributosDoCookieEmpresa()`, em
 * objeto, que é o que o `cookies.set` do `NextResponse` recebe.
 */
async function alinharCookieDaEmpresa(req: NextRequest, resposta: NextResponse): Promise<void> {
  const { pathname } = req.nextUrl;
  if (!slugDoEndereco(pathname)) return;

  let id: string | null;
  try {
    id = empresaIdDoEndereco(pathname, await listarEmpresas());
  } catch {
    // Registro ilegível: o layout mostra o aviso; cookie nenhum é tocado.
    return;
  }
  if (!id || id === req.cookies.get(COOKIE_EMPRESA)?.value) return;

  resposta.cookies.set(COOKIE_EMPRESA, id, {
    path: '/',
    maxAge: COOKIE_EMPRESA_MAX_AGE,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Endereço do cliente (Tarefa 3 do v6; `host-do-console.ts`): só a tag e o
 * health, e o resto dá 404 sem cookie. O login e o console nunca aparecem ali.
 *
 * O `/api/health` responde aqui mesmo, só com `ok` e `servico`: é o que a
 * rota `api/tag/gerar` mede para saber se o endereço próprio já chega ao
 * console (V8), sem mostrar versão nem marcas ao público.
 */
function responderNoHostDoCliente(pathname: string): NextResponse {
  if (pathname === '/api/health') {
    return NextResponse.json(
      { ok: true, servico: 'capi-console' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (caminhoDoCliente(pathname)) return NextResponse.next();
  return new NextResponse('Não encontrado.', {
    status: 404,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Antes de tudo: no endereço do cliente, nem a lista LIVRES vale (o login é livre).
  if (classificarHost(req.headers.get('host'), hostDoConsoleDoAmbiente()) === 'cliente') {
    return responderNoHostDoCliente(pathname);
  }
  if (LIVRES.some((r) => r.test(pathname))) return NextResponse.next();

  if (!senhaForte(process.env.CONSOLE_PASSWORD)) {
    return new NextResponse(
      `Console fechado: defina CONSOLE_PASSWORD (mínimo ${SENHA_MIN} caracteres) nas variáveis de ambiente.`,
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const token = req.cookies.get(COOKIE_SESSAO)?.value;
  if (verificarSessao(token)) {
    const ehApi = pathname.startsWith('/api/');

    // (a) Rota antiga: 307 para a aba nova, antes de qualquer página.
    if (!ehApi) {
      const redirecionamento = await redirecionarRotaAntiga(req);
      if (redirecionamento) return redirecionamento;
    }

    const resposta = NextResponse.next();
    // (b) Página de empresa: o cookie segue o endereço.
    if (!ehApi) await alinharCookieDaEmpresa(req, resposta);

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|icon|brand/).*)'],
};

