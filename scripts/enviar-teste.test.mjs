#!/usr/bin/env node
/**
 * A aba "Teste" (`/e/<slug>/teste`, pedido do dono de 25/09/2026) e a rota que
 * ela chama, `POST /api/enviar-teste`.
 *
 * A rota existe para UMA coisa: mandar evento que só aparece em "Testar
 * eventos" do Gerenciador de Eventos da Meta. Evento sem `test_event_code`
 * conta como conversão de verdade e ensina errado o algoritmo das campanhas
 * (regra 1 do CLAUDE.md). Por isso este arquivo prova, com o handler de
 * verdade, que:
 *
 *   (a) sem código de teste, ou com código que não começa com TEST, é 400 e
 *       NENHUMA chamada sai
 *   (b) com código, o corpo que vai para a Meta leva `test_event_code` — e o
 *       código do corpo vence o que está salvo no Pixel
 *   (c) sem código no corpo, vale o código salvo no Pixel (`testCode`)
 *   (d) evento fora dos 8 da aba (ou sem evento) é 400 e nada sai
 *   (e) Pixel de outra empresa (ou que não existe) é 404 e nada sai; aba e
 *       navegador em empresas diferentes é 409; Pixel sem token é 400
 *   (f) sem sessão é 401 e nada sai
 *   (g) nada passa pelo repasse ao CRM (relay), pelo dedup nem pelo histórico
 *       de disparos (registrarDisparo): leitura estática da rota + a pasta
 *       `logs/` continua vazia depois dos envios + toda chamada foi para a
 *       Graph API. A linha de log `[TESTE]` não leva token nem e-mail
 *   (h) o gerador tem cara de teste (`@example.com`, `teste-`, `TESTE-`, IP
 *       de documentação), o detector de teste do próprio console reconhece os
 *       dados, os 8 eventos passam no `validar` e o `event_id` não repete
 *
 * E, de ponta a ponta, a sequência que a tela faz: os 8 eventos, um por vez,
 * todos aceitos pela Meta falsa, na ordem do funil. Mais: erro da Meta volta
 * como `ok: false` com a mensagem e o `fbtrace_id`; rede fora é 502.
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/. Ele intercepta graph.facebook.com e api.cloudflare.com,
 * guarda o corpo (SEM o access_token, que nem é guardado) e responde 200
 * falso. Qualquer outro endereço é recusado e reprova o teste. Tokens,
 * Pixels e códigos abaixo são falsos, nada vem do .env (ACCESS_TOKEN e
 * PIXEL_ID são apagados do ambiente) e tudo roda num diretório temporário.
 *
 * Roda SEM `--conditions=react-server`, como `disparo-por-empresa.test.mjs`:
 * carregar o route.ts arrasta meta-capi → meta-events → ícones.
 *
 * Uso: npm run test:enviar-teste
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

const GRAPH = /^https:\/\/graph\.facebook\.com\/[^/]+\/([^/]+)\/events$/;
const CLOUDFLARE = /^https:\/\/api\.cloudflare\.com\//;

/** Cada chamada interceptada: a URL e o corpo SEM o access_token. */
const chamadas = [];
/** Endereços que alguém tentou e que o teste recusou. Tem de ficar vazio. */
const recusadas = [];
/**
 * O que a próxima chamada à Graph devolve. `null` = o 200 de sempre; uma
 * função = resposta sob medida (erro da Meta, rede fora), usada uma vez.
 */
let proximaDaGraph = null;

const fetchFalso = async (entrada, init) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  if (!GRAPH.test(url) && !CLOUDFLARE.test(url)) {
    recusadas.push(url);
    throw new Error('rede bloqueada pelo teste');
  }
  let corpo = null;
  try {
    corpo = JSON.parse(typeof init?.body === 'string' ? init.body : 'null');
  } catch {
    corpo = null;
  }
  const levouToken = typeof corpo?.access_token === 'string' && corpo.access_token.length > 0;
  if (corpo && typeof corpo === 'object') delete corpo.access_token;
  chamadas.push({ url, corpo, levouToken });

  if (GRAPH.test(url) && proximaDaGraph) {
    const resposta = proximaDaGraph;
    proximaDaGraph = null;
    return resposta();
  }
  const falsa = GRAPH.test(url)
    ? { events_received: 1, fbtrace_id: 'falso-local' }
    : { success: true, result: {} };
  return new Response(JSON.stringify(falsa), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
globalThis.fetch = fetchFalso;
const pixelDe = (url) => GRAPH.exec(url)?.[1] ?? '';

/* Credenciais de mentira ANTES de carregar sessao.ts, que lê o ambiente no import. */
process.env.CONSOLE_USER = 'admin';
process.env.CONSOLE_PASSWORD = 'senha-super-segura-com-mais-de-12-chars';
process.env.SESSION_SECRET = 'segredo-de-sessao-muito-seguro-com-mais-de-32-caracteres-para-teste';
/* Nada do .env: os únicos tokens que existem aqui são os falsos de marcas.json. */
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-enviar-teste-'));
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raizAnterior = process.cwd();
// config-store.ts, dedup.ts e attribution-log.ts resolvem os caminhos no import.
process.chdir(tmp);

/**
 * Pixels falsos. A empresa A tem quatro: um com código de teste salvo, um
 * sem código, um com código salvo inválido e um sem token. A empresa B e o
 * dono (`default`) têm um cada, para provar que o Pixel de outra empresa não
 * passa.
 */
const PIXEL_DONO = '111111111111111';
const PIXEL_B = '222222222222222';
const PIXEL_A = '333333333333333';
const PIXEL_A_SEM_CODIGO = '444444444444444';
const TOKEN_A = 'token-falso-da-a';
const CODIGO_SALVO = 'TEST11111';
fs.writeFileSync(
  path.join(tmp, 'config', 'marcas.json'),
  JSON.stringify(
    [
      { id: 'default', nome: 'Pixel do dono (falso)', pixelId: PIXEL_DONO, accessToken: 'token-falso-do-dono', testCode: 'TEST00000' },
      { id: 'pixel_b', nome: 'Pixel da B (falso)', pixelId: PIXEL_B, accessToken: 'token-falso-da-b', testCode: 'TEST22222', empresaId: 'emp_b' },
      { id: 'pixel_a', nome: 'Pixel da A (falso)', pixelId: PIXEL_A, accessToken: TOKEN_A, testCode: CODIGO_SALVO, empresaId: 'emp_a' },
      { id: 'pixel_a_sem_codigo', nome: 'Pixel da A sem código (falso)', pixelId: PIXEL_A_SEM_CODIGO, accessToken: 'token-falso-da-a-2', testCode: '', empresaId: 'emp_a' },
      { id: 'pixel_a_codigo_ruim', nome: 'Pixel da A com código ruim (falso)', pixelId: '555555555555555', accessToken: 'token-falso-da-a-3', testCode: 'ABC123', empresaId: 'emp_a' },
      { id: 'pixel_a_sem_token', nome: 'Pixel da A sem token (falso)', pixelId: '666666666666666', accessToken: '', testCode: CODIGO_SALVO, empresaId: 'emp_a' },
    ],
    null,
    2
  ),
  'utf8'
);

const { NextRequest } = await import('next/server.js');
const { assinarSessao, COOKIE_SESSAO } = await import(new URL('../src/lib/sessao.ts', import.meta.url).href);
const registro = await import(new URL('../src/lib/empresas.ts', import.meta.url).href);
const cfgStore = await import(new URL('../src/lib/config-store.ts', import.meta.url).href);
const rota = await import(new URL('../src/app/api/enviar-teste/route.ts', import.meta.url).href);
const gerador = await import(new URL('../src/lib/dados-de-teste.ts', import.meta.url).href);
const { montarEvento, validar } = await import(new URL('../src/lib/meta-capi.ts', import.meta.url).href);
const { padraoConhecido } = await import(new URL('../src/lib/deteccao-de-teste.ts', import.meta.url).href);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

function encerrar(codigo) {
  process.chdir(raizAnterior);
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  process.exit(codigo);
}

/**
 * Nenhum import pode ter trocado o falso. Se trocou, o teste PARA aqui, antes
 * de qualquer envio — continuar seria arriscar uma chamada de verdade.
 */
function exigirFetchFalso() {
  if (globalThis.fetch !== fetchFalso) {
    console.error('  FALHA  o fetch falso foi trocado por outro: o teste para antes de qualquer envio.');
    encerrar(1);
  }
}
exigirFetchFalso();

/* ---------------- Montagem ---------------- */

await registro.salvarEmpresa({ id: 'emp_a', nome: 'Empresa A' });
await cfgStore.criarIntegracoesDaEmpresa({ id: 'emp_a', slug: 'empresa-a' });
await registro.salvarEmpresa({ id: 'emp_b', nome: 'Empresa B' });
await cfgStore.criarIntegracoesDaEmpresa({ id: 'emp_b', slug: 'empresa-b' });
{
  const daA = (await cfgStore.listarMarcas('emp_a')).map((m) => m.id).sort();
  ok(
    daA.join(',') === 'pixel_a,pixel_a_codigo_ruim,pixel_a_sem_codigo,pixel_a_sem_token',
    'montagem: a empresa A tem os quatro Pixels dela',
    `[${daA.join(', ')}]`
  );
}

const COOKIE = `${COOKIE_SESSAO}=${assinarSessao('admin', 12)}`;

/** As linhas `[TESTE]` que a rota escreveu, capturadas em volta de cada chamada. */
const linhasDeLog = [];

/** O que a aba faz: POST na rota de verdade, com a empresa do endereço no header. */
async function enviarTeste(corpo, { sessao = true, header = 'emp_a', cookieEmpresa } = {}) {
  exigirFetchFalso();
  const partes = [];
  if (sessao) partes.push(COOKIE);
  if (cookieEmpresa) partes.push(`capi_empresa=${cookieEmpresa}`);
  const headers = { 'content-type': 'application/json' };
  if (partes.length) headers.cookie = partes.join('; ');
  if (header) headers['x-empresa-id'] = header;

  const logOriginal = console.log;
  console.log = (...args) => {
    const linha = args.map(String).join(' ');
    if (linha.startsWith('[TESTE]')) linhasDeLog.push(linha);
    else logOriginal(...args);
  };
  try {
    const res = await rota.POST(
      new NextRequest('http://localhost:3333/api/enviar-teste', {
        method: 'POST',
        headers,
        body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
      })
    );
    const texto = await res.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      json = { bruto: texto };
    }
    return { status: res.status, corpo: json, texto };
  } finally {
    console.log = logOriginal;
  }
}

/** Dados de teste gerados como a tela gera (o relógio de agora). */
const dados = gerador.gerarDadosDeTeste({
  agora: Date.now(),
  userAgent: 'Mozilla/5.0 (teste do console)',
  dominio: 'loja-de-teste.example.com',
});
const eventoDe = (nome) => gerador.eventoDeTeste(nome, dados, Date.now());
const corpoDe = (brandId, nome = 'Purchase', extra = {}) => ({ brandId, event: eventoDe(nome), ...extra });

/** Roda `fn` e devolve quantas chamadas de rede ela fez. */
async function contando(fn) {
  const antes = chamadas.length;
  const r = await fn();
  return { r, novas: chamadas.slice(antes) };
}

/* ---------------- (f) sem sessão ---------------- */

console.log('\n  (f) sem sessão');
{
  const { r, novas } = await contando(() =>
    enviarTeste(corpoDe('pixel_a', 'Purchase', { testEventCode: 'TEST12345' }), { sessao: false })
  );
  ok(r.status === 401, '🔴 (f) sem o cookie de sessão → 401', `status=${r.status}`);
  ok(novas.length === 0, '🔴 (f) ZERO chamadas', `chamadas=${novas.length}`);
}

/* ---------------- (a) sem código ou com código inválido ---------------- */

console.log('\n  (a) código de teste obrigatório');
{
  const { r, novas } = await contando(() => enviarTeste(corpoDe('pixel_a_sem_codigo')));
  ok(r.status === 400, '🔴 (a1) Pixel sem código salvo e corpo sem código → 400', `status=${r.status}`);
  ok(novas.length === 0, '🔴 (a1) ZERO chamadas', `chamadas=${novas.length}`);
  ok(
    /código de teste/i.test(r.corpo?.erro ?? '') && /Testar eventos/.test(r.corpo?.erro ?? ''),
    '(a1) a mensagem diz onde copiar o código (Testar eventos)',
    r.corpo?.erro
  );
}
{
  const { r, novas } = await contando(() =>
    enviarTeste(corpoDe('pixel_a_sem_codigo', 'Purchase', { testEventCode: '   ' }))
  );
  ok(r.status === 400 && novas.length === 0, '🔴 (a2) código só com espaços → 400 e nada sai', `status=${r.status} chamadas=${novas.length}`);
}
for (const invalido of ['ABC123', 'TEST', 'TEST-123', 'TEST 123', 'xTEST123', 'TEST123;DROP', 'TEST' + '9'.repeat(41)]) {
  const { r, novas } = await contando(() =>
    enviarTeste(corpoDe('pixel_a_sem_codigo', 'Purchase', { testEventCode: invalido }))
  );
  ok(
    r.status === 400 && novas.length === 0,
    `🔴 (a3) código inválido ${JSON.stringify(invalido.length > 20 ? invalido.slice(0, 12) + '…' : invalido)} → 400 e nada sai`,
    `status=${r.status} chamadas=${novas.length}`
  );
}
{
  const { r, novas } = await contando(() => enviarTeste(corpoDe('pixel_a_codigo_ruim')));
  ok(
    r.status === 400 && novas.length === 0,
    '🔴 (a4) código SALVO no Pixel que não começa com TEST também não passa → 400 e nada sai',
    `status=${r.status} chamadas=${novas.length}`
  );
}
{
  const { r, novas } = await contando(() =>
    enviarTeste(corpoDe('pixel_a_sem_codigo', 'Purchase', { testEventCode: 12345 }))
  );
  ok(r.status === 400 && novas.length === 0, '(a5) código que não é texto → 400 e nada sai', `status=${r.status} chamadas=${novas.length}`);
}

/* ---------------- (b) com código: o corpo leva test_event_code ---------------- */

console.log('\n  (b) com código, o corpo leva test_event_code');
{
  const { r, novas } = await contando(() =>
    enviarTeste(corpoDe('pixel_a_sem_codigo', 'Purchase', { testEventCode: ' TEST98765 ' }))
  );
  ok(r.status === 200 && r.corpo?.ok === true, '(b1) código válido → 200 e ok', `status=${r.status} ok=${r.corpo?.ok}`);
  ok(novas.length === 1, '(b1) exatamente UMA chamada', `chamadas=${novas.length}`);
  const c = novas[0];
  ok(Boolean(c) && GRAPH.test(c.url) && pixelDe(c.url) === PIXEL_A_SEM_CODIGO, '(b1) a chamada foi para a Graph, no Pixel escolhido', c ? pixelDe(c.url) : '');
  ok(c?.corpo?.test_event_code === 'TEST98765', '🔴 (b1) o corpo leva test_event_code (aparado)', String(c?.corpo?.test_event_code));
  ok(c?.levouToken === true, '(b1) o corpo levou o token do Pixel (não guardado aqui)');
  ok(
    c?.corpo?.data?.length === 1 && c.corpo.data[0].event_name === 'Purchase',
    '(b1) um evento só no corpo, o Purchase',
    JSON.stringify(c?.corpo?.data?.map((d) => d.event_name))
  );
  ok(
    r.corpo?.eventsReceived === 1 && r.corpo?.fbtraceId === 'falso-local' && r.corpo?.erro === null,
    '(b1) a resposta traz eventsReceived, fbtraceId e erro null',
    JSON.stringify(r.corpo)
  );
  ok(!/token-falso/.test(r.texto), '🔴 (b1) a resposta NUNCA traz o token');
}
{
  const { novas } = await contando(() =>
    enviarTeste(corpoDe('pixel_a', 'Lead', { testEventCode: 'TEST55555' }))
  );
  ok(
    novas.length === 1 && novas[0].corpo?.test_event_code === 'TEST55555',
    '(b2) o código do corpo vence o salvo no Pixel',
    String(novas[0]?.corpo?.test_event_code)
  );
}

/* ---------------- (c) sem código no corpo, vale o do Pixel ---------------- */

console.log('\n  (c) sem código no corpo, vale o do Pixel');
{
  const { r, novas } = await contando(() => enviarTeste(corpoDe('pixel_a', 'ViewContent')));
  ok(r.status === 200 && r.corpo?.ok === true, '(c) Pixel com código salvo e corpo sem código → 200', `status=${r.status}`);
  ok(
    novas.length === 1 && novas[0].corpo?.test_event_code === CODIGO_SALVO && pixelDe(novas[0].url) === PIXEL_A,
    '🔴 (c) o corpo leva o testCode salvo no Pixel',
    String(novas[0]?.corpo?.test_event_code)
  );
}

/* ---------------- (d) evento fora da lista ---------------- */

console.log('\n  (d) só os 8 eventos da aba');
for (const nome of ['Subscribe', 'purchase', 'purchase_approved', 'StartTrial', '']) {
  const corpo = { brandId: 'pixel_a', event: { ...eventoDe('Purchase'), event_name: nome } };
  const { r, novas } = await contando(() => enviarTeste(corpo));
  ok(
    r.status === 400 && novas.length === 0,
    `🔴 (d) evento ${JSON.stringify(nome)} → 400 e nada sai`,
    `status=${r.status} chamadas=${novas.length}`
  );
}
{
  const { r, novas } = await contando(() => enviarTeste({ brandId: 'pixel_a' }));
  ok(r.status === 400 && novas.length === 0, '(d) sem evento nenhum → 400 e nada sai', `status=${r.status}`);
  const lixo = await contando(() => enviarTeste('isto não é json'));
  ok(lixo.r.status === 400 && lixo.novas.length === 0, '(d) corpo que não é JSON → 400 e nada sai', `status=${lixo.r.status}`);
}
{
  // Purchase sem valor: o `validar` da Meta reprova antes de sair.
  const ev = eventoDe('Purchase');
  const { r, novas } = await contando(() =>
    enviarTeste({ brandId: 'pixel_a', event: { ...ev, custom: { contentName: 'Produto de teste' } } })
  );
  ok(r.status === 400 && novas.length === 0, '(d) Purchase sem valor e moeda → 400 (validar) e nada sai', r.corpo?.erro);
}

/* ---------------- (e) Pixel de outra empresa, 409, sem token ---------------- */

console.log('\n  (e) só o Pixel da empresa da aba');
for (const [brandId, rotulo] of [
  ['pixel_b', 'o Pixel da empresa B'],
  ['default', 'o Pixel do dono ("default")'],
  ['nao-existe', 'um Pixel que não existe'],
]) {
  const { r, novas } = await contando(() =>
    enviarTeste(corpoDe(brandId, 'Purchase', { testEventCode: 'TEST12345' }), { header: 'emp_a' })
  );
  ok(
    r.status === 404 && novas.length === 0,
    `🔴 (e) ${rotulo} com a empresa A na aba → 404 e nada sai`,
    `status=${r.status} chamadas=${novas.length}`
  );
}
{
  const { r, novas } = await contando(() =>
    enviarTeste(corpoDe('pixel_a', 'Purchase', { testEventCode: 'TEST12345' }), { header: 'emp_a', cookieEmpresa: 'emp_b' })
  );
  ok(r.status === 409 && novas.length === 0, '🔴 (e) aba na A (header) e navegador na B (cookie) → 409 e nada sai', `status=${r.status}`);
  ok(/Recarregue a página/.test(r.corpo?.erro ?? ''), '(e) a mensagem do 409 manda recarregar', r.corpo?.erro);
}
{
  const { r, novas } = await contando(() => enviarTeste(corpoDe('pixel_a_sem_token')));
  ok(r.status === 400 && novas.length === 0, '(e) Pixel da A sem token → 400 e nada sai (nada do .env)', `status=${r.status}`);
  const vazio = await contando(() => enviarTeste(corpoDe('   ')));
  ok(vazio.r.status === 400 && vazio.novas.length === 0, '(e) sem Pixel escolhido → 400 "Escolha o Pixel." e nada sai', vazio.r.corpo?.erro);
}

/* ---------------- A sequência da tela: os 8, um por vez ---------------- */

console.log('\n  Sequência: os 8 eventos, um por vez');
{
  const antes = chamadas.length;
  const respostas = [];
  for (const nome of gerador.EVENTOS_DE_TESTE) {
    respostas.push(await enviarTeste(corpoDe('pixel_a', nome, { testEventCode: 'TEST77777' })));
  }
  const novas = chamadas.slice(antes);
  ok(
    respostas.every((r) => r.status === 200 && r.corpo?.ok === true),
    'os 8 voltam 200 e aceitos pela Meta falsa',
    respostas.map((r) => r.status).join(',')
  );
  ok(novas.length === 8, 'uma chamada por evento (8)', `chamadas=${novas.length}`);
  ok(
    JSON.stringify(novas.map((c) => c.corpo?.data?.[0]?.event_name)) === JSON.stringify([...gerador.EVENTOS_DE_TESTE]),
    'na ordem do funil',
    JSON.stringify(novas.map((c) => c.corpo?.data?.[0]?.event_name))
  );
  ok(novas.every((c) => c.corpo?.test_event_code === 'TEST77777'), '🔴 todos com test_event_code');
  const ids = novas.map((c) => c.corpo?.data?.[0]?.event_id);
  ok(new Set(ids).size === 8 && ids.every((id) => /^teste-/.test(id ?? '')), 'event_id único e com "teste-" em cada um', JSON.stringify(ids.slice(0, 2)));
  const agoraS = Math.floor(Date.now() / 1000);
  ok(
    novas.every((c) => Math.abs(agoraS - Number(c.corpo?.data?.[0]?.event_time)) <= 60),
    'event_time é o agora de cada envio'
  );
  const compra = novas.find((c) => c.corpo?.data?.[0]?.event_name === 'Purchase')?.corpo?.data?.[0];
  ok(
    compra?.custom_data?.value === 97 && compra?.custom_data?.currency === 'BRL' && /^TESTE-/.test(compra?.custom_data?.order_id ?? ''),
    'o Purchase leva valor, BRL e pedido TESTE-…',
    JSON.stringify(compra?.custom_data)
  );
  const visita = novas.find((c) => c.corpo?.data?.[0]?.event_name === 'PageView')?.corpo?.data?.[0];
  ok(!visita?.custom_data?.value && !visita?.custom_data?.order_id, 'o PageView não leva valor nem pedido');
  ok(
    /^fb\.1\.\d+\.teste_capi_/.test(compra?.user_data?.fbc ?? '') && compra?.user_data?.client_ip_address?.startsWith('203.0.113.'),
    'fbc de teste e IP da faixa de documentação chegam no user_data',
    `${compra?.user_data?.fbc} ${compra?.user_data?.client_ip_address}`
  );
}

/* ---------------- Erro da Meta e rede fora ---------------- */

console.log('\n  Erro da Meta e rede fora');
{
  proximaDaGraph = () =>
    new Response(
      JSON.stringify({
        error: { message: 'Invalid parameter', error_user_msg: 'Parâmetro inválido (falso)', fbtrace_id: 'trace-falso-erro' },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  const r = await enviarTeste(corpoDe('pixel_a', 'Lead'));
  ok(
    r.status === 200 && r.corpo?.ok === false && r.corpo?.httpStatus === 400,
    'erro da Meta → 200 com ok:false e o httpStatus da Meta',
    JSON.stringify(r.corpo)
  );
  ok(
    r.corpo?.erro === 'Parâmetro inválido (falso)' && r.corpo?.fbtraceId === 'trace-falso-erro',
    'a linha recebe a mensagem da Meta e o fbtrace_id',
    `${r.corpo?.erro} / ${r.corpo?.fbtraceId}`
  );
}
{
  proximaDaGraph = () =>
    new Response(JSON.stringify({ events_received: 0, fbtrace_id: 'trace-zero' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const r = await enviarTeste(corpoDe('pixel_a', 'Lead'));
  ok(r.corpo?.ok === false && /não aceitou/.test(r.corpo?.erro ?? ''), '200 com events_received 0 não conta como aceito', r.corpo?.erro);
}
{
  proximaDaGraph = () => {
    throw new Error('ECONNRESET (falso)');
  };
  const r = await enviarTeste(corpoDe('pixel_a', 'Lead'));
  ok(r.status === 502 && /Não foi possível falar com a Meta/.test(r.corpo?.erro ?? ''), 'rede fora → 502 com a mensagem', `status=${r.status}`);
}

/* ---------------- (g) nada de relay, dedup ou histórico ---------------- */

console.log('\n  (g) teste não entra no CRM, no dedup nem no histórico');
{
  const fonte = fs.readFileSync(fileURLToPath(new URL('../src/app/api/enviar-teste/route.ts', import.meta.url)), 'utf8');
  // Só o código: os comentários da rota citam os nomes justamente para dizer que não os usa.
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const [padrao, rotulo] of [
    [/@\/lib\/relay|['"]\.{1,2}\/.*relay['"]/, 'não importa o relay'],
    [/@\/lib\/dedup|['"]\.{1,2}\/.*dedup['"]/, 'não importa o dedup'],
    [/@\/lib\/attribution-log|['"]\.{1,2}\/.*attribution-log['"]/, 'não importa o attribution-log'],
    [/\btransmitir\s*\(/, 'não chama transmitir()'],
    [/\bjaEnviado\s*\(|\bmarcarEnviado\s*\(/, 'não chama jaEnviado()/marcarEnviado()'],
    [/\bregistrarDisparo\s*\(/, 'não chama registrarDisparo()'],
    [/process\.env\.(ACCESS_TOKEN|PIXEL_ID)/, 'não lê ACCESS_TOKEN/PIXEL_ID do ambiente'],
  ]) {
    ok(!padrao.test(codigo), `🔴 (g) a rota ${rotulo}`);
  }
  ok(/ehCodigoDeTeste\(/.test(codigo) && /testEventCode/.test(codigo), '(g) a rota confere o código com ehCodigoDeTeste');

  const noLogs = fs.readdirSync(path.join(tmp, 'logs'));
  ok(noLogs.length === 0, '🔴 (g) depois de todos os envios, a pasta logs/ continua vazia (sem dedup, sem histórico)', JSON.stringify(noLogs));
  ok(recusadas.length === 0, '🔴 (g) nenhuma chamada para fora da Graph (relay/CRM, n8n, Bitrix)', JSON.stringify(recusadas));
  ok(chamadas.every((c) => GRAPH.test(c.url)), '(g) toda chamada interceptada foi para a Graph API');
  ok(chamadas.every((c) => typeof c.corpo?.test_event_code === 'string' && /^TEST/i.test(c.corpo.test_event_code)), '🔴 (g) NENHUMA chamada saiu sem test_event_code', `total=${chamadas.length}`);

  ok(linhasDeLog.length > 0 && linhasDeLog.every((l) => /^\[TESTE\] \w+ pixel=\d+ http=\d+ recebidos=\d+/.test(l)), '(g) a rota escreve uma linha [TESTE] por envio', linhasDeLog[0]);
  ok(
    linhasDeLog.every((l) => !/token-falso|@example\.com|example\.com/.test(l) && !l.includes(dados.email)),
    '🔴 (g) a linha de log não leva token nem e-mail'
  );
}

/* ---------------- (h) o gerador ---------------- */

console.log('\n  (h) o gerador tem cara de teste');
{
  ok(gerador.EVENTOS_DE_TESTE.length === 8, '(h) são 8 eventos', gerador.EVENTOS_DE_TESTE.join(','));
  ok(
    gerador.EVENTOS_DE_TESTE.every((e) => typeof gerador.ROTULO_DO_EVENTO[e] === 'string' && gerador.ROTULO_DO_EVENTO[e].length > 0),
    '(h) cada evento tem um rótulo em português'
  );
  ok(gerador.ehCodigoDeTeste('TEST12345') && gerador.ehCodigoDeTeste(' test12345 '), '(h) ehCodigoDeTeste aceita TEST… (aparado, sem diferenciar maiúscula)');
  ok(!gerador.ehCodigoDeTeste('') && !gerador.ehCodigoDeTeste('ABC') && !gerador.ehCodigoDeTeste(null), '(h) ehCodigoDeTeste recusa vazio, outro prefixo e não-texto');

  const agora = Date.now();
  const amostras = [
    ...Array.from({ length: 40 }, () => gerador.gerarDadosDeTeste({ agora, userAgent: 'UA de teste', dominio: 'https://Loja.Example.com/obrigado?x=1' })),
    gerador.gerarDadosDeTeste({ agora, aleatorio: () => 0 }),
    gerador.gerarDadosDeTeste({ agora, aleatorio: () => 0.999999 }),
  ];
  const problemas = [];
  for (const d of amostras) {
    if (!/^teste\.capi\+\d{5}@example\.com$/.test(d.email)) problemas.push(`email ${d.email}`);
    if (!/^teste-[a-z0-9]{12}$/.test(d.externalId)) problemas.push(`externalId ${d.externalId}`);
    if (!/^TESTE-\d{8}-\d{6}$/.test(d.orderId)) problemas.push(`orderId ${d.orderId}`);
    if (!/Teste/.test(d.lastName)) problemas.push(`lastName ${d.lastName}`);
    if (!/^\+55\d{2}9\d{8}$/.test(d.phone)) problemas.push(`phone ${d.phone}`);
    if (!/^203\.0\.113\.(\d{1,3})$/.test(d.ip) || Number(d.ip.split('.')[3]) < 1 || Number(d.ip.split('.')[3]) > 254) problemas.push(`ip ${d.ip}`);
    const clique = Number(d.fbc.split('.')[2]);
    if (!/^fb\.1\.\d{13}\.teste_capi_[a-z0-9]{16}$/.test(d.fbc) || clique >= agora || agora - clique > 10 * 60_000) problemas.push(`fbc ${d.fbc}`);
    if (!/^fb\.1\.\d{13}\.\d{10}$/.test(d.fbp)) problemas.push(`fbp ${d.fbp}`);
    if (d.value !== 97 || d.currency !== 'BRL') problemas.push(`valor ${d.value} ${d.currency}`);
    if (!/de teste/i.test(d.contentName)) problemas.push(`contentName ${d.contentName}`);
    if (!padraoConhecido({ email: d.email, firstName: d.firstName, lastName: d.lastName, valor: d.value })) {
      problemas.push(`o detector de teste não reconheceu ${d.email}`);
    }
  }
  ok(problemas.length === 0, '(h) e-mail @example.com, ids teste-/TESTE-, IP 203.0.113.x, fbc de teste com clique no passado', problemas.slice(0, 3).join(' | '));
  ok(
    amostras[0].sourceUrl === 'https://loja.example.com/?utm_source=teste-capi',
    '(h) a URL vem do domínio da empresa, limpo, com utm_source=teste-capi',
    amostras[0].sourceUrl
  );
  ok(gerador.gerarDadosDeTeste({ agora, dominio: '' }).sourceUrl === '', '(h) sem domínio, a URL fica vazia (a tela pede para preencher)');
  ok(gerador.gerarDadosDeTeste({ agora, dominio: 'não é domínio' }).sourceUrl === '', '(h) texto que não é domínio não vira URL');
  ok(new Set(amostras.slice(0, 40).map((d) => d.email)).size > 30, '(h) cada geração sai com outro e-mail', String(new Set(amostras.slice(0, 40).map((d) => d.email)).size));

  const idsGerados = [];
  const reprovados = [];
  for (const d of amostras.slice(0, 40)) {
    for (const nome of gerador.EVENTOS_DE_TESTE) {
      const ev = gerador.eventoDeTeste(nome, d, agora);
      idsGerados.push(ev.event_id);
      const erros = validar(montarEvento(ev));
      if (erros.length) reprovados.push(`${nome}: ${erros.join(' · ')}`);
      if (ev.event_time !== Math.floor(agora / 1000)) reprovados.push(`${nome}: event_time`);
      if (ev.action_source !== 'website') reprovados.push(`${nome}: action_source`);
    }
  }
  ok(reprovados.length === 0, '(h) os 8 eventos gerados passam no validar da Meta', reprovados.slice(0, 2).join(' | '));
  ok(
    new Set(idsGerados).size === idsGerados.length && idsGerados.every((id) => /^teste-[a-z]+-\d+-[a-z0-9]{6}$/.test(id)),
    `(h) event_id único em ${idsGerados.length} eventos gerados no MESMO instante`,
    idsGerados[0]
  );
  const fixo = gerador.eventIdDeTeste('Purchase', 1700000000000, () => 0);
  ok(fixo === 'teste-purchase-1700000000000-aaaaaa', '(h) eventIdDeTeste é determinístico com o aleatório fixo', fixo);
}

/* ---------------- Rede: nada saiu ---------------- */

exigirFetchFalso();
ok(recusadas.length === 0, 'nenhum endereço fora da Graph/Cloudflare foi tentado', JSON.stringify(recusadas));

console.log(falhas ? `\n  ${falhas} FALHA(S)` : '\n  Tudo certo.');
encerrar(falhas ? 1 : 0);
