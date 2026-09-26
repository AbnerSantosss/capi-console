#!/usr/bin/env node
/**
 * Duas travas que, se quebrarem, custam dinheiro de verdade:
 *
 *  1. HERANCA DE ATRIBUICAO — o Purchase do PIX chega sem fbc/fbp (o comprador
 *     pagou no app do banco e nunca voltou ao navegador). Sem herdar o perfil
 *     do pre-checkout, a venda vai para a Meta orfa e nenhuma campanha recebe
 *     o credito. Este teste prova que o fbc atravessa do Lead ate a compra.
 *
 *  2. DEDUPLICACAO — a Meta deduplica Pixel x CAPI, mas nao CAPI x CAPI. Um
 *     retry da plataforma contaria a mesma compra duas vezes e inflaria o ROAS.
 *
 *  3. MODO TESTE FORA DO DEDUP (C8, D12) — um envio com `test_event_code` cai
 *     so em "Eventos de teste" da Meta e NAO conta como conversao. Se ele
 *     entrasse no indice, a venda que foi mandada com o Pixel em teste ficaria
 *     barrada como "ja aceita" quando o Pixel voltasse para producao, e a
 *     conversao real nunca sairia. Linha antiga sem o campo continua contando
 *     como envio real (P6): nao ha como saber, e inferir inventaria historia.
 *
 * Roda num diretorio temporario (nunca toca os logs reais) e sem rede: o
 * `fetch` global e trocado, antes de qualquer import de src/, por um que
 * RECUSA tudo (Graph API da Meta, API da Cloudflare, qualquer outra URL).
 * Nenhuma parte deste teste precisa de resposta de rede.
 *
 * Uso: npm run test:atribuicao
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* Rede trancada ANTES de qualquer import de src/. So anota o host; nunca chama nada. */
const chamadasDeRede = [];
const fetchRecusado = async (entrada) => {
  const url =
    typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : String(entrada?.url ?? '');
  chamadasDeRede.push(url.replace(/[?#].*$/, ''));
  if (/graph\.facebook\.com|api\.cloudflare\.com/.test(url)) {
    throw new Error('teste: chamada a Meta/Cloudflare bloqueada');
  }
  throw new Error('teste: rede bloqueada');
};
globalThis.fetch = fetchRecusado;
/* Nada do .env: nenhum token real entra neste processo. */
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-teste-'));
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raiz = process.cwd();
// Os modulos resolvem os caminhos no import, entao a troca vem antes.
process.chdir(tmp);

const { guardarPerfil, enriquecer } = await import(
  new URL('../src/lib/perfil-atribuicao.ts', import.meta.url).href
);
const { jaEnviado, marcarEnviado, _limparCache } = await import(
  new URL('../src/lib/dedup.ts', import.meta.url).href
);
const { registrarDisparo } = await import(
  new URL('../src/lib/attribution-log.ts', import.meta.url).href
);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  Heranca de atribuicao e deduplicacao\n');

/* ---------------- 1. Heranca ---------------- */

// Pre-checkout: e o unico evento que traz o fbc.
await guardarPerfil({
  email: 'comprador.teste@dominio-ficticio.com.br',
  phone: '5511988887777',
  fbc: 'fb.1.1788449825431.EXEMPLO',
  fbp: 'fb.1.1788449825430.2324207034',
  ip: '187.10.20.30',
  userAgent: 'Mozilla/5.0 (Android)',
  sourceUrl: 'https://codigovencedor.com/?utm_campaign=52564275344761',
});

// Purchase do PIX: so tem e-mail, valor e pedido.
const compra = { email: 'comprador.teste@dominio-ficticio.com.br', value: '27.90', orderId: '6' };
const { campos, herdados } = await enriquecer(compra);

ok(campos.fbc === 'fb.1.1788449825431.EXEMPLO', 'a compra herda o fbc do pre-checkout');
ok(campos.fbp && campos.ip && campos.userAgent, 'herda tambem fbp, ip e user agent');
ok(herdados.includes('fbc'), 'a lista de herdados registra o fbc', herdados.join(','));
ok(campos.value === '27.90', 'o valor da propria compra e preservado');

// Pelo telefone tambem, quando o e-mail muda (comprou com outro e-mail).
const porTelefone = await enriquecer({ phone: '11988887777', value: '27.90' });
ok(porTelefone.campos.fbc === 'fb.1.1788449825431.EXEMPLO', 'acha o perfil pelo telefone sem DDI');

// O que o evento ja trouxe NUNCA e sobrescrito.
const proprio = await enriquecer({
  email: 'comprador.teste@dominio-ficticio.com.br',
  fbc: 'fb.1.9999999999999.DO_PROPRIO_EVENTO',
});
ok(proprio.campos.fbc === 'fb.1.9999999999999.DO_PROPRIO_EVENTO', 'o fbc do proprio evento vence o perfil');

// Comprador desconhecido nao herda nada de ninguem.
const outro = await enriquecer({ email: 'outra.pessoa@dominio-ficticio.com.br' });
ok(!outro.campos.fbc && outro.herdados.length === 0, 'comprador sem perfil nao herda dado de terceiro');

console.log('');

/* ---------------- 2. Deduplicacao ---------------- */

const PIXEL_A = '1624114999139319';
const PIXEL_B = '9999999999999';

ok((await jaEnviado(PIXEL_A, 'Purchase', 'evt_1')) === false, 'event_id novo nao aparece como enviado');
await marcarEnviado(PIXEL_A, 'Purchase', 'evt_1');
ok((await jaEnviado(PIXEL_A, 'Purchase', 'evt_1')) === true, 'o mesmo event_id no mesmo pixel e bloqueado');
ok((await jaEnviado(PIXEL_B, 'Purchase', 'evt_1')) === false, 'outro pixel ainda pode receber (multi-marca)');
ok((await jaEnviado(PIXEL_A, 'Lead', 'evt_1')) === false, 'outro evento do mesmo comprador nao e bloqueado');
ok((await jaEnviado(PIXEL_A, 'Purchase', undefined)) === false, 'sem event_id nao bloqueia');

// O indice se reconstroi do disparos.jsonl: so linhas que a Meta aceitou contam.
_limparCache();
fs.writeFileSync(
  path.join(tmp, 'logs', 'disparos.jsonl'),
  [
    JSON.stringify({ pixelId: PIXEL_A, eventName: 'Purchase', eventId: 'evt_aceito', httpStatus: 200, eventsReceived: 1 }),
    JSON.stringify({ pixelId: PIXEL_A, eventName: 'Purchase', eventId: 'evt_recusado', httpStatus: 400, eventsReceived: 0 }),
    '{linha corrompida',
  ].join('\n') + '\n',
  'utf8'
);
ok((await jaEnviado(PIXEL_A, 'Purchase', 'evt_aceito')) === true, 'reconstroi o indice do log de disparos');
ok((await jaEnviado(PIXEL_A, 'Purchase', 'evt_recusado')) === false, 'evento recusado pela Meta pode ser reenviado');

/* ---------------- 3. Modo teste fora do dedup (C8, D12) ---------------- */

console.log('\n  Modo teste fora do dedup (C8, D12)\n');

const PIXEL_T = '5555555555555';
const ARQ_LOG = path.join(tmp, 'logs', 'disparos.jsonl');

// 3a. O indice relido do disco: teste fica fora; real e linha antiga entram.
_limparCache();
fs.writeFileSync(
  ARQ_LOG,
  [
    JSON.stringify({ pixelId: PIXEL_T, eventName: 'Purchase', eventId: 'evt_so_teste', orderId: 'ped_so_teste', httpStatus: 200, eventsReceived: 1, modoTeste: true }),
    JSON.stringify({ pixelId: PIXEL_T, eventName: 'Purchase', eventId: 'evt_real', orderId: 'ped_real', httpStatus: 200, eventsReceived: 1, modoTeste: false }),
    // Gravada antes da C8: sem o campo. Conta como envio real (P6).
    JSON.stringify({ pixelId: PIXEL_T, eventName: 'Purchase', eventId: 'evt_antigo', orderId: 'ped_antigo', httpStatus: 200, eventsReceived: 1 }),
    // Em teste e sem pixel: nem o curinga de leitura (pixel vazio) pode nascer dela.
    JSON.stringify({ eventName: 'Purchase', eventId: 'evt_teste_sem_pixel', httpStatus: 200, eventsReceived: 1, modoTeste: true }),
  ].join('\n') + '\n',
  'utf8'
);
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', 'evt_so_teste')) === false,
  '🔴 C8-1: linha 200 com modoTeste: true NAO entra no indice (jaEnviado = false)'
);
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', { orderId: 'ped_so_teste' })) === false,
  '🔴 C8-1: nem pela chave do pedido'
);
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', 'evt_teste_sem_pixel')) === false,
  'C8-1: linha de teste sem pixel tambem fica fora (o curinga de leitura nao nasce dela)'
);
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', 'evt_real')) === true &&
    (await jaEnviado(PIXEL_T, 'Purchase', { orderId: 'ped_real' })) === true,
  'C8-2: linha 200 com modoTeste: false continua bloqueando (evento e pedido)'
);
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', 'evt_antigo')) === true &&
    (await jaEnviado(PIXEL_T, 'Purchase', { orderId: 'ped_antigo' })) === true,
  'C8-3: linha antiga sem o campo continua bloqueando (compat P6)'
);

// 3b. marcarEnviado: o envio em teste nao marca nada; o real marca.
const idTeste = { eventId: 'evt_m_teste', orderId: 'ped_m_teste' };
await marcarEnviado(PIXEL_T, 'Purchase', idTeste, { modoTeste: true });
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', idTeste)) === false,
  '🔴 C8-4: marcarEnviado com { modoTeste: true } NAO faz jaEnviado devolver true'
);
const idSoDigital = {
  email: 'comprador.c8@dominio-ficticio.com.br',
  valor: 97,
  eventTime: Math.floor(Date.now() / 1000),
};
await marcarEnviado(PIXEL_T, 'Purchase', idSoDigital, { modoTeste: true });
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', idSoDigital)) === false,
  '🔴 C8-4: nem pela impressao digital (sem event_id e sem pedido)'
);
await marcarEnviado(PIXEL_T, 'Purchase', idTeste);
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', idTeste)) === true,
  'C8-5: o envio real depois do teste (sem a opcao) marca, e o proximo e bloqueado'
);
await marcarEnviado(PIXEL_T, 'Purchase', 'evt_m_real', { modoTeste: false });
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', 'evt_m_real')) === true,
  'C8-5: com { modoTeste: false } tambem marca'
);

// 3c. registrarDisparo grava o campo, e o indice relido o respeita.
_limparCache();
fs.writeFileSync(ARQ_LOG, '', 'utf8');
const semAtribuicao = { campaignId: '', adsetId: '', adId: '', placement: '', utms: {}, links: {}, faltando: [] };
const baseLog = {
  eventName: 'Purchase',
  eventTime: Math.floor(Date.now() / 1000),
  httpStatus: 200,
  eventsReceived: 1,
  temFbc: false,
  temFbp: false,
  atribuicao: semAtribuicao,
  pixelId: PIXEL_T,
  marcaId: 'marca_c8_falsa',
};
await registrarDisparo({ ...baseLog, eventId: 'evt_reg_teste', orderId: 'ped_reg_teste', modoTeste: true });
await registrarDisparo({ ...baseLog, eventId: 'evt_reg_real', orderId: 'ped_reg_real', modoTeste: false });
// Um chamador em JS cru que esqueca o campo (o tipo o exige em TS): a linha nova
// sai com `modoTeste: false`, e "sem o campo" fica significando so "antes da C8".
await registrarDisparo({ ...baseLog, eventId: 'evt_reg_sem_campo' });
const linhasLog = fs.readFileSync(ARQ_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const porId = Object.fromEntries(linhasLog.map((l) => [l.eventId, l]));
ok(
  linhasLog.length === 3 &&
    porId.evt_reg_teste?.modoTeste === true &&
    porId.evt_reg_real?.modoTeste === false,
  'C8-6: registrarDisparo grava modoTeste na linha JSON (true e false)',
  `linhas=${linhasLog.length}`
);
ok(
  porId.evt_reg_sem_campo?.modoTeste === false,
  '🔴 C8-6: toda linha nova traz o campo (sem ele no chamador, grava false = envio real)',
  `modoTeste=${JSON.stringify(porId.evt_reg_sem_campo?.modoTeste)}`
);
_limparCache();
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', 'evt_reg_teste')) === false,
  '🔴 C8-6: o envio em teste que registrarDisparo gravou nao bloqueia depois de reiniciar (indice relido do disco)'
);
ok(
  (await jaEnviado(PIXEL_T, 'Purchase', 'evt_reg_real')) === true,
  'C8-6: o real gravado bloqueia depois de reiniciar'
);

ok(globalThis.fetch === fetchRecusado, 'o fetch trancado continua no lugar');
ok(chamadasDeRede.length === 0, 'nenhuma chamada de rede', `chamadas=${chamadasDeRede.length}`);

process.chdir(raiz);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(falhas === 0 ? '\n  Atribuicao herdada e dedup travando certo.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
