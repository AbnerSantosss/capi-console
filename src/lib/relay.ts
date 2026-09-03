import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { lerIntegracoes, type DestinoRelay, type EventoRelay } from './config-store';

/**
 * Relay de saida: devolve ao n8n / Bitrix / CRM o que aconteceu com o disparo.
 *
 * Hoje o fbtrace_id, o events_received e o link do criativo so existem em
 * logs/disparos.md. Sem isto, quem chamou o webhook nunca fica sabendo se a
 * Meta aceitou.
 *
 * REGRA INEGOCIAVEL: nenhum segredo entra no payload de saida. Nem o
 * accessToken da Meta, nem o X-CAPI-Secret da entrada. `limparSegredos` roda
 * sobre todo payload antes de sair e ha teste automatizado para isso
 * (scripts/relay-sem-segredos.test.mjs).
 */

const DIR = path.join(process.cwd(), 'logs');
const ARQ_ENTREGAS = path.join(DIR, 'relay.jsonl');
const ARQ_FALHAS = path.join(DIR, 'relay-failed.jsonl');

const ESPERAS_MS = [1000, 4000, 15000];
const TIMEOUT_MS = 10000;

/** Chaves que jamais podem sair daqui, em qualquer profundidade. */
const PROIBIDAS = [
  'accesstoken',
  'access_token',
  'token',
  'segredo',
  'secret',
  'senha',
  'password',
  'authorization',
  'apikey',
  'api_key',
];

export function limparSegredos<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map((v) => limparSegredos(v)) as unknown as T;
  }
  if (valor && typeof valor === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (PROIBIDAS.includes(k.toLowerCase())) continue;
      saida[k] = limparSegredos(v);
    }
    return saida as unknown as T;
  }
  return valor;
}

export interface Entrega {
  id: string;
  em: string;
  destinoId: string;
  destinoNome: string;
  url: string;
  evento: EventoRelay | 'teste';
  httpStatus: number;
  duracaoMs: number;
  tentativas: number;
  ok: boolean;
  erro?: string;
}

async function registrar(arquivo: string, e: Entrega | Record<string, unknown>) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(arquivo, JSON.stringify(e) + '\n', 'utf8');
}

async function postar(
  destino: DestinoRelay,
  corpo: unknown
): Promise<{ status: number; erro?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(destino.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...destino.headers,
      },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    return { status: r.status };
  } catch (e) {
    return {
      status: 0,
      erro: e instanceof Error ? e.message : 'Falha de rede',
    };
  } finally {
    clearTimeout(t);
  }
}

/** Envia a um destino com 3 tentativas e backoff. Nunca lanca. */
export async function enviarRelay(
  destino: DestinoRelay,
  evento: EventoRelay | 'teste',
  payload: unknown
): Promise<Entrega> {
  const corpo = limparSegredos({
    tipo: evento,
    ocorridoEm: new Date().toISOString(),
    ...(payload as Record<string, unknown>),
  });

  const inicio = Date.now();
  let ultimo: { status: number; erro?: string } = { status: 0 };

  for (let tentativa = 1; tentativa <= ESPERAS_MS.length + 1; tentativa++) {
    ultimo = await postar(destino, corpo);
    if (ultimo.status >= 200 && ultimo.status < 300) {
      const e: Entrega = {
        id: crypto.randomUUID(),
        em: new Date().toISOString(),
        destinoId: destino.id,
        destinoNome: destino.nome,
        url: destino.url,
        evento,
        httpStatus: ultimo.status,
        duracaoMs: Date.now() - inicio,
        tentativas: tentativa,
        ok: true,
      };
      await registrar(ARQ_ENTREGAS, e);
      return e;
    }
    const espera = ESPERAS_MS[tentativa - 1];
    if (espera) await new Promise((r) => setTimeout(r, espera));
  }

  const falha: Entrega = {
    id: crypto.randomUUID(),
    em: new Date().toISOString(),
    destinoId: destino.id,
    destinoNome: destino.nome,
    url: destino.url,
    evento,
    httpStatus: ultimo.status,
    duracaoMs: Date.now() - inicio,
    tentativas: ESPERAS_MS.length + 1,
    ok: false,
    erro: ultimo.erro ?? `HTTP ${ultimo.status}`,
  };
  await registrar(ARQ_ENTREGAS, falha);
  await registrar(ARQ_FALHAS, { ...falha, corpo });
  return falha;
}

/** Dispara para todos os destinos ativos inscritos neste evento. */
export async function transmitir(evento: EventoRelay, payload: unknown) {
  const cfg = await lerIntegracoes();
  const alvos = cfg.saida.filter((d) => d.ativo && d.eventos.includes(evento));
  if (!alvos.length) return [];
  return Promise.all(alvos.map((d) => enviarRelay(d, evento, payload)));
}

export async function listarEntregas(limite = 50): Promise<Entrega[]> {
  try {
    const txt = await fs.readFile(ARQ_ENTREGAS, 'utf8');
    return txt
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as Entrega;
        } catch {
          return null;
        }
      })
      .filter((x): x is Entrega => x !== null)
      .reverse()
      .slice(0, limite);
  } catch {
    return [];
  }
}
