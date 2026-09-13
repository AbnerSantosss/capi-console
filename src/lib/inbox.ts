import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import type { ClassificacaoEvento, MotivoIgnorar } from './parser';

/**
 * Caixa de entrada de webhooks.
 *
 * Por que existe: hoje o operador copia o JSON do n8n/Bitrix na mao e cola no
 * console. E o passo mais lento e e onde o fbc se perde. Com a caixa de
 * entrada, o payload chega inteiro e vira um clique.
 *
 * Persistencia: logs/inbox.jsonl (append-only, ja no .gitignore por conter
 * dados de comprador) + um buffer em memoria para a listagem e o SSE.
 */

const DIR = path.join(process.cwd(), 'logs');
const ARQ = path.join(DIR, 'inbox.jsonl');
/**
 * Status e resultados vao para um segundo arquivo, tambem append-only. Reescrever
 * o inbox.jsonl a cada mudanca de status corromperia o historico num restart no
 * meio da escrita — e sem persistir, todo item voltava a "novo" depois do deploy,
 * abrindo espaco para disparar de novo a mesma venda.
 */
const ARQ_EVENTOS = path.join(DIR, 'inbox-resultados.jsonl');
const LIMITE_MEMORIA = 100;

export type StatusEntrada = 'novo' | 'carregado' | 'disparado' | 'ignorado';

/**
 * O resultado de um disparo, por pixel (P-12).
 *
 * `marcaId` diz QUAL cadastro deste app foi usado; `pixelId` diz PARA ONDE a
 * conversao foi. Sao coisas diferentes, e so a segunda sobrevive ao cadastro
 * ser apagado: `marca_lx8k2p` nao existe fora daqui, o ID do Pixel existe no
 * Gerenciador de Eventos da Meta.
 *
 * `pixelId` e OPCIONAL porque este tipo tambem descreve o que ja esta gravado
 * em `logs/inbox-resultados.jsonl`, escrito antes de o campo existir. Nenhuma
 * linha antiga e reescrita: a tela le a ausencia e mostra "Pixel removido" sem
 * numero. Ausencia = comportamento de hoje.
 */
export interface ResultadoPorPixel {
  marcaId: string;
  /** Ausente em registro antigo. Presente em tudo que for gravado agora. */
  pixelId?: string;
  status: string;
  httpStatus?: number;
  eventsReceived?: number;
  fbtraceId?: string;
  erro?: string;
  modoTeste?: boolean;
  herdados?: string[];
  emq?: number;
}

export interface ItemInbox {
  id: string;
  recebidoEm: string;
  origem: string;
  /** Nome do evento detectado pelo parser. */
  evento?: string;
  valor?: number;
  moeda?: string;
  /** E-mail mascarado. O valor inteiro fica so no payload. */
  emailMascarado?: string;
  orderId?: string;
  temFbc: boolean;
  temFbp: boolean;
  emq?: number;
  status: StatusEntrada;
  payload: unknown;
  /** Nome do evento como veio da plataforma (ex.: purchase_approved). */
  eventoOrigem?: string;
  /** Evento da Meta que a regra escolheu. */
  eventoMeta?: string;
  regraId?: string;
  modo?: 'auto' | 'fila' | 'ignorar';
  /** false quando o nome do evento nao esta no catalogo conhecido. */
  conhecido?: boolean;
  /* --- campos de leitura: explicam a decisao, nao mudam roteamento nenhum --- */
  /** Como o parser classificou o nome do evento. */
  classificacao?: ClassificacaoEvento;
  /** Por que nada foi enviado. Separa 'regra' de 'sem equivalente' e de 'teste'. */
  motivoIgnorar?: MotivoIgnorar;
  /** true para o botao "Testar" da plataforma (ping): entrega OK, nada a enviar. */
  testePlataforma?: boolean;
  /** true quando o payload e de teste da equipe (cupom de R$ 0,01, @example.com). */
  testeInterno?: boolean;
  /** Formato do payload reconhecido: A (xWinner), B (gateway) ou outro. */
  formato?: 'A' | 'B' | 'outro';
  /** Apelido que veio na URL. null = chegou pela URL antiga, de um segmento so. */
  rotuloRecebido?: string | null;
  /** true quando o apelido da URL difere do configurado. Nunca recusa a entrega. */
  rotuloDivergente?: boolean;
  /** Palpite da heuristica para nome novo. Texto de tela: nao e disparavel. */
  eventoMetaSugerido?: string;
  /** Um resultado por pixel, preenchido depois do disparo. */
  resultados?: unknown[];
}

let memoria: ItemInbox[] = [];
let carregado = false;

type Ouvinte = (item: ItemInbox, tipo: 'novo' | 'atualizado') => void;
const ouvintes = new Set<Ouvinte>();

export function assinar(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/**
 * Avisa TODOS os ouvintes do SSE, sem filtro nenhum: item ignorado, teste da
 * plataforma e nome desconhecido tambem sobem para a tela. O operador pediu
 * para ver tudo o que chega — esconder o ignorado e o que faz parecer que o
 * canal morreu.
 */
function avisar(item: ItemInbox, tipo: 'novo' | 'atualizado') {
  for (const fn of ouvintes) {
    try {
      fn(item, tipo);
    } catch {
      /* um ouvinte quebrado nao derruba o recebimento */
    }
  }
}

export function mascararEmail(email?: string): string | undefined {
  if (!email || !email.includes('@')) return undefined;
  const [usuario, dominio] = email.split('@');
  const visivel = usuario.slice(0, 2);
  return `${visivel}${'*'.repeat(Math.max(1, usuario.length - 2))}@${dominio}`;
}

async function carregarDoDisco() {
  if (carregado) return;
  carregado = true;
  try {
    const txt = await fs.readFile(ARQ, 'utf8');
    memoria = txt
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as ItemInbox;
        } catch {
          return null;
        }
      })
      .filter((x): x is ItemInbox => x !== null)
      .slice(-LIMITE_MEMORIA);
  } catch {
    memoria = [];
  }

  // Reaplica status e resultados gravados depois do recebimento.
  try {
    const txt = await fs.readFile(ARQ_EVENTOS, 'utf8');
    const porId = new Map(memoria.map((i) => [i.id, i]));
    for (const l of txt.split('\n')) {
      if (!l) continue;
      try {
        const e = JSON.parse(l) as { tipo: string; id: string; status?: StatusEntrada; resultados?: ResultadoPorPixel[] };
        const item = porId.get(e.id);
        if (!item) continue;
        if (e.tipo === 'status' && e.status) item.status = e.status;
        if (e.tipo === 'resultado' && e.resultados) item.resultados = e.resultados;
      } catch {
        /* linha corrompida */
      }
    }
  } catch {
    /* ainda nao houve disparo nenhum */
  }
}

async function anotar(registro: Record<string, unknown>) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(ARQ_EVENTOS, JSON.stringify({ ...registro, em: new Date().toISOString() }) + '\n', 'utf8');
}

export async function registrarEntrada(
  entrada: Omit<ItemInbox, 'id' | 'recebidoEm' | 'status'> &
    Partial<Pick<ItemInbox, 'status'>>
): Promise<ItemInbox> {
  await carregarDoDisco();

  // Espalha primeiro e deriva depois: com `...entrada` no fim, um chamador que
  // passe `status: undefined` explicitamente apagava o padrao e gravava item sem
  // status — que a tela nao sabe pintar.
  const item: ItemInbox = {
    ...entrada,
    id: crypto.randomUUID(),
    recebidoEm: new Date().toISOString(),
    status: entrada.status ?? 'novo',
  };

  memoria.push(item);
  if (memoria.length > LIMITE_MEMORIA) memoria = memoria.slice(-LIMITE_MEMORIA);

  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(ARQ, JSON.stringify(item) + '\n', 'utf8');

  avisar(item, 'novo');

  return item;
}

export async function listarEntradas(limite = 50): Promise<ItemInbox[]> {
  await carregarDoDisco();
  return [...memoria].reverse().slice(0, limite);
}

export async function acharEntrada(id: string): Promise<ItemInbox | undefined> {
  await carregarDoDisco();
  return memoria.find((i) => i.id === id);
}

export async function marcarStatus(id: string, status: StatusEntrada) {
  await carregarDoDisco();
  const item = memoria.find((i) => i.id === id);
  if (!item) return undefined;
  item.status = status;
  await anotar({ tipo: 'status', id, status }).catch(() => {});
  avisar(item, 'atualizado');
  return item;
}

/** Guarda o resultado por pixel do disparo e avisa a tela pelo SSE. */
export async function anotarResultado(id: string, resultados: ResultadoPorPixel[]) {
  await carregarDoDisco();
  const item = memoria.find((i) => i.id === id);
  if (!item) return undefined;
  item.resultados = resultados;
  await anotar({ tipo: 'resultado', id, resultados }).catch(() => {});
  avisar(item, 'atualizado');
  return item;
}

export async function limparEntradas() {
  await carregarDoDisco();
  memoria = [];
  try {
    await fs.rm(ARQ, { force: true });
    await fs.rm(ARQ_EVENTOS, { force: true });
  } catch {
    /* arquivo pode nem existir */
  }
}
