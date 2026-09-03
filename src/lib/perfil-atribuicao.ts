import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Perfis de atribuicao por comprador.
 *
 * O purchase_approved pode chegar sem fbc/fbp (formato antigo) ou so com IP
 * interno do pod. O precheckout_opened, que chega minutos antes, traz tudo.
 * Guardamos por e-mail e por telefone e completamos o que faltar na hora do
 * disparo — sem isso o fbc se perde, e o fbc e o unico campo que liga a venda
 * a campanha / conjunto / anuncio no Gerenciador.
 *
 * Persistencia: logs/perfis-atribuicao.jsonl (append-only; ultimo registro vence).
 */
const DIR = path.join(process.cwd(), 'logs');
const ARQ = path.join(DIR, 'perfis-atribuicao.jsonl');
const VALIDADE_MS = 30 * 24 * 3600 * 1000;
const CAMPOS = ['fbc', 'fbp', 'ip', 'userAgent', 'sourceUrl', 'firstName', 'lastName', 'externalId', 'phone', 'email'] as const;

type Campo = (typeof CAMPOS)[number];

interface Perfil {
  chave: string;
  em: string;
  dados: Partial<Record<Campo, string>>;
}

let mapa: Map<string, Perfil> | null = null;

function chaves(f: Record<string, unknown>): string[] {
  const out: string[] = [];
  const email = String(f.email || '').trim().toLowerCase();
  if (email.includes('@')) out.push(`email:${email}`);
  const tel = String(f.phone || '').replace(/\D+/g, '');
  if (tel.length >= 10) out.push(`phone:${tel.replace(/^55/, '')}`);
  return out;
}

async function carregar(): Promise<Map<string, Perfil>> {
  if (mapa) return mapa;
  const m = new Map<string, Perfil>();
  try {
    const txt = await fs.readFile(ARQ, 'utf8');
    for (const l of txt.split('\n')) {
      if (!l) continue;
      try {
        const p = JSON.parse(l) as Perfil;
        m.set(p.chave, p);
      } catch {
        /* linha corrompida: o append-only tolera e segue */
      }
    }
  } catch {
    /* arquivo ainda nao existe */
  }
  mapa = m;
  return m;
}

/** Guarda o que o evento trouxe de atribuicao. So grava se houver algum sinal. */
export async function guardarPerfil(f: Record<string, string | boolean>) {
  if (!f.fbc && !f.fbp && !f.ip && !f.userAgent) return;
  const m = await carregar();
  const dados: Perfil['dados'] = {};
  for (const c of CAMPOS) if (typeof f[c] === 'string' && f[c]) dados[c] = f[c] as string;
  await fs.mkdir(DIR, { recursive: true });
  for (const chave of chaves(f)) {
    const anterior = m.get(chave)?.dados ?? {};
    const p: Perfil = { chave, em: new Date().toISOString(), dados: { ...anterior, ...dados } };
    m.set(chave, p);
    await fs.appendFile(ARQ, JSON.stringify(p) + '\n', 'utf8');
  }
}

/** Completa os campos ausentes com o perfil. Nunca sobrescreve o que o evento ja trouxe. */
export async function enriquecer(
  f: Record<string, string | boolean>
): Promise<{ campos: Record<string, string | boolean>; herdados: string[] }> {
  const m = await carregar();
  const saida = { ...f };
  const herdados: string[] = [];
  for (const chave of chaves(f)) {
    const p = m.get(chave);
    if (!p) continue;
    if (Date.now() - new Date(p.em).getTime() > VALIDADE_MS) continue;
    for (const c of CAMPOS) {
      const valor = p.dados[c];
      if (!saida[c] && valor) {
        saida[c] = valor;
        herdados.push(c);
      }
    }
  }
  return { campos: saida, herdados };
}

/** So para teste: descarta o cache em memoria e releem o jsonl. */
export function _limparCache() {
  mapa = null;
}
