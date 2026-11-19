import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';

import { caminhoBak, gravarAtomico, naFila } from './arquivo-atomico';
import {
  ORIGENS_DE_RECEBIMENTO,
  ehSimulacaoDoConsole,
  interpretarRecebimentos,
  origemDoRecebimento,
  type RecebimentosDaEmpresa,
} from './recebimentos-calculo';

/**
 * M-02 — A hora da ultima entrega e a contagem, por empresa e por origem.
 *
 * Arquivo: `logs/recebimentos.json`, um objeto pequeno:
 *   { "versao": 1, "empresas": { "<id>": { "plataforma": { "ultimaEm": "<ISO>", "total": 12 }, "site": { ... } } } }
 *
 * - Fora do limite de memoria da Fila: a ultima entrega do webhook continua
 *   conhecida mesmo quando os hits do site ja a tiraram da memoria.
 * - Gravado com `gravarAtomico` (tmp + rename + `.bak`), no maximo uma vez por
 *   minuto. Cada entrega muda so a memoria.
 * - Nenhuma funcao daqui rejeita: falha de disco nunca derruba o recebimento
 *   de um webhook nem a abertura de uma pagina.
 * - Nada daqui escreve em log o conteudo do arquivo.
 */

const ARQ = path.join(process.cwd(), 'logs', 'recebimentos.json');

/** De quanto em quanto tempo as mudancas vao para o disco. */
const INTERVALO_DE_GRAVACAO_MS = 60_000;

const porEmpresa = new Map<string, RecebimentosDaEmpresa>();
let carga: Promise<void> | null = null;
let sujo = false;
let agendado = false;

async function lerDoDisco(): Promise<void> {
  for (const arquivo of [ARQ, caminhoBak(ARQ)]) {
    try {
      const lido = interpretarRecebimentos(await fs.readFile(arquivo, 'utf8'));
      for (const [empresaId, daEmpresa] of Object.entries(lido)) porEmpresa.set(empresaId, daEmpresa);
      return;
    } catch {
      /* arquivo ausente, cortado ou ilegivel: tenta o proximo; sem nenhum, comeca vazio */
    }
  }
}

/** Uma leitura so por processo. `lerDoDisco` nunca rejeita. */
function carregar(): Promise<void> {
  if (!carga) carga = lerDoDisco();
  return carga;
}

function maisNovo(a: string | undefined, b: string): string {
  return a !== undefined && Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * O processo nao pode ficar vivo so por causa deste temporizador (os testes
 * em Node terminam sozinhos). No Node o temporizador tem `unref`; onde nao
 * tiver, nao faz nada.
 */
function soltarTemporizador(t: unknown): void {
  if (typeof t === 'object' && t !== null && 'unref' in t && typeof t.unref === 'function') {
    t.unref();
  }
}

function agendarGravacao(): void {
  sujo = true;
  if (agendado) return;
  agendado = true;
  const t: unknown = setTimeout(() => {
    agendado = false;
    gravarRecebimentosAgora().catch(() => undefined);
  }, INTERVALO_DE_GRAVACAO_MS);
  soltarTemporizador(t);
}

function conteudoDoArquivo(): string {
  const empresas: Record<string, RecebimentosDaEmpresa> = {};
  porEmpresa.forEach((daEmpresa, empresaId) => {
    empresas[empresaId] = daEmpresa;
  });
  return JSON.stringify({ versao: 1, empresas }, null, 2) + '\n';
}

/**
 * Grava agora o que mudou desde a ultima gravacao. Sem mudanca, nao toca no
 * disco. Nunca rejeita: se a gravacao falhar, a mudanca continua marcada e vai
 * junto na proxima.
 */
export async function gravarRecebimentosAgora(): Promise<void> {
  if (!sujo) return;
  sujo = false;
  try {
    await naFila(ARQ, () => gravarAtomico(ARQ, conteudoDoArquivo()));
  } catch {
    sujo = true;
  }
}

/**
 * Uma entrega chegou: guarda a hora e soma 1. Nunca rejeita.
 * `origem` e a do item da Fila (`'tag'` = site; qualquer outra = plataforma).
 */
export async function registrarRecebimento(empresaId: string, origem: string, quandoIso: string): Promise<void> {
  try {
    if (!empresaId || !Number.isFinite(Date.parse(quandoIso))) return;
    await carregar();
    const chave = origemDoRecebimento(origem);
    const daEmpresa = porEmpresa.get(empresaId) ?? {};
    const anterior = daEmpresa[chave];
    daEmpresa[chave] = {
      ultimaEm: maisNovo(anterior?.ultimaEm, quandoIso),
      total: (anterior?.total ?? 0) + 1,
    };
    porEmpresa.set(empresaId, daEmpresa);
    agendarGravacao();
  } catch {
    /* o registro de recebimento nunca derruba a entrega: o item ja esta na Fila */
  }
}

/**
 * Ao ligar: comeca do que a memoria da Fila ja tem. O total vira
 * `max(arquivo, memoria)` (e um piso) e a data, a mais nova das duas.
 * O teste simulado pelo console (`sim_`) fica de fora. Nunca rejeita.
 */
export async function semearRecebimentos(
  itens: ReadonlyArray<{ empresaId?: string; origem: string; recebidoEm: string; orderId?: string }>,
  empresaPadrao: string
): Promise<void> {
  try {
    await carregar();
    const contados = new Map<string, RecebimentosDaEmpresa>();
    for (const item of itens) {
      if (ehSimulacaoDoConsole(item.orderId)) continue;
      if (!Number.isFinite(Date.parse(item.recebidoEm))) continue;
      const empresaId = item.empresaId ?? empresaPadrao;
      const chave = origemDoRecebimento(item.origem);
      const daEmpresa = contados.get(empresaId) ?? {};
      const anterior = daEmpresa[chave];
      daEmpresa[chave] = {
        ultimaEm: maisNovo(anterior?.ultimaEm, item.recebidoEm),
        total: (anterior?.total ?? 0) + 1,
      };
      contados.set(empresaId, daEmpresa);
    }

    let mudou = false;
    contados.forEach((contado, empresaId) => {
      const daEmpresa = porEmpresa.get(empresaId) ?? {};
      for (const origem of ORIGENS_DE_RECEBIMENTO) {
        const novo = contado[origem];
        if (!novo) continue;
        const atual = daEmpresa[origem];
        const ultimaEm = maisNovo(atual?.ultimaEm, novo.ultimaEm);
        const total = Math.max(atual?.total ?? 0, novo.total);
        if (!atual || atual.ultimaEm !== ultimaEm || atual.total !== total) {
          daEmpresa[origem] = { ultimaEm, total };
          mudou = true;
        }
      }
      porEmpresa.set(empresaId, daEmpresa);
    });
    if (mudou) agendarGravacao();
  } catch {
    /* sem semente: os recebimentos comecam do arquivo, ou do zero */
  }
}

/** Uma COPIA do que se sabe da empresa. Empresa desconhecida = objeto vazio. */
export async function lerRecebimentos(empresaId: string): Promise<RecebimentosDaEmpresa> {
  await carregar();
  const copia: RecebimentosDaEmpresa = {};
  const daEmpresa = porEmpresa.get(empresaId);
  if (!daEmpresa) return copia;
  for (const origem of ORIGENS_DE_RECEBIMENTO) {
    const registro = daEmpresa[origem];
    if (registro) copia[origem] = { ...registro };
  }
  return copia;
}
