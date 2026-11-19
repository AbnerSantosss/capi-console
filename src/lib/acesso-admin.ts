import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { gravarAtomico } from './arquivo-atomico';

/**
 * Senha trocada pelo próprio dono ("Esqueci minha senha").
 *
 * O `CONSOLE_PASSWORD` do ambiente continua sendo a senha de partida e a chave
 * que abre o console. Quando o dono troca a senha pelo link do e-mail, a nova
 * fica aqui, só como hash scrypt (nunca o texto), em `config/acesso-admin.json`,
 * no volume que sobrevive ao rebuild. Existindo o arquivo, ele vale no lugar
 * da senha do ambiente.
 */

const ARQ = path.join(process.cwd(), 'config', 'acesso-admin.json');

interface SenhaSalva {
  /** `scrypt$<salt base64url>$<hash base64url>` */
  hash: string;
  atualizadoEm: string;
}

let cache: { mtimeMs: number; dados: SenhaSalva | null } | null = null;

/** Lê o arquivo (com cache pelo mtime). Ausente ou inválido = null. */
export function senhaSalva(): SenhaSalva | null {
  try {
    const st = fs.statSync(ARQ);
    if (cache && cache.mtimeMs === st.mtimeMs) return cache.dados;
    const bruto: unknown = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
    const hash = (bruto as { hash?: unknown })?.hash;
    const dados =
      typeof hash === 'string' && hash.startsWith('scrypt$')
        ? { hash, atualizadoEm: String((bruto as { atualizadoEm?: unknown }).atualizadoEm ?? '') }
        : null;
    cache = { mtimeMs: st.mtimeMs, dados };
    return dados;
  } catch {
    cache = null;
    return null;
  }
}

function derivar(senha: string, salt: Buffer): Buffer {
  return crypto.scryptSync(senha, salt, 32, { N: 16384, r: 8, p: 1 });
}

/** Confere a senha contra o hash salvo, em tempo constante. */
export function conferirSenhaSalva(senha: string, salva: SenhaSalva): boolean {
  const [, saltB64, hashB64] = salva.hash.split('$');
  if (!saltB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, 'base64url');
  const recebido = derivar(senha, Buffer.from(saltB64, 'base64url'));
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

/** Grava a senha nova (só o hash). */
export async function gravarSenhaNova(senha: string): Promise<void> {
  const salt = crypto.randomBytes(16);
  const hash = `scrypt$${salt.toString('base64url')}$${derivar(senha, salt).toString('base64url')}`;
  const dados: SenhaSalva = { hash, atualizadoEm: new Date().toISOString() };
  await gravarAtomico(ARQ, JSON.stringify(dados, null, 2), { backup: false });
  cache = null;
}
