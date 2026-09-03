import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Configuracao local do console, guardada em disco no servidor.
 *
 * Motivo de existir: o token de acesso da Meta estava sendo persistido em
 * localStorage pelo Zustand, o que contraria a regra 2 do CLAUDE.md do projeto
 * ("tokens ... use o arquivo local .env"). Qualquer script rodando na origem
 * conseguia ler o token. Agora o segredo nunca sai do servidor: o cliente so
 * recebe `temToken: boolean`.
 *
 * A pasta `config/` esta no .gitignore.
 */

const DIR = path.join(process.cwd(), 'config');
const ARQ_MARCAS = path.join(DIR, 'marcas.json');
const ARQ_INTEGRACOES = path.join(DIR, 'integracoes.json');

/* ------------------------------------------------------------------ */
/* Marcas                                                              */
/* ------------------------------------------------------------------ */

export interface Marca {
  id: string;
  nome: string;
  pixelId: string;
  /** NUNCA vai para o cliente. */
  accessToken: string;
  testCode: string;
  /** ID da conta de anuncios, para montar os deep links do Gerenciador. */
  adAccountId?: string;
  /** true quando os valores vem do .env e nao de config/marcas.json. */
  doEnv?: boolean;
}

/** A forma que o cliente pode ver. */
export interface MarcaPublica {
  id: string;
  nome: string;
  pixelId: string;
  temToken: boolean;
  testCode: string;
  adAccountId?: string;
  doEnv?: boolean;
}

export function publicarMarca(m: Marca): MarcaPublica {
  return {
    id: m.id,
    nome: m.nome,
    pixelId: m.pixelId,
    temToken: Boolean(m.accessToken?.trim()),
    testCode: m.testCode ?? '',
    adAccountId: m.adAccountId,
    doEnv: m.doEnv,
  };
}

async function garantirDir() {
  await fs.mkdir(DIR, { recursive: true });
}

async function lerJson<T>(arquivo: string, padrao: T): Promise<T> {
  try {
    const txt = await fs.readFile(arquivo, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return padrao;
  }
}

async function gravarJson(arquivo: string, dados: unknown) {
  await garantirDir();
  await fs.writeFile(arquivo, JSON.stringify(dados, null, 2), 'utf8');
}

/** Marca implicita vinda do .env. Sempre existe, sempre com id "default". */
function marcaDoEnv(): Marca {
  return {
    id: 'default',
    nome: process.env.BRAND_NAME || 'Código Vencedor',
    pixelId: process.env.PIXEL_ID || '',
    accessToken: process.env.ACCESS_TOKEN || '',
    testCode: process.env.TEST_EVENT_CODE || '',
    adAccountId: process.env.AD_ACCOUNT_ID || undefined,
    doEnv: true,
  };
}

export async function listarMarcas(): Promise<Marca[]> {
  const salvas = await lerJson<Marca[]>(ARQ_MARCAS, []);
  const env = marcaDoEnv();
  const sobrescrita = salvas.find((m) => m.id === 'default');

  const padrao: Marca = sobrescrita
    ? {
        ...env,
        ...sobrescrita,
        // o token do .env vale como reserva quando a marca nao tem um proprio
        accessToken: sobrescrita.accessToken?.trim() || env.accessToken,
        doEnv: !sobrescrita.accessToken?.trim(),
      }
    : env;

  return [padrao, ...salvas.filter((m) => m.id !== 'default')];
}

export async function acharMarca(id: string): Promise<Marca | undefined> {
  const todas = await listarMarcas();
  return todas.find((m) => m.id === id) ?? todas[0];
}

export async function salvarMarca(entrada: Partial<Marca> & { id: string }) {
  const salvas = await lerJson<Marca[]>(ARQ_MARCAS, []);
  const i = salvas.findIndex((m) => m.id === entrada.id);

  const base: Marca = i >= 0
    ? salvas[i]
    : {
        id: entrada.id,
        nome: '',
        pixelId: '',
        accessToken: '',
        testCode: '',
      };

  const atualizada: Marca = {
    ...base,
    ...entrada,
    // string vazia significa "nao mexer no token"; para limpar, envie null.
    accessToken:
      entrada.accessToken === null
        ? ''
        : entrada.accessToken?.trim()
          ? entrada.accessToken.trim()
          : base.accessToken,
  };

  if (i >= 0) salvas[i] = atualizada;
  else salvas.push(atualizada);

  await gravarJson(ARQ_MARCAS, salvas);
  return atualizada;
}

export async function removerMarca(id: string) {
  if (id === 'default') throw new Error('A marca padrão não pode ser removida.');
  const salvas = await lerJson<Marca[]>(ARQ_MARCAS, []);
  await gravarJson(
    ARQ_MARCAS,
    salvas.filter((m) => m.id !== id)
  );
}

/* ------------------------------------------------------------------ */
/* Integracoes (webhooks de entrada e saida)                           */
/* ------------------------------------------------------------------ */

export type EventoRelay = 'dispatch.success' | 'dispatch.error' | 'inbox.received';

export interface DestinoRelay {
  id: string;
  nome: string;
  url: string;
  headers: Record<string, string>;
  eventos: EventoRelay[];
  ativo: boolean;
}

export type ModoRegra = 'auto' | 'fila' | 'ignorar';

export interface RegraRoteamento {
  id: string;
  /** Nome exato do evento na origem (ex.: purchase_approved). '*' = qualquer evento sem regra propria. */
  eventoOrigem: string;
  /** Evento padrao da Meta ou nome customizado. Ignorado quando modo = 'ignorar'. */
  eventoMeta: string;
  /** IDs das marcas (pixels) que recebem o evento. Vazio = marca 'default'. */
  marcas: string[];
  modo: ModoRegra;
  ativo: boolean;
}

export interface Integracoes {
  entrada: {
    /** Segredo exigido no header X-CAPI-Secret. Nunca vai inteiro ao cliente. */
    segredo: string;
    /** Modo usado quando NENHUMA regra casa (fallback). */
    modo: 'fila' | 'auto';
  };
  regras: RegraRoteamento[];
  saida: DestinoRelay[];
}

/**
 * Regras iniciais. TODAS nascem em 'fila' ou 'ignorar' de proposito: nada pode
 * disparar sozinho antes de o humano ver funcionando no Test Events. Ligar o
 * 'auto' do Purchase e uma decisao consciente, feita na tela de Integracoes.
 */
export const REGRAS_SEMENTE = (): RegraRoteamento[] => [
  { id: 'r-precheckout', eventoOrigem: 'precheckout_opened', eventoMeta: 'Lead', marcas: ['default'], modo: 'fila', ativo: true },
  { id: 'r-precheckout-b', eventoOrigem: 'pre.checkout.session.opened', eventoMeta: 'Lead', marcas: ['default'], modo: 'fila', ativo: true },
  { id: 'r-checkout', eventoOrigem: 'checkout_session_opened', eventoMeta: 'InitiateCheckout', marcas: ['default'], modo: 'fila', ativo: true },
  { id: 'r-checkout-b', eventoOrigem: 'checkout.session.opened', eventoMeta: 'InitiateCheckout', marcas: ['default'], modo: 'fila', ativo: true },
  { id: 'r-pix', eventoOrigem: 'payment_generated', eventoMeta: 'AddPaymentInfo', marcas: ['default'], modo: 'fila', ativo: true },
  { id: 'r-pix-b', eventoOrigem: 'checkout.pix.generated', eventoMeta: 'AddPaymentInfo', marcas: ['default'], modo: 'fila', ativo: true },
  { id: 'r-card', eventoOrigem: 'checkout_card_attempted', eventoMeta: 'AddPaymentInfo', marcas: ['default'], modo: 'fila', ativo: true },
  { id: 'r-purchase', eventoOrigem: 'purchase_approved', eventoMeta: 'Purchase', marcas: ['default'], modo: 'fila', ativo: true },
  { id: 'r-purchase-b', eventoOrigem: 'checkout.session.completed', eventoMeta: 'Purchase', marcas: ['default'], modo: 'fila', ativo: true },
  { id: 'r-purchase-c', eventoOrigem: 'payment.paid', eventoMeta: 'Purchase', marcas: ['default'], modo: 'fila', ativo: true },
  { id: 'r-registro', eventoOrigem: 'user_registered', eventoMeta: 'CompleteRegistration', marcas: ['default'], modo: 'ignorar', ativo: true },
  { id: 'r-assinatura', eventoOrigem: 'subscription_started', eventoMeta: 'Subscribe', marcas: ['default'], modo: 'ignorar', ativo: true },
  ...['precheckout_expired', 'checkout_abandoned', 'checkout_lead_abandoned', 'checkout.session.expired', 'checkout.lead.abandoned', 'pre.checkout.session.expired', 'purchase_refunded', 'chargeback_opened'].map((e) => ({
    id: `r-ign-${e.replace(/\W+/g, '-')}`,
    eventoOrigem: e,
    eventoMeta: '',
    marcas: [] as string[],
    modo: 'ignorar' as ModoRegra,
    ativo: true,
  })),
];

const INTEGRACOES_PADRAO = (): Integracoes => ({
  entrada: { segredo: crypto.randomUUID(), modo: 'fila' },
  regras: REGRAS_SEMENTE(),
  saida: [],
});

export async function lerIntegracoes(): Promise<Integracoes> {
  const atual = await lerJson<Integracoes | null>(ARQ_INTEGRACOES, null);
  if (atual?.entrada?.segredo) {
    // Migracao: arquivo criado antes das regras existirem.
    if (!Array.isArray(atual.regras)) {
      atual.regras = REGRAS_SEMENTE();
      await gravarJson(ARQ_INTEGRACOES, atual);
    }
    if (!Array.isArray(atual.saida)) atual.saida = [];
    return atual;
  }
  const nova = INTEGRACOES_PADRAO();
  await gravarJson(ARQ_INTEGRACOES, nova);
  return nova;
}

/**
 * Regra que vale para este evento. Regra exata vence a curinga '*'.
 * Sem regra: quem chamou decide o fallback (o webhook usa 'fila').
 */
export function acharRegra(cfg: Integracoes, eventoOrigem: string): RegraRoteamento | undefined {
  const ativas = (cfg.regras ?? []).filter((r) => r.ativo);
  return ativas.find((r) => r.eventoOrigem === eventoOrigem) ?? ativas.find((r) => r.eventoOrigem === '*');
}

export async function salvarIntegracoes(dados: Integracoes) {
  await gravarJson(ARQ_INTEGRACOES, dados);
  return dados;
}

export async function novoSegredoEntrada(): Promise<string> {
  const atual = await lerIntegracoes();
  atual.entrada.segredo = crypto.randomUUID();
  await salvarIntegracoes(atual);
  return atual.entrada.segredo;
}

/** Comparacao em tempo constante — evita vazar o segredo por timing. */
export function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(String(recebido ?? ''));
  const b = Buffer.from(String(esperado ?? ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
