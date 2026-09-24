import crypto from 'crypto';

import { jaEhSha256 } from './hash-detect';
import { nomePadraoParecido } from './meta-events';

const GRAPH_VERSION_PADRAO = 'v26.0';

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

export function normEmail(v: string): string {
  return String(v || '').trim().toLowerCase();
}

export function normTelefone(v: string, adicionarDDI55: boolean): string {
  let d = String(v || '').replace(/\D+/g, '');
  d = d.replace(/^0+/, '');
  if (!d) return '';
  if (adicionarDDI55 && (d.length === 10 || d.length === 11) && !d.startsWith('55')) {
    d = '55' + d;
  }
  return d;
}

export function normNome(v: string): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normIp(v: string): string {
  return String(v || '').trim().replace(/^::ffff:/i, '');
}

export interface EventUser {
  email?: string;
  phone?: string;
  addDDI?: boolean;
  firstName?: string;
  lastName?: string;
  externalId?: string;
  fbc?: string;
  fbp?: string;
  ip?: string;
  userAgent?: string;
}

export interface EventCustom {
  value?: string | number;
  currency?: string;
  orderId?: string;
  contentName?: string;
}

export interface EventInput {
  event_name?: string;
  event_time?: number;
  event_id?: string;
  event_source_url?: string;
  action_source?: string;
  user?: EventUser;
  custom?: EventCustom;
}

export interface MetaEvent {
  event_name: string;
  event_time: number;
  action_source: string;
  user_data: Record<string, unknown>;
  event_id?: string;
  event_source_url?: string;
  custom_data?: Record<string, unknown>;
}

export function montarEvento(ev: EventInput): MetaEvent {
  const u = ev.user || {};
  const c = ev.custom || {};
  const user_data: Record<string, unknown> = {};

  // Deteccao de SHA-256 ANTES de normalizar: normalizar um hash e o que o
  // destroi (o phone perde as letras do hex na hora do replace(/\D+/g,'') e
  // ganha um "55" inventado). Se o valor cru ja e um hash de 64 hex, ele so
  // desce em minusculo — nunca passa por sha256() de novo (hash-do-hash) nem
  // pelas funcoes normEmail/normTelefone/normNome, que mutilam o hex.
  // Valor que so fica vazio DEPOIS de normalizar ("N/A", "-", ".") continua
  // fora do evento, como antes: sha256('') e o hash de nada, nunca um comprador.
  const hashDe = (cru: unknown, normalizar: (v: string) => string): string => {
    const v = String(cru || '').trim();
    if (!v) return '';
    if (jaEhSha256(v)) return v.toLowerCase();
    const n = normalizar(v);
    return n ? sha256(n) : '';
  };

  const em = hashDe(u.email, normEmail);
  if (em) user_data.em = [em];

  const ph = hashDe(u.phone, (v) => normTelefone(v, u.addDDI !== false));
  if (ph) user_data.ph = [ph];

  const fn = hashDe(u.firstName, normNome);
  if (fn) user_data.fn = [fn];

  const ln = hashDe(u.lastName, normNome);
  if (ln) user_data.ln = [ln];

  // external_id de 64 hex em claro (nenhuma fonte de hoje manda assim) desce
  // sem hash: a Meta aceita external_id sem hash, e casar exige só que o mesmo
  // valor chegue igual nos dois lados.
  const ext = hashDe(u.externalId, (v) => v);
  if (ext) user_data.external_id = [ext];

  const fbc = String(u.fbc || '').trim();
  if (fbc) user_data.fbc = fbc;

  const fbp = String(u.fbp || '').trim();
  if (fbp) user_data.fbp = fbp;

  const ip = normIp(u.ip || '');
  if (ip) user_data.client_ip_address = ip;

  const ua = String(u.userAgent || '').trim();
  if (ua) user_data.client_user_agent = ua;

  const evento: MetaEvent = {
    // Sem padrao nenhum aqui de proposito: `|| 'Purchase'` transformava chamada
    // sem event_name numa compra inventada, com HTTP 200 da Meta e sem erro
    // nenhum na tela. Nome vazio agora morre em validar().
    event_name: String(ev.event_name ?? '').trim(),
    event_time: Math.floor(Number(ev.event_time)),
    action_source: ev.action_source || 'website',
    user_data,
  };
  if (ev.event_id) evento.event_id = String(ev.event_id).trim();
  if (ev.event_source_url) evento.event_source_url = String(ev.event_source_url).trim();

  const custom_data: Record<string, unknown> = {};
  if (c.value !== undefined && c.value !== null && c.value !== '') custom_data.value = Number(c.value);
  if (c.currency) custom_data.currency = String(c.currency).trim().toUpperCase();
  if (c.orderId) custom_data.order_id = String(c.orderId).trim();
  if (c.contentName) custom_data.content_name = String(c.contentName).trim();
  if (Object.keys(custom_data).length) evento.custom_data = custom_data;

  return evento;
}

export function validar(evento: MetaEvent): string[] {
  const erros: string[] = [];
  const agora = Math.floor(Date.now() / 1000);
  const seteDias = 7 * 24 * 3600;

  const nome = String(evento.event_name ?? '').trim();
  if (!nome) {
    erros.push('Informe o nome do evento.');
  } else {
    // A Meta responde 200 para 'purchase' e cria um evento personalizado com
    // esse nome: o erro fica indistinguivel do sucesso e a campanha otimiza
    // para nada. So barramos o quase-acerto; nome personalizado de verdade
    // (ex.: 'AulaAssistida') continua passando.
    const parecido = nomePadraoParecido(nome);
    if (parecido) {
      erros.push(
        `"${nome}" não é um nome padrão. Você quis dizer ${parecido}? O nome diferencia maiúsculas e minúsculas.`
      );
    }
  }

  if (!evento.event_time || Number.isNaN(evento.event_time)) {
    erros.push('event_time inválido.');
  } else {
    if (evento.event_time < agora - seteDias + 120) {
      erros.push('event_time com mais de 7 dias — a Meta rejeita.');
    }
    if (evento.event_time > agora + 600) {
      erros.push('event_time no futuro.');
    }
  }
  if (!Object.keys(evento.user_data).length) {
    erros.push('Informe pelo menos um dado do cliente.');
  }
  if (evento.event_name === 'Purchase') {
    if (!evento.custom_data || evento.custom_data.value === undefined || !evento.custom_data.currency) {
      erros.push('Purchase exige valor e moeda.');
    }
  }
  return erros;
}

export async function enviarParaMeta(params: {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  apiVersion?: string;
  evento: MetaEvent;
}): Promise<{ httpStatus: number; resposta: Record<string, unknown> }> {
  const versao = (params.apiVersion || GRAPH_VERSION_PADRAO).replace(/[^v0-9.]/g, '');
  const url = `https://graph.facebook.com/${versao}/${encodeURIComponent(params.pixelId)}/events`;
  const corpo: Record<string, unknown> = { data: [params.evento], access_token: params.accessToken };
  if (params.testEventCode) corpo.test_event_code = String(params.testEventCode).trim();

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const texto = await resp.text();
  let json: Record<string, unknown>;
  try { json = JSON.parse(texto); } catch { json = { raw: texto }; }
  return { httpStatus: resp.status, resposta: json };
}
