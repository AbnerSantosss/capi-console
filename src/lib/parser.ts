/* eslint-disable @typescript-eslint/no-explicit-any */

// Import de TIPO apenas: some na compilacao, entao parser.ts continua rodando
// no Node puro (scripts/parser-eventos.test.mjs) sem carregar o pacote de
// icones que meta-events.ts importa junto com o catalogo.
// O ganho e o `tsc --noEmit` quebrar se alguem escrever aqui um nome de evento
// que nao existe em EVENTOS_META.
import type { NomeEventoMetaPadrao } from './meta-events';
import { jaEhSha256 } from './hash-detect';
import { normalizarMoeda } from './moeda';
import { lerGenerico, nomeDoEventoGenerico, type LeituraGenerica } from './leitura-generica';

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
export type MotivoIgnorar =
  | 'regra'
  | 'sem-equivalente-meta'
  | 'teste-plataforma'
  | 'sem-regra'
  | 'nao-lido'
  /** Evento de pagamento cujo `status` diz que o dinheiro ainda nao entrou. */
  | 'pagamento-nao-confirmado';

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
  /**
   * true quando o evento e de pagamento mas o `status` do corpo diz que ele
   * NAO foi pago (pendente, cancelado, expirado...). Vale mais que a regra:
   * regra nenhuma transforma pagamento pendente em compra.
   */
  pagamentoNaoConfirmado: boolean;
  /** true quando veio moeda e o console nao soube ler (`$`, `XYZ`). Nunca vira BRL por palpite. */
  moedaNaoReconhecida: boolean;
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
  // --- Globaltech (payload plano, 06/10/2026). O nome vem em `event` ou
  // `evento`, em ingles ou traduzido, conforme a versao do painel deles. ---
  DEPOSIT_PAYMENT: 'Purchase',
  DEPOSIT_CREATED: 'InitiateCheckout',
  USER_CREATED: 'CompleteRegistration',
  'PAGAMENTO_DEPÓSITO': 'Purchase',
  PAGAMENTO_DEPOSITO: 'Purchase',
  'DEPÓSITO_CRIADO': 'InitiateCheckout',
  DEPOSITO_CRIADO: 'InitiateCheckout',
  'USUÁRIO_CRIADO': 'CompleteRegistration',
  USUARIO_CRIADO: 'CompleteRegistration',
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
  /**
   * Evento deduzido do nome, para nome novo. Desde 06/10/2026 (decisao do
   * dono) e o evento com que o item entra na FILA — ver `eventoDeduzidoDoNome`.
   */
  sugestao?: NomeEventoMetaPadrao;
}

/**
 * Classifica o nome do evento de origem.
 *
 * Nome que nao esta na TABELA nao preenche `eventoMeta`: a heuristica so
 * escreve `sugestao`. Quem decide o que fazer com ela e `eventoDeduzidoDoNome`
 * (abaixo), usado pelo recebimento e pelo disparo manual.
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

/**
 * O evento da Meta de um nome NOVO, deduzido do proprio nome.
 *
 * Decisao do dono em 06/10/2026 (console white-label): "receba, organize no
 * evento padrao da Meta e repasse; se o automatico estiver desligado, deixe
 * enfileirado esperando a aprovacao". Antes o nome novo entrava como
 * `ignorado` e so saia depois de alguem criar a regra.
 *
 * O que NAO mudou: as duas travas do automatico. Sem regra o item entra em
 * FILA; so sai sozinho com regra em `auto` (a exata ou a curinga '*') E o
 * interruptor do Pixel ligado. Nome sem deducao possivel, teste da plataforma
 * e pagamento nao confirmado continuam sem evento.
 *
 * UM lugar so, para o recebimento e o disparo manual nao divergirem.
 */
export function eventoDeduzidoDoNome(
  r: Pick<ParseResult, 'eventName' | 'classificacao' | 'eventoMetaSugerido' | 'pagamentoNaoConfirmado'>
): NomeEventoMetaPadrao | undefined {
  if (r.eventName || r.pagamentoNaoConfirmado) return undefined;
  return r.classificacao === 'desconhecido' ? r.eventoMetaSugerido : undefined;
}

/**
 * Regra 1 e 4 do CLAUDE.md + payload de teste do xWinner: nunca vai para a Meta.
 *
 * 🔴 A regua do valor (ate R$ 0,10 = cupom de teste) e a regra 4 do CLAUDE.md
 * e fica como esta. O que descartou deposito real em 06/10/2026 (UX-03) nao
 * foi ela: foi o valor chegar dividido por 100 (R$ 10 lido como R$ 0,10,
 * UX-02), corrigido em `parseWebhook`. Item gravado com o valor errado e
 * reavaliado na leitura (`inbox.ts`).
 */
export function ehTesteInterno(fields: Record<string, string | boolean>, eventId?: string): boolean {
  const email = String(fields.email || '').toLowerCase();
  const nome = `${fields.firstName || ''} ${fields.lastName || ''}`.toLowerCase().trim();
  if (eventId && /^evt_preview/i.test(eventId)) return true;
  if (/@(example\.com|exemplo\.com\.br|example\.org|test\.com)$/.test(email)) return true;
  if (email.startsWith('teste@') || email.startsWith('testador@') || email.includes('jairo')) return true;
  if (nome.includes('jairo') || nome === 'lead convidado' || nome.includes('simulação teste')) return true;
  const valor = Number(fields.value || 0);
  if (valor > 0 && valor <= 0.1) return true;
  return false;
}

/**
 * Payload PLANO (Globaltech): tudo na raiz, com prefixo no nome do campo
 * (`user_email`, `deposit_id`) e a atribuicao em `tracker`. Nao tem `lead`,
 * `buyer` nem `attribution`.
 *
 * Reconhecer o formato importa por causa da UNIDADE do valor: aqui `amount`
 * vem em unidade de moeda (10 = R$ 10,00). No xWinner vem em centavos.
 */
export function ehPayloadPlano(raiz: any): boolean {
  if (!raiz || typeof raiz !== 'object') return false;
  if (raiz.lead || raiz.buyer || raiz.attribution) return false;
  return (
    raiz.deposit_id !== undefined ||
    raiz.user_email !== undefined ||
    (raiz.tracker !== null && typeof raiz.tracker === 'object')
  );
}

/** `status` que diz, sem duvida, que o dinheiro NAO entrou. Status desconhecido nao barra nada. */
const STATUS_NAO_PAGO = new Set([
  'pending', 'pendent', 'pendente', 'waiting', 'aguardando', 'created', 'criado', 'open', 'aberto',
  'processing', 'processando', 'canceled', 'cancelled', 'cancelado', 'failed', 'falhou',
  'error', 'erro', 'expired', 'expirado', 'refunded', 'estornado', 'reembolsado',
  'rejected', 'recusado', 'denied', 'negado', 'chargeback', 'unpaid', 'nao_pago',
]);

/** Telefone como o parser sempre gravou: so digitos, ou o hash intacto. */
function limparTelefone(bruto: unknown, ddiBruto?: unknown): string {
  const telefone = String(bruto);
  if (jaEhSha256(telefone)) return telefone.trim().toLowerCase();
  const ddi = String(ddiBruto || '').replace(/\D+/g, '');
  const digitos = telefone.replace(/\D+/g, '');
  return ddi && !digitos.startsWith(ddi) ? ddi + digitos : digitos;
}

/** Data como veio: ISO, ou numero em segundos / milissegundos. */
function lerData(bruto: unknown): Date | null {
  if (bruto === undefined || bruto === null || bruto === '') return null;
  let d: Date;
  if (typeof bruto === 'number' || (typeof bruto === 'string' && /^\d{9,13}$/.test(bruto.trim()))) {
    const n = Number(bruto);
    d = new Date(n < 1e11 ? n * 1000 : n);
  } else {
    d = new Date(String(bruto));
  }
  return isNaN(d.getTime()) ? null : d;
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
  let url = baseUrl;
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
  // `evento` e o nome do campo na versao traduzida do painel da Globaltech.
  // White-label (06/10/2026): cada empresa recebe de varias plataformas, e o
  // nome do evento nem sempre vem em `event`. O ultimo recurso procura nos
  // campos que as outras usam (`type`, `event_type`, `webhook_event_type`).
  const evBruto =
    j.event || raiz.event || raiz.eventName || j.eventName || j.evento || raiz.evento || nomeDoEventoGenerico(j) || '';
  const evName = (typeof evBruto === 'string' ? evBruto.trim() : '') as string;
  const plano = ehPayloadPlano(raiz);
  // Formato nativo do xWinner (`lead` ou `attribution`): leitura fechada e
  // conferida com entrega real. Nele a rede generica NAO entra — `amount`
  // aninhado ali e centavo, e um palpite trocaria o que ja esta certo.
  const nativoXwinner = Boolean(raiz.lead || raiz.attribution);
  const generico: LeituraGenerica = nativoXwinner ? {} : lerGenerico(j);
  const tracker = (plano && raiz.tracker && typeof raiz.tracker === 'object' ? raiz.tracker : {}) as any;
  const mapaDoNome = mapearEventoOrigem(evName);

  // Pagamento que ainda nao foi pago nao e compra. So barra com status que diz
  // isso com todas as letras: status ausente ou desconhecido segue como veio,
  // porque descartar venda real por nao reconhecer uma palavra e o erro caro.
  const statusBruto = String(raiz.status ?? '').trim();
  // Vale tambem para a compra DEDUZIDA do nome (`sugestao`): ela entra na fila
  // como Purchase, entao o status que diz "nao pago" tem de barrar igual.
  const pagamentoNaoConfirmado =
    (mapaDoNome.eventoMeta ?? mapaDoNome.sugestao) === 'Purchase' &&
    STATUS_NAO_PAGO.has(statusBruto.toLowerCase());
  const mapa: ResultadoMapeamento = pagamentoNaoConfirmado
    ? { ...mapaDoNome, eventoMeta: null, sugestao: undefined, classificacao: 'sem-equivalente' }
    : mapaDoNome;
  const eventoOrigem = evName || undefined;
  const eventoConhecido = mapa.conhecido;
  const classificacao = mapa.classificacao;
  const testePlataforma = mapa.testePlataforma;
  const eventoMetaSugerido = mapa.sugestao;
  // 'desconhecido' sai daqui como ignorar; quem recebe (webhook-handler) troca
  // por FILA quando `eventoDeduzidoDoNome` consegue deduzir o evento.
  const ignorar = Boolean(evName) && mapa.eventoMeta === null;
  const motivoIgnorar: MotivoIgnorar | undefined =
    pagamentoNaoConfirmado
      ? 'pagamento-nao-confirmado'
      : classificacao === 'teste-plataforma'
      ? 'teste-plataforma'
      : classificacao === 'sem-equivalente'
        ? 'sem-equivalente-meta'
        : classificacao === 'desconhecido'
          ? 'sem-regra'
          : undefined;

  if (mapa.eventoMeta) {
    eventName = mapa.eventoMeta;
    preenchidos.push(`Evento: ${eventName}`);
  } else if (pagamentoNaoConfirmado) {
    preenchidos.push(`Evento ${evName} com status "${statusBruto}": pagamento ainda não confirmado, nada a enviar`);
  } else if (testePlataforma) {
    preenchidos.push(`Evento ${evName}: teste da plataforma — entrega OK, nada a enviar`);
  } else if (classificacao === 'sem-equivalente') {
    preenchidos.push(`Evento ${evName}: ignorar (a Meta não tem evento padrão equivalente)`);
  } else if (evName) {
    preenchidos.push(
      eventoMetaSugerido
        ? `Evento ${evName}: nome novo, lido como ${eventoMetaSugerido} pelo nome (confira antes de aprovar)`
        : `Evento ${evName}: nome novo, sem regra e sem como deduzir o evento da Meta`
    );
  }

  const lead = (raiz.lead || {}) as any;
  if (lead.email) { fields.email = lead.email; preenchidos.push('e-mail'); }
  if (lead.phone) {
    const telefoneBruto = String(lead.phone);
    if (jaEhSha256(telefoneBruto)) {
      // Ja veio hasheado: o replace(/\D+/g,'') abaixo tiraria as letras do hex
      // e o DDI "55" entraria por cima de um numero que nao existe mais.
      fields.phone = telefoneBruto.trim().toLowerCase();
    } else {
      // Formato A manda o DDI separado (phone_country_code). Sem juntar, o telefone
      // sai sem o 55 e a Meta nao acha o comprador.
      const ddi = String(lead.phone_country_code || '').replace(/\D+/g, '');
      const digitos = telefoneBruto.replace(/\D+/g, '');
      fields.phone = ddi && !digitos.startsWith(ddi) ? ddi + digitos : digitos;
    }
    preenchidos.push('telefone');
  }
  if (lead.name) {
    const nomeBruto = String(lead.name).trim();
    if (jaEhSha256(nomeBruto)) {
      // Hash nao tem espaco: nao ha o que quebrar. Copia como veio.
      fields.firstName = nomeBruto.toLowerCase();
    } else {
      const partes = nomeBruto.split(/\s+/);
      fields.firstName = partes[0];
      if (partes.length > 1) fields.lastName = partes.slice(1).join(' ');
    }
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
    const telefoneBrutoBuyer = String(buyer.phone);
    if (jaEhSha256(telefoneBrutoBuyer)) {
      fields.phone = telefoneBrutoBuyer.trim().toLowerCase();
    } else {
      const ddi = String(buyer.phone_country_code || '').replace(/\D+/g, '');
      const digitos = telefoneBrutoBuyer.replace(/\D+/g, '');
      fields.phone = ddi && !digitos.startsWith(ddi) ? ddi + digitos : digitos;
    }
    preenchidos.push('telefone (buyer)');
  }
  if (!fields.firstName) {
    const nomeBuyer = String(
      buyer.name || `${buyer.first_name || ''} ${buyer.last_name || ''}`
    ).trim();
    if (nomeBuyer) {
      if (jaEhSha256(nomeBuyer)) {
        fields.firstName = nomeBuyer.toLowerCase();
      } else {
        const partes = nomeBuyer.split(/\s+/);
        fields.firstName = partes[0];
        if (partes.length > 1) fields.lastName = partes.slice(1).join(' ');
      }
      preenchidos.push('nome (buyer)');
    }
  }
  if (!fields.externalId && buyer.external_id) {
    fields.externalId = String(buyer.external_id);
    preenchidos.push('external_id (buyer)');
  }

  // Payload plano (Globaltech): o contato vem na raiz, com prefixo `user_`.
  // Sem ler daqui o evento ia para a Meta sem e-mail, sem telefone e sem
  // cookie nenhum — e a compra, que chega sem navegador, nao herdava nada do
  // DEPOSIT_CREATED porque o perfil de atribuicao ficava sem chave.
  if (plano) {
    const emailPlano = raiz.user_email || raiz.email;
    if (!fields.email && emailPlano) {
      fields.email = String(emailPlano).trim();
      preenchidos.push('e-mail (user_email)');
    }
    const telefonePlano = raiz.user_phone || raiz.phone;
    if (!fields.phone && telefonePlano) {
      const tel = limparTelefone(telefonePlano, raiz.user_phone_country_code || raiz.phone_country_code);
      if (tel) {
        fields.phone = tel;
        preenchidos.push('telefone (user_phone)');
      }
    }
    const nomePlano = String(raiz.user_name || raiz.name || '').trim();
    if (!fields.firstName && nomePlano) {
      if (jaEhSha256(nomePlano)) {
        fields.firstName = nomePlano.toLowerCase();
      } else {
        const partes = nomePlano.split(/\s+/);
        fields.firstName = partes[0];
        if (partes.length > 1) fields.lastName = partes.slice(1).join(' ');
      }
      preenchidos.push('nome (user_name)');
    }
    // O id do usuario na plataforma, e nao o documento: e estavel, repete em
    // todos os eventos da mesma pessoa e nao e dado sensivel.
    if (!fields.externalId && raiz.user_id !== undefined && raiz.user_id !== null && raiz.user_id !== '') {
      fields.externalId = String(raiz.user_id);
      preenchidos.push('external_id (user_id)');
    }
  }

  // Qualquer outra plataforma: o que os formatos conhecidos nao acharam e
  // procurado pelo NOME do campo, em qualquer nivel (`customer.email`,
  // `Customer.mobile`, `buyer_email`). So preenche o que esta vazio.
  if (!fields.email && generico.email) {
    fields.email = generico.email;
    preenchidos.push('e-mail (leitura genérica)');
  }
  if (!fields.phone && generico.phone) {
    const tel = limparTelefone(generico.phone);
    if (tel) {
      fields.phone = tel;
      preenchidos.push('telefone (leitura genérica)');
    }
  }
  if (!fields.firstName) {
    const nomeGenerico = String(generico.nome || `${generico.firstName || ''} ${generico.lastName || ''}`).trim();
    if (nomeGenerico) {
      if (jaEhSha256(nomeGenerico)) {
        fields.firstName = nomeGenerico.toLowerCase();
      } else {
        const partes = nomeGenerico.split(/\s+/);
        fields.firstName = partes[0];
        if (partes.length > 1) fields.lastName = partes.slice(1).join(' ');
      }
      preenchidos.push('nome (leitura genérica)');
    }
  }
  if (!fields.externalId && generico.externalId) {
    fields.externalId = generico.externalId;
    preenchidos.push('external_id (leitura genérica)');
  }

  // 🔴 A UNIDADE do valor e da origem, nao do console. `amountMinor` e os
  // formatos do xWinner/gateway vem em CENTAVOS; o payload plano da Globaltech
  // vem em unidade de moeda (10 = R$ 10,00). Dividir tudo por 100 mandava a
  // Meta um centesimo do faturamento real (UX-02). Valor com casa decimal
  // tambem nunca e centavo.
  if (raiz.amountMinor !== undefined && raiz.amountMinor !== null) {
    fields.value = (Number(raiz.amountMinor) / 100).toFixed(2);
    preenchidos.push('valor');
  } else if (raiz.amount !== undefined && raiz.amount !== null && raiz.amount !== '') {
    const recebido = Number(raiz.amount);
    if (!Number.isFinite(recebido)) {
      preenchidos.push(`valor "${String(raiz.amount).slice(0, 20)}" não é número — ficou sem valor`);
    } else if (plano || !Number.isInteger(recebido)) {
      fields.value = recebido.toFixed(2);
      preenchidos.push(`valor (recebido ${raiz.amount}, já em unidade de moeda)`);
    } else {
      fields.value = (recebido / 100).toFixed(2);
      preenchidos.push('valor');
    }
  } else if (raiz.pricing?.originalAmountMinor !== undefined) {
    fields.value = (Number(raiz.pricing.originalAmountMinor) / 100).toFixed(2);
    preenchidos.push('valor (pricing)');
  } else if (generico.value) {
    fields.value = generico.value;
    preenchidos.push(
      generico.valorEraCentavos
        ? `valor (campo "${generico.valorCampo}", em centavos)`
        : `valor (campo "${generico.valorCampo}", lido como unidade de moeda — confira)`
    );
  } else if (generico.valorAmbiguo) {
    preenchidos.push(
      `valor não lido: o campo "${generico.valorAmbiguo}" veio inteiro e não diz se é centavo — confira antes de enviar`
    );
  }

  // Moeda sempre em ISO 4217 (UX-01). `R$` vira BRL; o que o console nao
  // reconhece fica COMO VEIO, marcado — o item vai para a fila, sem automatico,
  // e a tela mostra o texto original. Presumir BRL mandaria valor na moeda errada.
  const moeda = normalizarMoeda(raiz.currency ?? raiz.moeda ?? generico.currency);
  let moedaNaoReconhecida = false;
  if (moeda.codigo) {
    fields.currency = moeda.codigo;
    preenchidos.push(moeda.convertida ? `moeda (recebido "${moeda.original}" → ${moeda.codigo})` : 'moeda');
  } else {
    fields.currency = moeda.original;
    moedaNaoReconhecida = true;
    preenchidos.push(`moeda "${moeda.original}" não reconhecida — confira antes de enviar`);
  }

  const orderId = String(
    raiz.order_id || raiz.orderId || raiz.sessionId || (plano ? raiz.deposit_id ?? '' : '') || generico.orderId || ''
  );
  if (orderId) {
    fields.orderId = orderId;
    preenchidos.push('pedido');
  }

  // event_id tem que ser o MESMO id que o Pixel do navegador manda em
  // fbq('track','Purchase',{...},{eventID}). E o que faz a Meta deduplicar
  // browser + CAPI; divergindo, a mesma compra e contada duas vezes.
  // Cai para order_<id> so quando o webhook nao traz id canonico.
  const idCanonico = (j.eventId || raiz.eventId || j.event_id || raiz.event_id || tracker.event_id || tracker.eventId || '') as string;
  if (idCanonico) {
    fields.eventId = String(idCanonico);
    preenchidos.push('event_id do webhook (dedup)');
  } else if (plano && evName && (orderId || fields.externalId)) {
    // No payload plano o MESMO deposit_id aparece em dois eventos (criado e
    // pago). O nome do evento entra no id para cada um ter o seu, e o id e
    // previsivel: a pagina do cliente consegue mandar o mesmo no Pixel do
    // navegador e a Meta junta os dois em vez de contar em dobro.
    fields.eventId = `${orderId || 'user_' + String(fields.externalId)}_${evName}`;
    preenchidos.push('event_id derivado do depósito + evento');
  } else if (orderId) {
    fields.eventId = 'order_' + orderId;
    preenchidos.push('event_id derivado do pedido');
  }

  const product = raiz.product as any;
  if (product?.name) { fields.contentName = product.name; preenchidos.push('produto'); }

  const quando = (raiz.occurredAt || raiz.occurred_at || raiz.approved_at || raiz.paid_at || raiz.generated_at || raiz.opened_at || j.created_at) as string;
  if (quando) {
    const d = lerData(quando);
    if (d) {
      const p = (n: number) => String(n).padStart(2, '0');
      fields.eventTime = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      preenchidos.push('data/hora');
    }
  }

  // No payload plano a atribuicao vem em `tracker`, tudo no mesmo nivel
  // (`tracker.fbp`, `tracker.utm_source`). Montamos aqui o MESMO formato que o
  // resto da funcao ja le, para existir um caminho so daqui para baixo.
  const attr = (raiz.attribution || {
    eventSourceUrl: tracker.event_source_url || tracker.page_url || tracker.url || tracker.landing_page,
    referrer: tracker.referrer || tracker.referer,
    user_agent: tracker.user_agent || tracker.userAgent,
    ip: tracker.ip || tracker.ip_address || tracker.client_ip || tracker.client_ip_address,
  }) as any;
  const cookies = (attr.cookies || {
    fbc: tracker.fbc || tracker._fbc,
    fbp: tracker.fbp || tracker._fbp,
    fbclid: tracker.fbclid,
    gclid: tracker.gclid,
    ttclid: tracker.ttclid,
    msclkid: tracker.msclkid,
  }) as any;
  const utmsDoTracker: Record<string, string> = {};
  for (const k of ['source', 'medium', 'campaign', 'content', 'term'] as const) {
    const v = tracker['utm_' + k];
    if (typeof v === 'string' && v.trim()) utmsDoTracker[k] = v.trim();
  }
  const utms = (attr.utm || (Object.keys(utmsDoTracker).length ? utmsDoTracker : generico.utms) || {}) as Record<string, string>;

  // Site de onde o evento veio. Sem isto a URL-base caia no dominio do Codigo
  // Vencedor para QUALQUER empresa.
  const dominio = String((plano ? raiz.domain : '') || generico.dominio || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '');
  const urlBase = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dominio) ? `https://${dominio}/` : '';

  const urlBruta = (attr.eventSourceUrl || attr.event_source_url || attr.landing_page || generico.sourceUrl || '') as string;

  // fbc e o UNICO campo que liga a conversao a campanha / conjunto / anuncio no
  // Gerenciador. A Meta resolve pelo fbclid que vive dentro dele — utm_source,
  // utm_campaign, utm_content e ad_id na URL NAO atribuem nada.
  // Por isso: se o cookie _fbc nao vier, reconstroi no formato fb.1.<ms>.<fbclid>,
  // pegando o fbclid do cookie ou da propria eventSourceUrl.
  const fbclid = (cookies.fbclid || extrairParam(urlBruta, 'fbclid') || generico.fbclid || '') as string;
  const fbcLido = cookies.fbc || generico.fbc;
  if (fbcLido) {
    fields.fbc = fbcLido;
    preenchidos.push('fbc');
  } else if (fbclid) {
    const msClique = lerData(quando)?.getTime() || Date.now();
    fields.fbc = 'fb.1.' + msClique + '.' + fbclid;
    preenchidos.push('fbc reconstruido do fbclid');
  }

  // O fbclid cru vale sozinho: o fbc guardado no perfil envelhece junto com o
  // event_time, e so com o fbclid da para remontar `fb.1.<ms>.<fbclid>` na hora
  // do disparo. Sem ele um replay antigo perde a atribuicao do anuncio.
  if (fbclid) { fields.fbclid = fbclid; preenchidos.push('fbclid'); }

  const fbpLido = cookies.fbp || generico.fbp;
  if (fbpLido) { fields.fbp = fbpLido; preenchidos.push('fbp'); }

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
  if (!fields.userAgent && generico.userAgent) { fields.userAgent = generico.userAgent; preenchidos.push('user agent'); }

  const ipBruto = String(attr.ipAddress || attr.ip_address || attr.ip || generico.ip || '').replace(/^::ffff:/i, '').trim();
  if (ipBruto && !ehIpNaoRoteavel(ipBruto)) {
    fields.ip = ipBruto;
    preenchidos.push('IP do cliente');
  } else if (ipBruto) {
    preenchidos.push('IP ' + ipBruto + ' descartado (rede interna, use X-Forwarded-For)');
  }

  let sourceUrl = urlBruta;
  if (!sourceUrl && Object.keys(utms).length) {
    // O endereco do Codigo Vencedor so vale para o formato do xWinner, que e
    // a plataforma dele. Outra origem sem site no payload fica sem URL em vez
    // de sair para a Meta com o dominio de outra empresa.
    const base = urlBase || (nativoXwinner ? 'https://codigovencedor.com/' : '');
    if (base) sourceUrl = construirUrlComUtms(base, utms);
  }
  if (!sourceUrl && urlBase) sourceUrl = urlBase;
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
  const tracking = (raiz.tracking || j.tracking || tracker || {}) as any;
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
    pagamentoNaoConfirmado,
    moedaNaoReconhecida,
  };
}
