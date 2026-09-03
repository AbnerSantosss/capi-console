/* eslint-disable @typescript-eslint/no-explicit-any */

interface ParseResult {
  fields: Record<string, string | boolean>;
  preenchidos: string[];
  eventName?: string;
  /** Nome original do evento na plataforma (ex.: purchase_approved). */
  eventoOrigem?: string;
  /** true quando eventoOrigem esta na tabela MAPA_EVENTOS_ORIGEM. */
  eventoConhecido: boolean;
  /** true quando a tabela manda ignorar (abandono, estorno, etc.). */
  ignorar: boolean;
}

/**
 * Tabela definitiva evento de origem -> evento Meta.
 * null = ignorar (nao existe evento padrao da Meta; enviar seria evento ficticio).
 * Fonte: catalogo de 24 eventos do backoffice xWinner (03/09/2026) + eventos do
 * gateway (Checkout Platform) vistos em /backoffice/webhooks.
 */
export const MAPA_EVENTOS_ORIGEM: Record<string, string | null> = {
  // --- xWinner, webhook de saida (formato A, version 1.0) ---
  user_registered: 'CompleteRegistration',
  onboarding_completed: null,
  precheckout_opened: 'Lead',
  precheckout_expired: null,
  checkout_session_opened: 'InitiateCheckout',
  payment_generated: 'AddPaymentInfo',
  checkout_card_attempted: 'AddPaymentInfo',
  checkout_abandoned: null,
  checkout_lead_abandoned: null,
  purchase_approved: 'Purchase',
  purchase_refunded: null,
  chargeback_opened: null,
  subscription_started: 'Subscribe',
  subscription_renewed: null,
  subscription_cancelled: null,
  subscription_expired: null,
  affiliate_registered: null,
  affiliate_approved: null,
  commission_released: null,
  commission_reversed: null,
  withdrawal_requested: null,
  withdrawal_paid: null,
  ebook_completed: null,
  tool_used: null,
  // --- gateway / Checkout Platform (formato B) ---
  'pre.checkout.session.opened': 'Lead',
  'pre.checkout.session.expired': null,
  'checkout.lead.abandoned': null,
  'checkout.session.opened': 'InitiateCheckout',
  'checkout.pix.generated': 'AddPaymentInfo',
  'checkout.session.completed': 'Purchase',
  'checkout.session.expired': null,
  'payment.paid': 'Purchase',
  // --- sinonimos usados pelo tracker tkr e por simulacoes ---
  purchase: 'Purchase',
  order_approved: 'Purchase',
  begin_checkout: 'InitiateCheckout',
  pre_checkout_opened: 'Lead',
  pre_checkout_abandoned: null,
};

const PALAVRAS_NEGATIVAS = ['abandon', 'expired', 'expir', 'refund', 'estorn', 'chargeback', 'cancel', 'reversed', 'withdraw', 'commission', 'affiliate'];

/**
 * Devolve { eventoMeta, conhecido }. conhecido=false significa que o nome nao
 * esta na tabela e caiu na heuristica — a UI deve destacar isso.
 */
export function mapearEventoOrigem(nome: string): { eventoMeta: string | null; conhecido: boolean } {
  const n = String(nome || '').trim();
  if (!n) return { eventoMeta: null, conhecido: false };
  if (Object.prototype.hasOwnProperty.call(MAPA_EVENTOS_ORIGEM, n)) {
    return { eventoMeta: MAPA_EVENTOS_ORIGEM[n], conhecido: true };
  }
  const l = n.toLowerCase();
  if (PALAVRAS_NEGATIVAS.some((p) => l.includes(p))) return { eventoMeta: null, conhecido: false };
  if (l.includes('completed') || l.includes('approved') || l.includes('paid') || l === 'purchase') return { eventoMeta: 'Purchase', conhecido: false };
  if (l.includes('pre.checkout') || l.includes('pre_checkout') || l.includes('precheckout') || l.includes('lead')) return { eventoMeta: 'Lead', conhecido: false };
  if (l.includes('pix') || l.includes('payment_generated') || l.includes('card')) return { eventoMeta: 'AddPaymentInfo', conhecido: false };
  if (l.includes('checkout')) return { eventoMeta: 'InitiateCheckout', conhecido: false };
  if (l.includes('regist')) return { eventoMeta: 'CompleteRegistration', conhecido: false };
  return { eventoMeta: null, conhecido: false };
}

/** Regra 1 e 4 do CLAUDE.md + payload de teste do xWinner: nunca vai para a Meta. */
export function ehTesteInterno(fields: Record<string, string | boolean>, eventId?: string): boolean {
  const email = String(fields.email || '').toLowerCase();
  const nome = `${fields.firstName || ''} ${fields.lastName || ''}`.toLowerCase().trim();
  const valor = Number(fields.value || 0);
  if (eventId && /^evt_preview/i.test(eventId)) return true;
  if (/@(example\.com|exemplo\.com\.br|example\.org|test\.com)$/.test(email)) return true;
  if (email.startsWith('teste@') || email.startsWith('testador@') || email.includes('jairo')) return true;
  if (nome.includes('jairo') || nome === 'lead convidado' || nome.includes('simulação teste')) return true;
  if (valor > 0 && valor <= 0.1) return true;
  return false;
}

function encontrarRaiz(j: any): any {
  if (j.payload) {
    if (j.payload.data && (j.payload.data.lead || j.payload.data.attribution)) return j.payload.data;
    if (j.payload.lead || j.payload.attribution) return j.payload;
  }
  if (
    j.data &&
    (j.data.lead ||
      j.data.amount !== undefined ||
      j.data.amountMinor !== undefined ||
      j.data.attribution ||
      j.data.order_id !== undefined ||
      j.data.precheckout_id !== undefined)
  ) {
    return j.data;
  }
  return j;
}

function construirUrlComUtms(baseUrl: string, utms: Record<string, string>): string {
  let url = baseUrl || 'https://codigovencedor.com/';
  if (url.includes('utm_source=')) return url;
  const params: string[] = [];
  if (utms.source) params.push(`utm_source=${encodeURIComponent(utms.source)}`);
  if (utms.medium) params.push(`utm_medium=${encodeURIComponent(utms.medium)}`);
  if (utms.campaign) params.push(`utm_campaign=${encodeURIComponent(utms.campaign)}`);
  if (utms.content) params.push(`utm_content=${encodeURIComponent(utms.content)}`);
  if (utms.term) params.push(`utm_term=${encodeURIComponent(utms.term)}`);
  if (params.length === 0) return url;
  url += (url.includes('?') ? '&' : '?') + params.join('&');
  return url;
}

function extrairParam(url: string, nome: string): string {
  if (!url) return '';
  const m = url.match(new RegExp('[?&]' + nome + '=([^&#]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/** IP de pod/proxy/loopback nao e o IP do comprador: a Meta descarta e suja o geo. */
function ehIpNaoRoteavel(ip: string): boolean {
  if (!ip) return true;
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  return false;
}

export function parseWebhook(bruto: string): ParseResult {
  const j = JSON.parse(bruto);
  const raiz = encontrarRaiz(j);
  const fields: Record<string, string | boolean> = {};
  const preenchidos: string[] = [];
  let eventName: string | undefined;

  // A classificacao vem da tabela MAPA_EVENTOS_ORIGEM (fonte unica); a heuristica
  // e so fallback para nomes que a plataforma criar depois. Sem a tabela,
  // "checkout_abandoned" viraria InitiateCheckout — evento que nunca aconteceu.
  // "pre.checkout.session.opened" contem "checkout", mas a propria plataforma o
  // chama de "Pre-checkout iniciado (lead)": e a CAPTURA DO CONTATO, nao o checkout.
  const evName = (j.event || raiz.event || raiz.eventName || j.eventName || '') as string;
  const mapa = mapearEventoOrigem(evName);
  const eventoOrigem = evName || undefined;
  const eventoConhecido = mapa.conhecido;
  const ignorar = Boolean(evName) && mapa.eventoMeta === null;
  if (mapa.eventoMeta) {
    eventName = mapa.eventoMeta;
    preenchidos.push(`Evento: ${eventName}${mapa.conhecido ? '' : ' (heurística)'}`);
  } else if (evName) {
    preenchidos.push(`Evento ${evName}: ignorar (sem equivalente na Meta)`);
  }

  const lead = (raiz.lead || {}) as any;
  if (lead.email) { fields.email = lead.email; preenchidos.push('e-mail'); }
  if (lead.phone) {
    // Formato A manda o DDI separado (phone_country_code). Sem juntar, o telefone
    // sai sem o 55 e a Meta nao acha o comprador.
    const ddi = String(lead.phone_country_code || '').replace(/\D+/g, '');
    const digitos = String(lead.phone).replace(/\D+/g, '');
    fields.phone = ddi && !digitos.startsWith(ddi) ? ddi + digitos : digitos;
    preenchidos.push('telefone');
  }
  if (lead.name) {
    const partes = String(lead.name).trim().split(/\s+/);
    fields.firstName = partes[0];
    if (partes.length > 1) fields.lastName = partes.slice(1).join(' ');
    preenchidos.push('nome');
  }
  if (lead.taxId) { fields.externalId = lead.taxId; preenchidos.push('external_id (CPF)'); }
  if (!fields.externalId && raiz.buyer?.external_id) {
    fields.externalId = String(raiz.buyer.external_id);
    preenchidos.push('external_id (buyer)');
  }

  if (raiz.amountMinor !== undefined && raiz.amountMinor !== null) {
    fields.value = (Number(raiz.amountMinor) / 100).toFixed(2);
    preenchidos.push('valor');
  } else if (raiz.amount !== undefined && raiz.amount !== null) {
    fields.value = (Number(raiz.amount) / 100).toFixed(2);
    preenchidos.push('valor');
  } else if (raiz.pricing?.originalAmountMinor !== undefined) {
    fields.value = (Number(raiz.pricing.originalAmountMinor) / 100).toFixed(2);
    preenchidos.push('valor (pricing)');
  }

  fields.currency = (raiz.currency as string) || 'BRL';
  preenchidos.push('moeda');

  const orderId = (raiz.order_id || raiz.orderId || raiz.sessionId || '') as string;
  if (orderId) {
    fields.orderId = orderId;
    preenchidos.push('pedido');
  }

  // event_id tem que ser o MESMO id que o Pixel do navegador manda em
  // fbq('track','Purchase',{...},{eventID}). E o que faz a Meta deduplicar
  // browser + CAPI; divergindo, a mesma compra e contada duas vezes.
  // Cai para order_<id> so quando o webhook nao traz id canonico.
  const idCanonico = (j.eventId || raiz.eventId || j.event_id || raiz.event_id || '') as string;
  if (idCanonico) {
    fields.eventId = String(idCanonico);
    preenchidos.push('event_id do webhook (dedup)');
  } else if (orderId) {
    fields.eventId = 'order_' + orderId;
    preenchidos.push('event_id derivado do pedido');
  }

  const product = raiz.product as any;
  if (product?.name) { fields.contentName = product.name; preenchidos.push('produto'); }

  const quando = (raiz.occurredAt || raiz.occurred_at || raiz.approved_at || raiz.generated_at || raiz.opened_at || j.created_at) as string;
  if (quando) {
    const d = new Date(quando);
    if (!isNaN(d.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0');
      fields.eventTime = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      preenchidos.push('data/hora');
    }
  }

  const attr = (raiz.attribution || {}) as any;
  const cookies = (attr.cookies || {}) as any;
  const utms = (attr.utm || {}) as Record<string, string>;

  const urlBruta = (attr.eventSourceUrl || attr.event_source_url || attr.landing_page || '') as string;

  // fbc e o UNICO campo que liga a conversao a campanha / conjunto / anuncio no
  // Gerenciador. A Meta resolve pelo fbclid que vive dentro dele — utm_source,
  // utm_campaign, utm_content e ad_id na URL NAO atribuem nada.
  // Por isso: se o cookie _fbc nao vier, reconstroi no formato fb.1.<ms>.<fbclid>,
  // pegando o fbclid do cookie ou da propria eventSourceUrl.
  const fbclid = (cookies.fbclid || extrairParam(urlBruta, 'fbclid') || '') as string;
  if (cookies.fbc) {
    fields.fbc = cookies.fbc;
    preenchidos.push('fbc');
  } else if (fbclid) {
    const msClique = new Date(quando || '').getTime() || Date.now();
    fields.fbc = 'fb.1.' + msClique + '.' + fbclid;
    preenchidos.push('fbc reconstruido do fbclid');
  }

  if (cookies.fbp) { fields.fbp = cookies.fbp; preenchidos.push('fbp'); }
  if (attr.userAgent) { fields.userAgent = attr.userAgent; preenchidos.push('user agent'); }
  if (attr.user_agent) { fields.userAgent = attr.user_agent; preenchidos.push('user agent'); }

  const ipBruto = String(attr.ipAddress || attr.ip_address || attr.ip || '').replace(/^::ffff:/i, '').trim();
  if (ipBruto && !ehIpNaoRoteavel(ipBruto)) {
    fields.ip = ipBruto;
    preenchidos.push('IP do cliente');
  } else if (ipBruto) {
    preenchidos.push('IP ' + ipBruto + ' descartado (rede interna, use X-Forwarded-For)');
  }

  let sourceUrl = urlBruta;
  if (!sourceUrl && Object.keys(utms).length) {
    sourceUrl = construirUrlComUtms('https://codigovencedor.com/', utms);
  }
  if (sourceUrl) {
    if (fbclid && !sourceUrl.includes('fbclid=')) {
      sourceUrl += (sourceUrl.includes('?') ? '&' : '?') + 'fbclid=' + encodeURIComponent(fbclid);
    }
    fields.sourceUrl = sourceUrl;
    preenchidos.push('URL de origem');
  }

  return { fields, preenchidos, eventName, eventoOrigem, eventoConhecido, ignorar };
}
