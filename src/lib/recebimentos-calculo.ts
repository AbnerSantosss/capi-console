/**
 * M-02 — Recebimentos: quando a plataforma (webhook) e o site (tag) mandaram
 * pela ultima vez, e quantas entregas ja chegaram.
 *
 * Arquivo PURO: sem disco, sem relogio, sem `server-only`. O relogio entra como
 * parametro (`agora`, em ms). Quem grava e le o disco e `recebimentos.ts`.
 *
 * Nada aqui guarda dado pessoal, token ou segredo: so o id da empresa, a
 * origem, uma data e um numero.
 */

import { dataHoraDeBrasilia } from '@/lib/visao-geral-calculos';

/** De onde a entrega veio, na palavra de quem usa. */
export type OrigemDoRecebimento = 'plataforma' | 'site';

/** A ordem em que as origens sao lidas, gravadas e avisadas. */
export const ORIGENS_DE_RECEBIMENTO: readonly OrigemDoRecebimento[] = ['plataforma', 'site'];

export interface RegistroDeRecebimento {
  /** ISO da entrega mais recente. */
  ultimaEm: string;
  /** Quantas entregas ja chegaram (piso: nunca diminui). */
  total: number;
}

export type RecebimentosDaEmpresa = Partial<Record<OrigemDoRecebimento, RegistroDeRecebimento>>;

/** Abaixo disso nao ha historico para dizer que "parou". */
export const MINIMO_DE_ENTREGAS_PARA_AVISAR = 20;

/** Quantas horas sem nenhuma entrega viram aviso. */
export const HORAS_SEM_RECEBER = 24;

const MINUTO_MS = 60_000;
const HORA_MS = 3_600_000;

/** `origem` do item da Fila -> a origem do recebimento. So a tag e "site". */
export function origemDoRecebimento(origem: unknown): OrigemDoRecebimento {
  return origem === 'tag' ? 'site' : 'plataforma';
}

/**
 * O teste simulado pelo console usa pedido com prefixo `sim_`
 * (`InstalacaoPage.tsx`). Ele nasce dentro do console: nao e recebimento.
 */
export function ehSimulacaoDoConsole(orderId: unknown): boolean {
  return typeof orderId === 'string' && orderId.startsWith('sim_');
}

/** "ha 3 min", "ha 5 h", "ha 3 dias". `null` quando a data nao serve. */
export function haQuantoTempo(iso: string | null | undefined, agora: number): string | null {
  if (typeof iso !== 'string' || iso === '') return null;
  const quando = Date.parse(iso);
  if (!Number.isFinite(quando)) return null;
  const passado = Math.max(0, agora - quando);
  if (passado < MINUTO_MS) return 'agora há pouco';
  if (passado < HORA_MS) return `há ${Math.floor(passado / MINUTO_MS)} min`;
  if (passado < 48 * HORA_MS) return `há ${Math.floor(passado / HORA_MS)} h`;
  return `há ${Math.floor(passado / (24 * HORA_MS))} dias`;
}

function registroValido(v: unknown): RegistroDeRecebimento | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as { ultimaEm?: unknown; total?: unknown };
  if (typeof r.ultimaEm !== 'string' || !Number.isFinite(Date.parse(r.ultimaEm))) return null;
  if (typeof r.total !== 'number' || !Number.isInteger(r.total) || r.total < 0) return null;
  return { ultimaEm: r.ultimaEm, total: r.total };
}

/**
 * Le o texto de `logs/recebimentos.json`. LANCA quando o texto nao e o formato
 * esperado (arquivo cortado por queda de energia, bytes nulos, JSON de outra
 * coisa): quem chama tenta a copia `.bak`. Registro invalido dentro de um
 * arquivo valido e so ignorado.
 */
export function interpretarRecebimentos(texto: string): Record<string, RecebimentosDaEmpresa> {
  const bruto: unknown = JSON.parse(texto);
  if (typeof bruto !== 'object' || bruto === null) throw new Error('recebimentos: formato inesperado');
  const empresas = (bruto as { empresas?: unknown }).empresas;
  if (typeof empresas !== 'object' || empresas === null || Array.isArray(empresas)) {
    throw new Error('recebimentos: formato inesperado');
  }
  const lido: Record<string, RecebimentosDaEmpresa> = {};
  for (const [empresaId, valor] of Object.entries(empresas as Record<string, unknown>)) {
    if (typeof valor !== 'object' || valor === null) continue;
    const daEmpresa: RecebimentosDaEmpresa = {};
    for (const origem of ORIGENS_DE_RECEBIMENTO) {
      const registro = registroValido((valor as Record<string, unknown>)[origem]);
      if (registro) daEmpresa[origem] = registro;
    }
    lido[empresaId] = daEmpresa;
  }
  return lido;
}

export interface AvisoDeSilencio {
  origem: OrigemDoRecebimento;
  /** Horas inteiras desde a ultima entrega. */
  horas: number;
  /** "Nada chega pela plataforma há 26 h" */
  titulo: string;
  /** O que conferir, e quando foi a ultima entrega. */
  corpo: string;
}

const TEXTO_DO_AVISO: Record<OrigemDoRecebimento, { onde: string; conferir: string; ultima: string }> = {
  plataforma: {
    onde: 'pela plataforma',
    conferir: 'Confira na plataforma se o webhook continua ligado.',
    ultima: 'A última entrega chegou em',
  },
  site: {
    onde: 'pelo site',
    conferir: 'Confira se a tag continua instalada no site.',
    ultima: 'O último evento do site chegou em',
  },
};

/**
 * Um aviso por origem que PAROU: tinha historico (20 entregas ou mais) e esta
 * ha 24 h ou mais sem nenhuma. Sem historico, sem aviso.
 */
export function avisosDeSilencio(
  recebimentos: RecebimentosDaEmpresa | null | undefined,
  agora: number
): AvisoDeSilencio[] {
  const avisos: AvisoDeSilencio[] = [];
  if (!recebimentos) return avisos;
  for (const origem of ORIGENS_DE_RECEBIMENTO) {
    const registro = recebimentos[origem];
    if (!registro || registro.total < MINIMO_DE_ENTREGAS_PARA_AVISAR) continue;
    const quando = Date.parse(registro.ultimaEm);
    if (!Number.isFinite(quando)) continue;
    const passado = agora - quando;
    if (passado < HORAS_SEM_RECEBER * HORA_MS) continue;
    const horas = Math.floor(passado / HORA_MS);
    const tempo = horas < 48 ? `${horas} h` : `${Math.floor(horas / 24)} dias`;
    const texto = TEXTO_DO_AVISO[origem];
    avisos.push({
      origem,
      horas,
      titulo: `Nada chega ${texto.onde} há ${tempo}`,
      corpo: `${texto.conferir} ${texto.ultima} ${dataHoraDeBrasilia(registro.ultimaEm)}.`,
    });
  }
  return avisos;
}
