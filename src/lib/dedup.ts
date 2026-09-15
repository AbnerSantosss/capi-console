import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { dataLocalIso } from './inbox-resumo';

/**
 * Indice de eventos ja aceitos pela Meta.
 *
 * O mesmo purchase_approved pode chegar duas vezes (retry da plataforma,
 * endpoint duplicado via n8n). A Meta deduplica por event_id entre Pixel e
 * CAPI, mas NAO entre dois envios de CAPI — ali a compra contaria em dobro e
 * o ROAS da campanha ficaria mentiroso.
 *
 * Fonte da verdade: logs/disparos.jsonl (so linhas que a Meta aceitou).
 *
 * ────────────────────────────────────────────────────────────────────────
 * TRES CHAVES, e nao mais uma so
 * ────────────────────────────────────────────────────────────────────────
 *
 * Ate aqui a unica chave era `pixel|evento|event_id`, e ela deixava dois
 * furos por onde a mesma venda passava duas vezes:
 *
 *   1. Evento SEM `event_id` nao era deduplicado de jeito nenhum — a funcao
 *      devolvia `false` na primeira linha. Payload de plataforma que nao
 *      manda id proprio (e ha varios) nunca teve trava nenhuma.
 *   2. O MESMO pedido chegando por dois caminhos (webhook direto + n8n, ou
 *      um reenvio depois de a plataforma trocar o id) carrega `event_id`
 *      diferente, e os dois passavam. Duas conversoes, uma venda.
 *
 * Agora sao tres chaves, todas no mesmo indice, e QUALQUER uma delas basta
 * para recusar o segundo envio:
 *
 *   evt — `event_id`.  A de sempre, e a mais forte quando existe.
 *   ord — `order_id`.  A identidade de NEGOCIO: o mesmo pedido, no mesmo
 *                      pixel, com o mesmo evento, e a mesma conversao — nao
 *                      importa por qual caminho ele chegou. Sai de graca do
 *                      log que ja esta gravado, entao vale para o historico
 *                      inteiro sem migracao nenhuma.
 *   idt — impressao digital `email|valor|dia`, so quando NAO ha `event_id`
 *         NEM `order_id`. E o caso que antes passava direto.
 *
 * 🔴 A chave `idt` vive SO EM MEMORIA, e isso e deliberado: `disparos.jsonl`
 * nunca gravou e-mail (e nao vai passar a gravar — e PII de comprador), entao
 * ela nao sobrevive a um restart. Ela cobre exatamente o cenario para o qual
 * foi feita, que e a rajada de reentrega da plataforma (segundos a minutos,
 * dentro do mesmo processo). Quem cobre reinicio e a chave `ord`.
 *
 * 🔴 O e-mail entra na chave ja em hash. O Set fica em memoria e ninguem o
 * imprime, mas um dump de heap ou um log de depuracao futuro nao tem por que
 * encontrar e-mail de comprador em texto claro aqui dentro.
 */
const ARQ = path.join(process.cwd(), 'logs', 'disparos.jsonl');
let indice: Set<string> | null = null;

type Tipo = 'evt' | 'ord' | 'idt';

const chave = (pixelId: string, eventName: string, tipo: Tipo, valor: string) =>
  `${pixelId}|${eventName}|${tipo}|${valor}`;

/**
 * Identidade de um envio, do jeito que o chamador a conhece.
 *
 * Todos os campos sao opcionais porque cada caminho de disparo sabe uma parte
 * diferente: o formulario manual pode nao ter pedido, o lote pode nao ter
 * e-mail. A funcao usa o que houver e nunca exige nada.
 */
export interface IdentidadeDoEvento {
  eventId?: string;
  orderId?: string;
  /** E-mail do comprador, em texto claro. Vira hash antes de virar chave. */
  email?: string;
  valor?: number;
  /** `event_time` em segundos (unix). Sem ele, o dia sai do relogio de agora. */
  eventTime?: number;
}

function normalizar(id: string | IdentidadeDoEvento | undefined): IdentidadeDoEvento {
  if (id === undefined) return {};
  return typeof id === 'string' ? { eventId: id } : id;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * `email|valor|dia` em hash. `null` quando falta o que identifica a pessoa —
 * sem e-mail a impressao digital viraria "qualquer compra de R$ 97 hoje", que
 * recusaria venda de gente diferente. Na duvida, NAO deduplica: deixar passar
 * um duplicado custa um numero errado; barrar uma venda real custa a venda.
 */
function impressaoDigital(id: IdentidadeDoEvento): string | null {
  const email = texto(id.email).toLowerCase();
  if (!email) return null;
  if (typeof id.valor !== 'number' || !Number.isFinite(id.valor)) return null;
  const ms = typeof id.eventTime === 'number' && Number.isFinite(id.eventTime)
    ? id.eventTime * 1000
    : Date.now();
  const dia = dataLocalIso(ms);
  const bruto = `${email}|${id.valor.toFixed(2)}|${dia}`;
  return crypto.createHash('sha256').update(bruto).digest('hex').slice(0, 32);
}

/**
 * As chaves que ESTE envio produz. Vazio = nao da para deduplicar.
 *
 * 🔴 `comFallbackSemPixel` so vale para LER. A chave com pixel vazio existe
 * porque `disparos.jsonl` tem linhas gravadas antes de o log guardar o pixel —
 * ela e um curinga de leitura. Se `marcarEnviado` a gravasse, um envio feito no
 * pixel A passaria a recusar o MESMO evento no pixel B, que e uma conversao
 * legitima de outra empresa sumindo em silencio.
 */
function chavesDe(
  pixelId: string,
  eventName: string,
  id: IdentidadeDoEvento,
  comFallbackSemPixel: boolean
): string[] {
  const chaves: string[] = [];
  const eventId = texto(id.eventId);
  const orderId = texto(id.orderId);

  if (eventId) {
    chaves.push(chave(pixelId, eventName, 'evt', eventId));
    if (comFallbackSemPixel) chaves.push(chave('', eventName, 'evt', eventId));
  }
  if (orderId) {
    chaves.push(chave(pixelId, eventName, 'ord', orderId));
    if (comFallbackSemPixel) chaves.push(chave('', eventName, 'ord', orderId));
  }
  // So entra quando as duas identidades fortes faltam: com pedido em maos, a
  // impressao digital nao acrescenta nada e so ampliaria a chance de colisao.
  if (!eventId && !orderId) {
    const digital = impressaoDigital(id);
    if (digital) chaves.push(chave(pixelId, eventName, 'idt', digital));
  }
  return chaves;
}

async function carregar(): Promise<Set<string>> {
  if (indice) return indice;
  const s = new Set<string>();
  try {
    const txt = await fs.readFile(ARQ, 'utf8');
    for (const l of txt.split('\n')) {
      if (!l) continue;
      try {
        const r = JSON.parse(l) as {
          pixelId?: string;
          eventName?: string;
          eventId?: string;
          orderId?: string;
          httpStatus?: number;
          eventsReceived?: number;
        };
        // "Aceito pela Meta" continua sendo a unica coisa que entra no indice:
        // um 400 nao pode barrar a segunda tentativa do mesmo evento.
        if (!r.eventName || r.httpStatus !== 200 || (r.eventsReceived ?? 0) <= 0) continue;
        const pixel = r.pixelId ?? '';
        if (r.eventId) s.add(chave(pixel, r.eventName, 'evt', r.eventId));
        // Linha antiga tambem tem `orderId`: o historico inteiro ganha a chave
        // de pedido na primeira leitura, sem reescrever byte nenhum do arquivo.
        if (r.orderId) s.add(chave(pixel, r.eventName, 'ord', r.orderId));
      } catch {
        /* linha corrompida */
      }
    }
  } catch {
    /* sem log ainda */
  }
  indice = s;
  return s;
}

/**
 * Este evento ja foi aceito pela Meta neste pixel?
 *
 * Aceita uma string (o `event_id`, como sempre foi) ou a identidade inteira.
 * A forma com string continua valendo para quem so tem o id em maos.
 */
export async function jaEnviado(
  pixelId: string,
  eventName: string,
  id?: string | IdentidadeDoEvento
): Promise<boolean> {
  const chaves = chavesDe(pixelId, eventName, normalizar(id), true);
  if (chaves.length === 0) return false;
  const i = await carregar();
  return chaves.some((k) => i.has(k));
}

/** Marca TODAS as chaves deste envio: o proximo caminho ja encontra qualquer uma. */
export async function marcarEnviado(
  pixelId: string,
  eventName: string,
  id?: string | IdentidadeDoEvento
) {
  const chaves = chavesDe(pixelId, eventName, normalizar(id), false);
  if (chaves.length === 0) return;
  const i = await carregar();
  for (const k of chaves) i.add(k);
}

/** So para teste: descarta o cache em memoria e relei o jsonl. */
export function _limparCache() {
  indice = null;
}
