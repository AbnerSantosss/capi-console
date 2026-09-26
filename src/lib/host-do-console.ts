/**
 * De quem é o endereço da requisição: do console ou do cliente (Tarefa 3 do v6).
 *
 * Com a Cloudflare for SaaS, o subdomínio do cliente (ex.: `capi.gtech.uy`)
 * chega ao mesmo container do console pela regra final do túnel, com o Host
 * do cliente. Sem esta separação, o login do console abriria no domínio do
 * cliente. Por isso o endereço do cliente só serve a tag.
 *
 * Três classes, sempre pelo cabeçalho `Host` e nunca pelo `X-Forwarded-Host`,
 * que quem chama pode inventar:
 * - `console`: o host de `PUBLIC_BASE_URL`. Vazia ou inválida → o padrão dos
 *   dois compose, `capi.proxserverabner.site`. Nunca vira "todo host é
 *   console" (abriria o login no cliente) nem "todo host é cliente" (daria 404
 *   nos webhooks e perderia venda em silêncio);
 * - `interno`: `localhost`, `127.0.0.1` e `[::1]`, com qualquer porta. É o dev
 *   e o healthcheck do Docker;
 * - `cliente`: qualquer outro, inclusive sem Host.
 *
 * Sem import do projeto: o proxy e o teste carregam este arquivo sozinho.
 */

export type ClasseDoHost = 'console' | 'interno' | 'cliente';

/** O mesmo padrão de `docker-compose.ghcr.yml` e `docker-compose.yml`. */
export const HOST_PADRAO_DO_CONSOLE = 'capi.proxserverabner.site';

const INTERNOS = new Set(['localhost', '127.0.0.1', '::1']);

/** Caminhos que o endereço do cliente atende. O resto dá 404. */
const CAMINHOS_DO_CLIENTE = [/^\/api\/tag\/coletar$/, /^\/api\/health$/];

/** `Capi.Gtech.UY.:443` → `capi.gtech.uy`; `[::1]:3333` → `::1`. */
export function normalizarHost(bruto: string | null | undefined): string {
  let h = String(bruto ?? '').trim().toLowerCase();
  if (!h) return '';
  if (h.startsWith('[')) {
    const fim = h.indexOf(']');
    return fim > 0 ? h.slice(1, fim) : '';
  }
  h = h.replace(/:\d*$/, '');
  return h.replace(/\.+$/, '');
}

/**
 * Host de `PUBLIC_BASE_URL`; vazio ou inválido → `null` (quem chama usa o
 * padrão e avisa no log).
 */
export function hostDaBasePublica(base: string | null | undefined): string | null {
  const texto = String(base ?? '').trim();
  if (!texto) return null;
  try {
    const host = normalizarHost(new URL(texto).host);
    return host || null;
  } catch {
    return null;
  }
}

export function classificarHost(
  hostBruto: string | null | undefined,
  hostDoConsole: string
): ClasseDoHost {
  const host = normalizarHost(hostBruto);
  if (!host) return 'cliente';
  if (INTERNOS.has(host)) return 'interno';
  return host === hostDoConsole ? 'console' : 'cliente';
}

export function caminhoDoCliente(pathname: string): boolean {
  return CAMINHOS_DO_CLIENTE.some((r) => r.test(pathname));
}

let avisouBaseVazia = false;

/**
 * O host do console lido do ambiente. Com `PUBLIC_BASE_URL` vazia ou inválida,
 * grava UMA vez no log e usa o padrão.
 */
export function hostDoConsoleDoAmbiente(
  base: string | null | undefined = process.env.PUBLIC_BASE_URL,
  avisar: (msg: string) => void = console.warn
): string {
  const host = hostDaBasePublica(base);
  if (host) return host;
  if (!avisouBaseVazia) {
    avisouBaseVazia = true;
    avisar(`PUBLIC_BASE_URL vazia: host do console = ${HOST_PADRAO_DO_CONSOLE}`);
  }
  return HOST_PADRAO_DO_CONSOLE;
}

/** Só para o teste: volta o aviso único ao estado inicial. */
export function limparAvisoDaBase(): void {
  avisouBaseVazia = false;
}
