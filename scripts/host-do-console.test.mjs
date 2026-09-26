/**
 * Endereço do cliente × endereço do console (Tarefa 3 do v6).
 *
 * Com a Cloudflare for SaaS, `capi.gtech.uy` chega ao mesmo container do
 * console pela regra final do túnel. O que se perde sem isto: o login do
 * console abre no domínio do cliente, ou, no erro contrário, os webhooks do
 * endereço do console dão 404 e a venda se perde em silêncio.
 *
 *   (a) `normalizarHost`, `hostDaBasePublica` e `classificarHost`, puras;
 *   (b) `PUBLIC_BASE_URL` vazia → `capi.proxserverabner.site`, com aviso UMA vez;
 *   (c) o proxy de verdade: no Host do cliente, `/login`, `/`, `/api/sessao`,
 *       `/pixels` e o webhook dão 404 sem cookie, mesmo com X-Forwarded-Host
 *       do console; a tag e o health seguem, e o health não mostra versão;
 *   (d) no Host do console e no interno, tudo como antes, inclusive o webhook.
 *
 * Sem rede: o fetch global lança para qualquer endereço.
 */
globalThis.fetch = async (entrada) => {
  throw new Error(`rede bloqueada pelo teste: ${String(entrada?.url ?? entrada)}`);
};
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

let falhas = 0;
function ok(condicao, rotulo, detalhe = '') {
  if (condicao) {
    console.log(`  ok  ${rotulo}`);
  } else {
    falhas += 1;
    console.error(`  FALHOU  ${rotulo}${detalhe ? ` ${detalhe}` : ''}`);
  }
}

const {
  HOST_PADRAO_DO_CONSOLE,
  caminhoDoCliente,
  classificarHost,
  hostDaBasePublica,
  hostDoConsoleDoAmbiente,
  limparAvisoDaBase,
  normalizarHost,
} = await import(new URL('../src/lib/host-do-console.ts', import.meta.url).href);

const CONSOLE = 'capi.proxserverabner.site';

/* ---------------- (a) funções puras ---------------- */

console.log('\n(a) classificação do Host');
ok(normalizarHost('Capi.Gtech.UY.:443') === 'capi.gtech.uy', 'maiúscula, ponto final e porta saem');
ok(normalizarHost('[::1]:3333') === '::1', 'IPv6 entre colchetes');
ok(normalizarHost('') === '' && normalizarHost(null) === '' && normalizarHost(undefined) === '', 'vazio → vazio');
ok(hostDaBasePublica('https://capi.proxserverabner.site') === CONSOLE, 'host da base pública');
ok(hostDaBasePublica('https://capi.proxserverabner.site:8443/x') === CONSOLE, 'base com porta e caminho');
ok(hostDaBasePublica('') === null && hostDaBasePublica('lixo') === null && hostDaBasePublica(undefined) === null, 'base vazia ou inválida → null');

for (const h of [CONSOLE, 'CAPI.proxserverabner.site', `${CONSOLE}:443`, `${CONSOLE}.`]) {
  ok(classificarHost(h, CONSOLE) === 'console', `"${h}" é console`);
}
for (const h of ['localhost', 'localhost:3333', '127.0.0.1:3333', '[::1]:3333']) {
  ok(classificarHost(h, CONSOLE) === 'interno', `"${h}" é interno`);
}
for (const h of ['m.gtech.uy', 'capi.gtech.uy', '', null, `${CONSOLE}.evil.com`, `evil-${CONSOLE}`, `x.${CONSOLE}`]) {
  ok(classificarHost(h, CONSOLE) === 'cliente', `"${h}" é cliente`);
}
ok(caminhoDoCliente('/api/tag/coletar') && caminhoDoCliente('/api/health'), 'o cliente atende a tag e o health');
for (const p of ['/', '/login', '/api/sessao', '/api/tag/gerar', '/api/tag/coletar/x', '/api/webhook/in/abc']) {
  ok(!caminhoDoCliente(p), `o cliente não atende ${p}`);
}

/* ---------------- (b) base vazia: padrão e aviso único ---------------- */

console.log('\n(b) PUBLIC_BASE_URL vazia');
{
  limparAvisoDaBase();
  const avisos = [];
  const hosts = ['', '   ', 'lixo'].map((b) => hostDoConsoleDoAmbiente(b, (m) => avisos.push(m)));
  ok(hosts.every((h) => h === HOST_PADRAO_DO_CONSOLE), 'vazia ou inválida → capi.proxserverabner.site');
  ok(avisos.length === 1, 'o aviso sai uma vez só em 3 leituras', `(${avisos.length})`);
  ok(hostDoConsoleDoAmbiente('https://painel.exemplo.com', () => {}) === 'painel.exemplo.com', 'base válida manda');
}

/* ---------------- (c) e (d) o proxy de verdade ---------------- */

process.env.CONSOLE_PASSWORD = 'senha-de-teste-bem-comprida-123';
process.env.PUBLIC_BASE_URL = `https://${CONSOLE}`;
const { NextRequest } = await import('next/server');
const { proxy } = await import(new URL('../src/proxy.ts', import.meta.url).href);

function pedir(caminho, host, { metodo = 'GET', cabecalhos = {} } = {}) {
  return proxy(
    new NextRequest(`https://${host}${caminho}`, { method: metodo, headers: { host, ...cabecalhos } })
  );
}
const segue = (r) => r.headers.get('x-middleware-next') === '1';

console.log('\n(c) Host do cliente');
for (const [caminho, metodo] of [
  ['/login', 'GET'],
  ['/', 'GET'],
  ['/api/sessao', 'POST'],
  ['/api/sessao/dev-admin', 'GET'],
  ['/pixels', 'GET'],
  ['/e/gtech/visao-geral', 'GET'],
  ['/api/tag/gerar', 'GET'],
  ['/api/webhook/in/abc123', 'POST'],
]) {
  const r = await pedir(caminho, 'm.gtech.uy', { metodo });
  ok(
    r.status === 404 && !segue(r) && !r.headers.get('set-cookie') && r.headers.get('cache-control') === 'no-store',
    `m.gtech.uy ${metodo} ${caminho} → 404 sem cookie`,
    `(${r.status})`
  );
}
{
  const r = await pedir('/login', 'm.gtech.uy', { cabecalhos: { 'x-forwarded-host': CONSOLE } });
  ok(r.status === 404, 'X-Forwarded-Host do console não abre o login no cliente', `(${r.status})`);
}
for (const metodo of ['POST', 'OPTIONS']) {
  const r = await pedir('/api/tag/coletar', 'capi.gtech.uy', { metodo });
  ok(segue(r), `capi.gtech.uy ${metodo} /api/tag/coletar segue para a rota`);
}
{
  const r = await pedir('/api/health', 'capi.gtech.uy');
  const corpo = await r.json();
  ok(r.status === 200 && corpo.ok === true && corpo.servico === 'capi-console', 'health no cliente: 200, ok e servico');
  ok(!('versao' in corpo) && !('marcas' in corpo) && !('uptimeS' in corpo), 'health no cliente não mostra versão nem marcas');
}

console.log('\n(d) Host do console e interno, como antes');
{
  const r = await pedir('/login', CONSOLE);
  ok(segue(r), 'console /login segue (tela de login)');
}
{
  const r = await pedir('/api/webhook/in/abc123', CONSOLE, { metodo: 'POST' });
  ok(segue(r), 'console POST /api/webhook/in/<x> segue (é por onde entram as vendas)');
}
{
  const r = await pedir('/pixels', CONSOLE);
  ok(r.status === 307 && /\/login\?destino=/.test(r.headers.get('location') ?? ''), 'console /pixels sem sessão → 307 para o login', `(${r.status})`);
}
{
  const r = await pedir('/api/health', '127.0.0.1:3333');
  ok(segue(r), 'healthcheck do Docker (127.0.0.1:3333) segue para a rota completa');
}
{
  const r = await pedir('/api/sessao', 'localhost:3333', { metodo: 'POST' });
  ok(segue(r), 'dev em localhost continua abrindo a sessão');
}

console.log('\n    PUBLIC_BASE_URL vazia no proxy');
{
  process.env.PUBLIC_BASE_URL = '';
  limparAvisoDaBase();
  const avisos = [];
  const avisoOriginal = console.warn;
  console.warn = (m) => avisos.push(String(m));
  try {
    const a = await pedir('/login', CONSOLE);
    const b = await pedir('/login', 'm.gtech.uy');
    const c = await pedir('/api/webhook/in/abc123', CONSOLE, { metodo: 'POST' });
    ok(segue(a), 'base vazia: capi.proxserverabner.site /login segue');
    ok(b.status === 404, 'base vazia: m.gtech.uy /login → 404', `(${b.status})`);
    ok(segue(c), 'base vazia: o webhook no console segue');
    ok(avisos.filter((m) => m.includes('PUBLIC_BASE_URL vazia')).length === 1, 'o aviso sai uma vez só em 3 pedidos');
  } finally {
    console.warn = avisoOriginal;
  }
}

console.log(falhas === 0 ? '\n  Endereço do cliente × console: tudo OK.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
