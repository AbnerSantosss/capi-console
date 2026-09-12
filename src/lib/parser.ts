/* eslint-disable @typescript-eslint/no-explicit-any */

// Import de TIPO apenas: some na compilacao, entao parser.ts continua rodando
// no Node puro (scripts/parser-eventos.test.mjs) sem carregar lucide-react.
// O ganho e o `tsc --noEmit` quebrar se alguem escrever aqui um nome de evento
// que nao existe em EVENTOS_META.
import type { NomeEventoMetaPadrao } from './meta-events';

/**
 * Tres estados, sem ambiguidade:
 *   'mapeado'          — nome do catalogo COM evento padrao da Meta.
 *   'sem-equivalente'  — nome do catalogo que a Meta nao tem como representar
 *                        (abandono, estorno, chargeback, financeiro interno).
 *   'teste-plataforma' — ping/test do proprio xWinner. Entrega OK, nada a enviar.
 *   'desconhecido'     — nome novo, fora do catalogo. Nunca vira conversao sozinho.
 *   'sem-evento'       — o payload nem trouxe nome de evento.
 */
export type ClassificacaoEvento =
  | 'mapeado'
  | 'sem-equivalente'
  | 'teste-plataforma'
  | 'desconhecido'
  | 'sem-evento';

/** Por que este item nao vai para a Meta. 'regra' e decidido fora do parser. */
export type MotivoIgnorar = 'regra' | 'sem-equivalente-meta' | 'teste-plataforma' | 'sem-regra' | 'nao-lido';

interface ParseResult {
  fields: Record<string, string | boolean>;
  preenchidos: string[];
  /** SO e preenchido quando o nome esta na tabela e tem equivalente padrao. */
  eventName?: NomeEventoMetaPadrao;
  /** Palpite da heuristica para nome novo. Nunca e disparavel: e texto de tela. */
  eventoMetaSugerido?: NomeEventoMetaPadrao;
  /** Nome original do evento na plataforma (ex.: purchase_approved). */
  eventoOrigem?: string;
  /** true quando eventoOrigem esta na tabela MAPA_EVENTOS_ORIGEM. */
  eventoConhecido: boolean;
  /** true quando nada deve ser enviado a Meta por causa deste nome. */
  ignorar: boolean;
  classificacao: ClassificacaoEvento;
  motivoIgnorar?: MotivoIgnorar;
  /** true para o botao "Testar" da plataforma (ping) e afins. */
  testePlataforma: boolean;
}

/**
 * Tabela definitiva evento de origem -> evento Meta.
 * null = ignorar (nao existe evento padrao da Meta; enviar seria evento ficticio).
 * Fonte: catalogo de 24 eventos do backoffice xWinner (03/09/2026) + eventos do
 * gateway (Checkout Platform) vistos em /backoffice/webhooks.
 */
export const MAPA_EVENTOS_ORIGEM: Record<string, NomeEventoMetaPadrao | null> = {
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
  // --- testes da propria plataforma: entrega OK, NUNCA vao para a Meta ---
  // O botao "Testar" do backoffice do xWinner manda `ping` (entrega comprovada
  // em 12/09/2026). Estar aqui e o que separa "teste de conexao, tudo certo" de
  // "nome fora do catalogo", que assustava o operador sem motivo.
  ping: null,
  test: null,
  'webhook.test': null,
  'endpoint.test': null,
};

/** Nomes que sao teste da plataforma, nao evento de negocio. */
export const EVENTOS_TESTE_PLATAFORMA: ReadonlySet<string> = new Set([
  'ping',
  'test',
  'webhook.test',
  'endpoint.test',
]);

/**
 * Palavras que proibem qualquer palpite de conversao. Ampliada depois da
 * auditoria: sem 'renew'/'partial'/'pending', um `subscription_renewed_paid`
 * casava com 'paid' e virava Purchase de uma venda que nunca existiu.
 */
const PALAVRAS_NEGATIVAS = [
  'abandon', 'expired', 'expir', 'refund', 'estorn', 'chargeback', 'cancel', 'reversed',
  'withdraw', 'commission', 'affiliate', 'renew', 'renov', 'declin', 'denied', 'fail',
  'pending', 'dispute', 'partial', 'reembols', 'recus',
];

/** Palavras que indicam teste/simulacao mesmo em nome novo, fora da tabela. */
const PALAVRAS_TESTE = ['ping', 'test', 'teste', 'sandbox', 'simul', 'dry-run', 'dryrun'];

export interface ResultadoMapeamento {
  /** Evento padrao da Meta. So sai da TABELA — a heuristica nunca preenche. */
  eventoMeta: NomeEventoMetaPadrao | null;
  /** true quando o nome esta em MAPA_EVENTOS_ORIGEM. */
  conhecido: boolean;
  classificacao: ClassificacaoEvento;
  testePlataforma: boolean;
  /** Palpite para nome novo. Vai para a tela, nunca para a Meta. */
  sugestao?: NomeEventoMetaPadrao;
}

/**
 * Classifica o nome do evento de origem.
 *
 * Regra de ouro: nome que nao esta na TABELA nao produz evento da Meta. A
 * heuristica so escreve `sugestao`, que a tela mostra como "parece um X — crie
 * a regra". Antes ela preenchia o proprio evento e um clique humano podia
 * mandar para a Meta uma compra que nunca aconteceu.
 */
export function mapearEventoOrigem(nome: string): ResultadoMapeamento {
  const n = String(nome || '').trim();
  if (!n) return { eventoMeta: null, conhecido: false, classificacao: 'sem-evento', testePlataforma: false };

  if (Object.prototype.hasOwnProperty.call(MAPA_EVENTOS_ORIGEM, n)) {
    const alvo = MAPA_EVENTOS_ORIGEM[n];
    const teste = EVENTOS_TESTE_PLATAFORMA.has(n);
    return {
      eventoMeta: alvo,
      conhecido: true,
      testePlataforma: teste,
      classificacao: teste ? 'teste-plataforma' : alvo ? 'mapeado' : 'sem-equivalente',
    };
  }

  const l = n.toLowerCase();
  const base = { eventoMeta: null, conhecido: false } as const;

  if (PALAVRAS_TESTE.some((p) => l.includes(p))) {
    return { ...base, classificacao: 'teste-plataforma', testePlataforma: true };
  }
  if (PALAVRAS_NEGATIVAS.some((p) => l.includes(p))) {
    return { ...base, classificacao: 'desconhecido', testePlataforma: false };
  }

  const desconhecido = { ...base, classificacao: 'desconhecido', testePlataforma: false } as const;
  if (l.includes('completed') || l.includes('approved') || l.includes('paid') || l === 'purchase') return { ...desconhecido, sugestao: 'Purchase' };
  if (l.includes('pre.checkout') || l.includes('pre_checkout') || l.includes('precheckout') || l.includes('lead')) return { ...desconhecido, sugestao: 'Lead' };
  if (l.includes('pix') || l.includes('payment_generated') || l.includes('card')) return { ...desconhecido, sugestao: 'AddPaymentInfo' };
  if (l.includes('checkout')) return { ...desconhecido, sugestao: 'InitiateCheckout' };
  if (l.includes('regist')) return { ...desconhecido, sugestao: 'CompleteRegistration' };
  return desconhecido;
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

/**
 * Acha o objeto que realmente carrega o pedido dentro do envelope.
 *
 * `buyer` entrou na lista depois da auditoria de 12/09/2026: as entregas reais
 * de checkout_abandoned chegam como { event, data: { buyer: { email } } }, sem
 * lead e sem attribution. Sem reconhecer esse formato a raiz virava o envelope,
 * o e-mail se perdia e o perfil de atribuicao ficava sem chave — a compra que
 * chegasse depois nao herdava o fbc e a venda ia para a Meta sem anuncio.
 */
function encontrarRaiz(j: any): any {
  if (j.payload) {
    if (j.payload.data && (j.payload.data.lead || j.payload.data.buyer || j.payload.data.attribution)) return j.payload.data;
    if (j.payload.lead || j.payload.buyer || j.payload.attribution) return j.payload;
  }
  if (
    j.data &&
    (j.data.lead ||
      j.data.buyer ||
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
  let eventName: NomeEventoMetaPadrao | undefined;

  // A classificacao vem da tabela MAPA_EVENTOS_ORIGEM (fonte unica); a heuristica
  // e so fallback para nomes que a plataforma criar depois. Sem a tabela,
  // "checkout_abandoned" viraria InitiateCheckout — evento que nunca aconteceu.
  // "pre.checkout.session.opened" contem "checkout", mas a propria plataforma o
  // chama de "Pre-checkout iniciado (lead)": e a CAPTURA DO CONTATO, nao o checkout.
  const evName = (j.event || raiz.event || raiz.eventName || j.eventName || '') as string;
  const mapa = mapearEventoOrigem(evName);
  const eventoOrigem = evName || undefined;
  const eventoConhecido = mapa.conhecido;
  const classificacao = mapa.classificacao;
  const testePlataforma = mapa.testePlataforma;
  const eventoMetaSugerido = mapa.sugestao;
  // 'desconhecido' tambem entra como ignorar: nome novo nao tem caminho
  // automatico para a Meta, so ganha um depois que o operador criar a regra.
  const ignorar = Boolean(evName) && mapa.eventoMeta === null;
  const motivoIgnorar: MotivoIgnorar | undefined =
    classificacao === 'teste-plataforma'
      ? 'teste-plataforma'
      : classificacao === 'sem-equivalente'
        ? 'sem-equivalente-meta'
        : classificacao === 'desconhecido'
          ? 'sem-regra'
          : undefined;

  if (mapa.eventoMeta) {
    eventName = mapa.eventoMeta;
    preenchidos.push(`Evento: ${eventName}`);
  } else if (testePlataforma) {
    preenchidos.push(`Evento ${evName}: teste da plataforma — entrega OK, nada a enviar`);
  } else if (classificacao === 'sem-equivalente') {
    preenchidos.push(`Evento ${evName}: ignorar (a Meta não tem evento padrão equivalente)`);
  } else if (evName) {
    preenchidos.push(
      `Evento ${evName}: nome novo, sem regra${eventoMetaSugerido ? ` — parece ${eventoMetaSugerido}` : ''}`
    );
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

  // Queda para `buyer`: parte das entregas (checkout_abandoned real, 12/09/2026)
  // nao manda `lead` nenhum e poe o contato so em data.buyer. Ler so o
  // external_id daqui jogava fora o e-mail — e sem e-mail o item nao tem chave
  // de perfil, entao o fbc daquela visita nunca alcanca a compra que vem depois.
  const buyer = (raiz.buyer || {}) as any;
  if (!fields.email && buyer.email) {
    fields.email = String(buyer.email);
    preenchidos.push('e-mail (buyer)');
  }
  if (!fields.phone && buyer.phone) {
    const ddi = String(buyer.phone_country_code || '').replace(/\D+/g, '');
    const digitos = String(buyer.phone).replace(/\D+/g, '');
    fields.phone = ddi && !digitos.startsWith(ddi) ? ddi + digitos : digitos;
    preenchidos.push('telefone (buyer)');
  }
  if (!fields.firstName) {
    const nomeBuyer = String(
      buyer.name || `${buyer.first_name || ''} ${buyer.last_name || ''}`
    ).trim();
    if (nomeBuyer) {
      const partes = nomeBuyer.split(/\s+/);
      fields.firstName = partes[0];
      if (partes.length > 1) fields.lastName = partes.slice(1).join(' ');
      preenchidos.push('nome (buyer)');
    }
  }
  if (!fields.externalId && buyer.external_id) {
    fields.externalId = String(buyer.external_id);
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

  // O fbclid cru vale sozinho: o fbc guardado no perfil envelhece junto com o
  // event_time, e so com o fbclid da para remontar `fb.1.<ms>.<fbclid>` na hora
  // do disparo. Sem ele um replay antigo perde a atribuicao do anuncio.
  if (fbclid) { fields.fbclid = fbclid; preenchidos.push('fbclid'); }

  if (cookies.fbp) { fields.fbp = cookies.fbp; preenchidos.push('fbp'); }

  // Click ids das outras redes e o referrer NAO vao para a Meta. Ficam no perfil
  // de atribuicao e no log porque sao a unica prova de qual canal trouxe a venda
  // quando o operador vai conferir o gasto de Google/TikTok contra o faturamento.
  // Nas entregas reais esses cookies vem como null, entao `||` ja os descarta.
  const gclid = (cookies.gclid || extrairParam(urlBruta, 'gclid') || '') as string;
  if (gclid) { fields.gclid = gclid; preenchidos.push('gclid'); }
  const ttclid = (cookies.ttclid || extrairParam(urlBruta, 'ttclid') || '') as string;
  if (ttclid) { fields.ttclid = ttclid; preenchidos.push('ttclid'); }
  const msclkid = (cookies.msclkid || extrairParam(urlBruta, 'msclkid') || '') as string;
  if (msclkid) { fields.msclkid = msclkid; preenchidos.push('msclkid'); }
  const referrer = (attr.referrer || attr.referer || '') as string;
  if (referrer) { fields.referrer = referrer; preenchidos.push('referrer'); }
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

  // Identificador de visita de primeira parte (cv_visit).
  //
  // Na pagina de vendas o visitante e ANONIMO: o e-mail so nasce depois, no
  // backoffice. Este id e a unica chave que casa o hit da tag com a venda que
  // chega pelo webhook. Nao ler significa a tag coletar fbc/fbp de uma visita
  // que nunca encontra o pedido — a compra sai para a Meta sem anuncio.
  //
  // A tag tambem propaga ?cv_visit=<id> nos links de checkout, entao a URL de
  // origem e a segunda fonte quando o gateway nao repassa o bloco `tracking`.
  const tracking = (raiz.tracking || j.tracking || {}) as any;
  const visitId = String(
    tracking.cv_visit ||
      tracking.visit_id ||
      tracking.visitId ||
      extrairParam(sourceUrl, 'cv_visit') ||
      ''
  ).trim();
  if (visitId) {
    fields.visitId = visitId;
    preenchidos.push('cv_visit (visita)');
  }

  return {
    fields,
    preenchidos,
    eventName,
    eventoMetaSugerido,
    eventoOrigem,
    eventoConhecido,
    ignorar,
    classificacao,
    motivoIgnorar,
    testePlataforma,
  };
}
