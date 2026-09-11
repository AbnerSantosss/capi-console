import { NextResponse, type NextRequest } from 'next/server';

import {
  COOKIE_SESSAO,
  SESSAO_LONGA_H,
  SESSAO_PADRAO_H,
  assinarSessao,
  credenciaisConferem,
  senhaForte,
  sessaoDaRequisicao,
  usuarioConfigurado,
} from '@/lib/sessao';

export const dynamic = 'force-dynamic';

/**
 * Freio de força bruta por IP (D6).
 *
 * Em memória: protege o container isolado contra ataques de dicionário.
 * - CF-Connecting-IP > último item de X-Forwarded-For > req.ip.
 * - Limite de 8 falhas em 10 minutos.
 * - Teto de 1.000 entradas no Map (descarta o mais antigo para evitar exaustão de memória).
 */
const TENTATIVAS = new Map<string, { n: number; ate: number }>();
const MAX_ENTRADAS = 1_000;
const LIMITE_FALHAS = 8;
const JANELA_MS = 10 * 60_000;

function obterIp(req: NextRequest): string {
  // 1. Cloudflare sobrescreve CF-Connecting-IP de forma confiável
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  // 2. X-Forwarded-For: o último item é o anexado pelo proxy mais próximo confiável
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const partes = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (partes.length > 0) return partes[partes.length - 1];
  }

  return (req as unknown as { ip?: string }).ip || 'desconhecido';
}

function estaBloqueado(ip: string): boolean {
  const agora = Date.now();
  for (const [chave, reg] of TENTATIVAS) {
    if (reg.ate <= agora) TENTATIVAS.delete(chave);
  }
  const reg = TENTATIVAS.get(ip);
  return Boolean(reg && reg.n >= LIMITE_FALHAS && reg.ate > agora);
}

function registrarFalha(ip: string): void {
  const agora = Date.now();
  if (TENTATIVAS.size >= MAX_ENTRADAS) {
    const primeiraChave = TENTATIVAS.keys().next().value;
    if (primeiraChave) TENTATIVAS.delete(primeiraChave);
  }

  const reg = TENTATIVAS.get(ip);
  if (reg && reg.ate > agora) {
    reg.n += 1;
  } else {
    TENTATIVAS.set(ip, { n: 1, ate: agora + JANELA_MS });
  }
}

/**
 * Validação de origem contra Login-CSRF (D7).
 */
function validarOrigem(req: NextRequest): boolean {
  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return false;
  }

  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const urlOrigin = new URL(origin);
      const host = req.headers.get('host') || req.nextUrl.host;
      if (urlOrigin.host !== host) return false;
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * GET — Sonda de sessão para SSE e verificação prévia da UI.
 */
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { erro: 'Sessão expirada ou ausente.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json(
    { ok: true, usuario: sessao.usuario, expiraEm: sessao.expiraEm },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * POST — Abertura de sessão com cookie assinado.
 */
export async function POST(req: NextRequest) {
  if (!senhaForte(process.env.CONSOLE_PASSWORD)) {
    return NextResponse.json(
      { erro: 'Console fechado: CONSOLE_PASSWORD não está configurada no servidor.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // D7: Proteção contra login-CSRF
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json(
      { erro: 'Content-Type inválido.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!validarOrigem(req)) {
    return NextResponse.json(
      { erro: 'Origem da requisição não permitida.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const ip = obterIp(req);
  if (estaBloqueado(ip)) {
    return NextResponse.json(
      { erro: 'Tentativas demais. Espere 10 minutos e tente de novo.' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let corpo: { usuario?: unknown; senha?: unknown; lembrar?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json(
      { erro: 'Requisição inválida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const usuario = typeof corpo.usuario === 'string' ? corpo.usuario : '';
  const senha = typeof corpo.senha === 'string' ? corpo.senha : '';

  if (!credenciaisConferem(usuario, senha)) {
    registrarFalha(ip);
    // Atraso de 400ms para encarecer ataques de força bruta
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json(
      { erro: 'Usuário ou senha incorretos.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  TENTATIVAS.delete(ip);

  const horas = corpo.lembrar === true ? SESSAO_LONGA_H : SESSAO_PADRAO_H;
  const token = assinarSessao(usuarioConfigurado(), horas);
  if (!token) {
    return NextResponse.json(
      { erro: 'Não foi possível abrir a sessão.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const resposta = NextResponse.json({ ok: true, usuario: usuarioConfigurado(), horas });
  resposta.cookies.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: horas * 3600,
  });
  resposta.headers.set('Cache-Control', 'no-store');
  return resposta;
}

/**
 * DELETE — Sair do console: apaga o cookie.
 */
export async function DELETE() {
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_SESSAO, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  resposta.headers.set('Cache-Control', 'no-store');
  return resposta;
}

