import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Indice de eventos ja aceitos pela Meta: pixelId|event_name|event_id.
 *
 * O mesmo purchase_approved pode chegar duas vezes (retry da plataforma,
 * endpoint duplicado via n8n). A Meta deduplica por event_id entre Pixel e
 * CAPI, mas NAO entre dois envios de CAPI — ali a compra contaria em dobro e
 * o ROAS da campanha ficaria mentiroso.
 *
 * Fonte da verdade: logs/disparos.jsonl (so linhas que a Meta aceitou).
 */
const ARQ = path.join(process.cwd(), 'logs', 'disparos.jsonl');
let indice: Set<string> | null = null;

const chave = (pixelId: string, eventName: string, eventId: string) => `${pixelId}|${eventName}|${eventId}`;

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
          httpStatus?: number;
          eventsReceived?: number;
        };
        if (r.eventId && r.eventName && r.httpStatus === 200 && (r.eventsReceived ?? 0) > 0) {
          s.add(chave(r.pixelId ?? '', r.eventName, r.eventId));
        }
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

export async function jaEnviado(pixelId: string, eventName: string, eventId?: string): Promise<boolean> {
  if (!eventId) return false;
  const i = await carregar();
  // A chave sem pixel cobre os disparos gravados antes de o log ter pixelId.
  return i.has(chave(pixelId, eventName, eventId)) || i.has(chave('', eventName, eventId));
}

export async function marcarEnviado(pixelId: string, eventName: string, eventId?: string) {
  if (!eventId) return;
  (await carregar()).add(chave(pixelId, eventName, eventId));
}

/** So para teste: descarta o cache em memoria e relei o jsonl. */
export function _limparCache() {
  indice = null;
}
