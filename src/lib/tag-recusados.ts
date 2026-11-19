import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';

import { gravarAtomico, naFila } from '@/lib/arquivo-atomico';
import { erroDoDominio, normalizarDominio } from '@/lib/tag-dominios';

/**
 * Sites que tentaram enviar pela tag e foram recusados por não estarem na
 * lista de sites da empresa (T-M19).
 *
 * O que entra no disco, e só isto: de qual empresa era a chave, o host do
 * site, quantas vezes tentou, a primeira e a última hora. Nada do corpo do
 * hit, nem a chave, nem IP, nem navegador: quem chama entrega só o texto do
 * cabeçalho Origin, e daqui sai só o host dele.
 *
 * A chave da tag é pública. Qualquer um pode mandar um hit com um Origin
 * inventado e fazer um host aparecer aqui. Por isso o arquivo tem teto por
 * empresa, teto total e validade, e a tela pede para autorizar só o que for
 * do cliente.
 *
 * Arquivo: logs/tag-sites-recusados.json  ->  { "sites": [ ... ] }
 */
const ARQ = path.join(process.cwd(), 'logs', 'tag-sites-recusados.json');

/** Quantos sites recusados cada empresa guarda. Passou disto, sai o mais antigo. */
const MAX_POR_EMPRESA = 20;
/** Teto do arquivo inteiro, somando todas as empresas. */
const MAX_TOTAL = 200;
/** Site que não tenta há mais de 30 dias sai da lista sozinho. */
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;
/** Intervalo mínimo entre duas gravações puxadas pelo coletor. */
const ESPERA_ENTRE_GRAVACOES_MS = 60_000;
/** Teto do que espera na memória entre uma gravação e outra. */
const MAX_PENDENTES = 400;
/** Quantas recusas por minuto podem custar a leitura do corpo (passo 1 do coletor). */
const INVESTIGACOES_POR_MINUTO = 60;

/** O que a tela recebe de cada site recusado. */
export interface SiteRecusado {
  host: string;
  vezes: number;
  primeiraVez: string;
  ultimaVez: string;
}

/** A linha do arquivo: o mesmo, mais a empresa dona da chave usada. */
interface Registro extends SiteRecusado {
  empresaId: string;
}

/** Uma recusa que ainda não foi para o disco. */
interface Pendente {
  empresaId: string;
  host: string;
  vezes: number;
  primeira: number;
  ultima: number;
}

const pendentes = new Map<string, Pendente>();
let ultimaGravacao = 0;
let gravacaoAgendada = false;
let inicioDaJanela = 0;
let investigacoesNaJanela = 0;

/**
 * O host que vale anotar, a partir do cabeçalho Origin. Devolve '' quando não
 * vale: sem Origin, texto que não é endereço, `http://`, IP, localhost.
 *
 * Espelha `origemPermitida`: só entra o que, depois de autorizado, passaria
 * por ela. O `www.` sai, porque a lista aceita o host e os subdomínios dele.
 */
export function hostDaOrigemRecusada(origin: string | null | undefined): string {
  const cru = String(origin ?? '').trim();
  if (!cru) return '';
  let u: URL;
  try {
    u = new URL(cru);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:') return '';
  const host = normalizarDominio(u.hostname);
  if (!host || erroDoDominio(host) !== null) return '';
  return host;
}

/**
 * Freio do passo 1 do coletor: no máximo INVESTIGACOES_POR_MINUTO recusas por
 * minuto podem custar a leitura do corpo. Passou disso, a recusa volta a ser
 * só o 403, como sempre foi.
 */
export function podeInvestigarRecusa(agora: number = Date.now()): boolean {
  if (agora - inicioDaJanela >= 60_000) {
    inicioDaJanela = agora;
    investigacoesNaJanela = 0;
  }
  if (investigacoesNaJanela >= INVESTIGACOES_POR_MINUTO) return false;
  investigacoesNaJanela += 1;
  return true;
}

/** Roda a gravação sem ninguém esperar por ela. Falha de disco morre aqui. */
function gravarSemEsperar(): void {
  ultimaGravacao = Date.now();
  void descarregarSitesRecusados().catch(() => {});
}

/**
 * Anota que o site do cabeçalho Origin tentou enviar com a chave desta empresa
 * e foi recusado.
 *
 * Não espera disco e nunca lança: soma na memória e pede a gravação. A
 * primeira recusa grava na hora; as seguintes, no máximo uma gravação por
 * minuto. Quem chama é o coletor, que não pode ficar mais lento nem mudar de
 * resposta por causa disto.
 */
export function anotarSiteRecusado(
  empresaId: string,
  origin: string | null | undefined,
  agora: number = Date.now()
): void {
  const host = hostDaOrigemRecusada(origin);
  if (!empresaId || !host || !Number.isFinite(agora)) return;

  const chave = `${empresaId}|${host}`;
  const ja = pendentes.get(chave);
  if (ja) {
    ja.vezes += 1;
    ja.primeira = Math.min(ja.primeira, agora);
    ja.ultima = Math.max(ja.ultima, agora);
  } else {
    if (pendentes.size >= MAX_PENDENTES) return;
    pendentes.set(chave, { empresaId, host, vezes: 1, primeira: agora, ultima: agora });
  }

  if (Date.now() - ultimaGravacao >= ESPERA_ENTRE_GRAVACOES_MS) {
    gravarSemEsperar();
    return;
  }
  if (gravacaoAgendada) return;
  gravacaoAgendada = true;
  const relogio: unknown = setTimeout(() => {
    gravacaoAgendada = false;
    gravarSemEsperar();
  }, ESPERA_ENTRE_GRAVACOES_MS);
  // O relógio não pode segurar o processo aberto (teste, desligamento).
  if (
    relogio &&
    typeof relogio === 'object' &&
    'unref' in relogio &&
    typeof relogio.unref === 'function'
  ) {
    relogio.unref();
  }
}

/** Lê o arquivo. Ausente, vazio ou estragado = lista vazia. */
async function lerRegistros(): Promise<Registro[]> {
  let cru: string;
  try {
    cru = await fs.readFile(ARQ, 'utf8');
  } catch {
    return [];
  }
  try {
    const lido: unknown = JSON.parse(cru);
    const sites = lido && typeof lido === 'object' ? (lido as { sites?: unknown }).sites : null;
    if (!Array.isArray(sites)) return [];
    const saida: Registro[] = [];
    for (const s of sites) {
      if (!s || typeof s !== 'object') continue;
      const r = s as Record<string, unknown>;
      if (
        typeof r.empresaId !== 'string' ||
        typeof r.host !== 'string' ||
        typeof r.vezes !== 'number' ||
        typeof r.primeiraVez !== 'string' ||
        typeof r.ultimaVez !== 'string'
      ) {
        continue;
      }
      saida.push({
        empresaId: r.empresaId,
        host: r.host,
        vezes: r.vezes,
        primeiraVez: r.primeiraVez,
        ultimaVez: r.ultimaVez,
      });
    }
    return saida;
  } catch {
    return [];
  }
}

/**
 * Tira o que venceu e aplica os tetos. Fica o mais recente: a lista sai em
 * ordem da última tentativa, da mais nova para a mais antiga.
 */
function aparar(registros: Registro[], agora: number): Registro[] {
  const vivos = registros
    .filter((r) => agora - Date.parse(r.ultimaVez) <= VALIDADE_MS)
    .sort((a, b) => Date.parse(b.ultimaVez) - Date.parse(a.ultimaVez));
  const porEmpresa = new Map<string, number>();
  const saida: Registro[] = [];
  for (const r of vivos) {
    if (saida.length >= MAX_TOTAL) break;
    const n = porEmpresa.get(r.empresaId) ?? 0;
    if (n >= MAX_POR_EMPRESA) continue;
    porEmpresa.set(r.empresaId, n + 1);
    saida.push(r);
  }
  return saida;
}

/** A única gravação deste arquivo. Sem `.bak`: é um aviso, não configuração. */
async function gravarRegistros(registros: Registro[]): Promise<void> {
  const sites = aparar(registros, Date.now());
  await gravarAtomico(ARQ, JSON.stringify({ sites }, null, 2), { backup: false });
}

/**
 * Leva para o disco o que está na memória. Sem nada pendente, não grava.
 * Se a gravação falhar, o lote se perde: é um aviso, e o próximo hit do
 * mesmo site anota de novo.
 */
export function descarregarSitesRecusados(): Promise<void> {
  return naFila(ARQ, async () => {
    if (pendentes.size === 0) return;
    const lote = Array.from(pendentes.values());
    pendentes.clear();
    const registros = await lerRegistros();
    for (const p of lote) {
      const primeira = new Date(p.primeira).toISOString();
      const ultima = new Date(p.ultima).toISOString();
      const ja = registros.find((r) => r.empresaId === p.empresaId && r.host === p.host);
      if (ja) {
        ja.vezes += p.vezes;
        if (primeira < ja.primeiraVez) ja.primeiraVez = primeira;
        if (ultima > ja.ultimaVez) ja.ultimaVez = ultima;
      } else {
        registros.push({
          empresaId: p.empresaId,
          host: p.host,
          vezes: p.vezes,
          primeiraVez: primeira,
          ultimaVez: ultima,
        });
      }
    }
    await gravarRegistros(registros);
  });
}

/** Os sites recusados de UMA empresa, do mais recente para o mais antigo. */
export async function listarSitesRecusados(
  empresaId: string,
  agora: number = Date.now()
): Promise<SiteRecusado[]> {
  await descarregarSitesRecusados().catch(() => {});
  const registros = await naFila(ARQ, () => lerRegistros());
  return aparar(registros, agora)
    .filter((r) => r.empresaId === empresaId)
    .map((r) => ({
      host: r.host,
      vezes: r.vezes,
      primeiraVez: r.primeiraVez,
      ultimaVez: r.ultimaVez,
    }));
}

/** O operador ignorou o site: sai da memória e do arquivo. Se tentar de novo, volta. */
export function esquecerSiteRecusado(empresaId: string, host: string): Promise<void> {
  return naFila(ARQ, async () => {
    pendentes.delete(`${empresaId}|${host}`);
    const registros = await lerRegistros();
    const resto = registros.filter((r) => !(r.empresaId === empresaId && r.host === host));
    if (resto.length === registros.length) return;
    await gravarRegistros(resto);
  });
}
