import 'server-only';
import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Sessão do console — cookie assinado com HMAC-SHA256 e chave derivada.
 *
 * Arquitetura (D1-D5):
 * - Sem Basic Auth: único caminho é o cookie assinado `capi_sessao`.
 * - Criptografia em Node.js (`node:crypto`): `hkdfSync`, `createHmac`, `timingSafeEqual`.
 * - Chave de assinatura via HKDF-SHA256 a partir de `SESSION_SECRET` (se definido)
 *   ou PBKDF2(CONSOLE_PASSWORD) em desenvolvimento / fallback.
 * - Trocar CONSOLE_PASSWORD ou CONSOLE_USER invalida automaticamente todas as sessões ativas.
 */

/** Nome do cookie de sessão. */
export const COOKIE_SESSAO = 'capi_sessao';

/** Duração padrão da sessão, em horas (12 horas). */
export const SESSAO_PADRAO_H = 12;

/** Duração com "continuar conectado", em horas (30 dias). */
export const SESSAO_LONGA_H = 24 * 30;

/** Mínimo de caracteres da senha do console. */
export const SENHA_MIN = 12;

/** Destinos permitidos após o login (D5). */
export const DESTINOS_PERMITIDOS = ['/', '/integracoes', '/guia'] as const;
export type DestinoPermitido = (typeof DESTINOS_PERMITIDOS)[number];

export interface SessaoValida {
  usuario: string;
  expiraEm: number;
}

/** O console só abre com uma senha forte configurada. */
export function senhaForte(senha: string | undefined | null): boolean {
  return typeof senha === 'string' && senha.length >= SENHA_MIN;
}

/** Usuário esperado; `admin` quando a variável não está definida. */
export function usuarioConfigurado(): string {
  return process.env.CONSOLE_USER || 'admin';
}

const SALT_FIXO = Buffer.from('capi-sessao-v1-salt', 'utf8');

let avisouPbkdf2 = false;
let chaveCache: { chave: Buffer; fingerprint: string } | null = null;

/**
 * Deriva a chave HMAC de 32 bytes (D3).
 *
 * Chave = HKDF-SHA256(ikm, salt fixo, info = usuário:senha).
 * Se SESSION_SECRET estiver definido (≥32 chars), usa-o como ikm.
 * Caso contrário, deriva ikm via PBKDF2(senha, 600k iterações).
 */
export function chaveSessao(): Buffer | null {
  const senha = process.env.CONSOLE_PASSWORD || '';
  if (!senhaForte(senha)) return null;

  const usuario = usuarioConfigurado();
  const secretEnv = (process.env.SESSION_SECRET || '').trim();
  const fingerprint = `${secretEnv}:::${usuario}:::${senha}`;

  if (chaveCache && chaveCache.fingerprint === fingerprint) {
    return chaveCache.chave;
  }

  let ikm: Buffer;
  if (secretEnv.length >= 32) {
    ikm = Buffer.from(secretEnv, 'utf8');
  } else {
    if (!avisouPbkdf2 && process.env.NODE_ENV === 'production') {
      console.warn(
        '[sessao] SESSION_SECRET não configurado em produção (mínimo 32 caracteres). ' +
          'Derivando chave via PBKDF2 (600k iterações). Configure SESSION_SECRET nas variáveis de ambiente.'
      );
      avisouPbkdf2 = true;
    }
    ikm = crypto.pbkdf2Sync(senha, SALT_FIXO, 600_000, 32, 'sha256');
  }

  const info = Buffer.from(`${usuario}:${senha}`, 'utf8');
  const bufferDerived = crypto.hkdfSync('sha256', ikm, SALT_FIXO, info, 32);
  const chave = Buffer.from(bufferDerived);

  chaveCache = { chave, fingerprint };
  return chave;
}

/**
 * Confere usuário e senha contra o ambiente em tempo estritamente constante (D2, F1).
 *
 * Compara HMAC(chave, recebido) contra HMAC(chave, esperado) com timingSafeEqual.
 * Como ambos os digests têm exatamente 32 bytes, nunca há vazamento de comprimento.
 */
export function credenciaisConferem(usuario: string, senha: string): boolean {
  const senhaEsperada = process.env.CONSOLE_PASSWORD || '';
  if (!senhaForte(senhaEsperada)) return false;

  const chave = chaveSessao();
  if (!chave) return false;

  const usuarioEsperado = usuarioConfigurado();

  const hUserRecebido = crypto.createHmac('sha256', chave).update(usuario).digest();
  const hUserEsperado = crypto.createHmac('sha256', chave).update(usuarioEsperado).digest();
  const okUsuario = crypto.timingSafeEqual(hUserRecebido, hUserEsperado);

  const hPassRecebido = crypto.createHmac('sha256', chave).update(senha).digest();
  const hPassEsperado = crypto.createHmac('sha256', chave).update(senhaEsperada).digest();
  const okSenha = crypto.timingSafeEqual(hPassRecebido, hPassEsperado);

  return okUsuario && okSenha;
}

/**
 * Emite o token assinado do cookie. Formato: `v1.<payloadBase64url>.<tagBase64url>`.
 * Retorna null se o console estiver fechado (sem senha forte).
 */
export function assinarSessao(usuario: string, horas: number): string | null {
  const chave = chaveSessao();
  if (!chave) return null;

  const agora = Date.now();
  const exp = agora + horas * 3_600_000;
  const corpo = JSON.stringify({ u: usuario, exp, iat: agora });
  const corpoB64 = Buffer.from(corpo, 'utf8').toString('base64url');

  const tag = crypto.createHmac('sha256', chave).update(corpoB64).digest().toString('base64url');
  return `v1.${corpoB64}.${tag}`;
}

/**
 * Valida o cookie e devolve os dados da sessão, ou null (D4).
 *
 * Compara a tag HMAC recebida com a tag recalculada usando timingSafeEqual.
 */
export function verificarSessao(token: string | undefined | null): SessaoValida | null {
  if (!token || typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') return null;

  const chave = chaveSessao();
  if (!chave) return null;

  try {
    const corpoB64 = partes[1];
    const tagRecebida = Buffer.from(partes[2], 'base64url');
    const tagCalculada = crypto.createHmac('sha256', chave).update(corpoB64).digest();

    if (tagRecebida.length !== tagCalculada.length) return null;
    if (!crypto.timingSafeEqual(tagRecebida, tagCalculada)) return null;

    const jsonStr = Buffer.from(corpoB64, 'base64url').toString('utf8');
    const dados: unknown = JSON.parse(jsonStr);
    if (!dados || typeof dados !== 'object') return null;

    const { u, exp } = dados as { u?: unknown; exp?: unknown };
    if (typeof u !== 'string' || typeof exp !== 'number' || Number.isNaN(exp)) return null;
    if (Date.now() > exp) return null;

    return { usuario: u, expiraEm: exp };
  } catch {
    // Base64 corrompido, JSON inválido ou formato incompatível
    return null;
  }
}

/**
 * Valida o destino de redirecionamento (D5).
 *
 * Só aceita o pathname (nunca search/hash) pertencente a DESTINOS_PERMITIDOS
 * da mesma origem. Qualquer desvio (//evil.com, /\\evil.com, /login, /api/*) retorna '/'.
 */
export function validarDestino(bruto: string | null | undefined): DestinoPermitido {
  if (!bruto || typeof bruto !== 'string') return '/';
  // Rejeita barras invertidas (evita evasão de host em navegadores)
  if (bruto.includes('\\') || bruto.startsWith('//')) return '/';

  try {
    const base = 'http://localhost';
    const url = new URL(bruto, base);
    if (url.origin !== base) return '/';

    const caminho = url.pathname;
    if ((DESTINOS_PERMITIDOS as readonly string[]).includes(caminho)) {
      return caminho as DestinoPermitido;
    }
    return '/';
  } catch {
    return '/';
  }
}

/**
 * Extrai e valida a sessão a partir de uma requisição NextRequest ou standard Request.
 */
export function sessaoDaRequisicao(req: NextRequest | Request): SessaoValida | null {
  let token: string | undefined;

  if ('cookies' in req && typeof (req as NextRequest).cookies?.get === 'function') {
    token = (req as NextRequest).cookies.get(COOKIE_SESSAO)?.value;
  } else {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_SESSAO}=([^;]*)`));
    if (match) token = decodeURIComponent(match[1]);
  }

  return verificarSessao(token);
}

/**
 * Helper de defesa em profundidade (D11b):
 * Exige sessão válida. Se ausente ou expirada, lança uma Response 401 JSON.
 */
export function exigirSessao(req: NextRequest | Request): SessaoValida {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    throw new Response(
      JSON.stringify({
        erro: 'Sessão expirada ou ausente. Entre novamente em /login.',
        login: '/login',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
  return sessao;
}
