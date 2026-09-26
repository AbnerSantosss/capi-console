#!/usr/bin/env node
/**
 * Contagem por comprador pelo hash do e-mail inteiro (C7, D1) — 24/09/2026.
 *
 * O defeito: a desconfiança "este e-mail já comprou N vezes" contava pelo
 * e-mail MASCARADO (`ma***@gmail.com`). Duas letras e o domínio não são uma
 * pessoa: `maria@gmail.com`, `marta@gmail.com` e `mauro@gmail.com` viram a
 * mesma máscara, e a terceira compra de gente DIFERENTE travava o automático
 * como se fosse alguém martelando o checkout. Com o limite padrão (3), a
 * primeira compra do Mauro já ficava na fila por "e-mail repetido".
 *
 * O que cada bloco prova:
 *
 *   A  `hashDoEmail`: SHA-256 do e-mail em minúsculas e sem espaço nas pontas;
 *      sem "@" não é e-mail e não conta (a mesma porta da máscara)
 *   B  `contarComprasDoEmail` conta pelo hash: maria = 2 (e não 4, que é o que
 *      a máscara dava), marcos = 1; entrada antiga sem hash fica de fora; a
 *      contagem continua separada por empresa
 *   C  o hash NUNCA sai para a tela: `listarEntradas`, `acharEntrada`,
 *      `registrarEntrada`, `marcarStatus`, `anotarResultado` e o ouvinte do
 *      `assinar` (que é o SSE) devolvem o item sem `emailHash` — e a memória
 *      continua com ele (a contagem não pode perder a chave)
 *   D  o recebimento de verdade (`processarWebhook`), sem rede: três pessoas
 *      com a mesma máscara não viram "a mesma"; a terceira compra da MESMA
 *      pessoa ainda levanta a suspeita, com a explicação nova; o hash vai para
 *      o disco (sobrevive a reinício) e a contagem volta igual depois dele
 *   E  as rotas: GET /api/inbox (lista e ?id=), PATCH /api/inbox e o SSE
 *      (/api/webhook/stream, "inicial", "entrada" e "atualizado") sem `emailHash`
 *   F  a explicação de `email-repetido` não diz mais "comprador real compra uma
 *      vez" e diz que a venda continua na fila e pode ser enviada
 *   G  a tag do site também grava o hash (estático)
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/: ele anota a URL e LANÇA sempre — em graph.facebook.com, em
 * api.cloudflare.com e em qualquer outra. Nenhuma compra aqui está em modo
 * automático, então nada deveria nem tentar sair. Sem ACCESS_TOKEN nem
 * PIXEL_ID do ambiente, e tudo roda num diretório temporário: o `config/` e o
 * `logs/` reais nunca são abertos. Os e-mails são fictícios e só existem aqui.
 *
 * Roda SEM `--conditions=react-server`, como `rotas-api.test.mjs`: o
 * recebimento arrasta auto-dispatch → meta-capi → meta-events → ícones.
 *
 * Uso: npm run test:contagem-por-email
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

/** Só a URL de cada chamada; nada do corpo é guardado nem impresso. */
const chamadas = [];
const fetchFalso = async (entrada) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  chamadas.push(url);
  if (/graph\.facebook\.com/i.test(url)) throw new Error('graph.facebook.com bloqueado pelo teste');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('api.cloudflare.com bloqueado pelo teste');
  throw new Error('rede bloqueada pelo teste');
};
globalThis.fetch = fetchFalso;

/* Credenciais de mentira ANTES de carregar sessao.ts, que lê o ambiente no import. */
process.env.CONSOLE_USER = 'admin';
process.env.CONSOLE_PASSWORD = 'senha-super-segura-com-mais-de-12-chars';
process.env.SESSION_SECRET = 'segredo-de-sessao-muito-seguro-com-mais-de-32-caracteres-para-teste';
/* Nada do .env: sem token e sem Pixel, nada tem como sair daqui para a Meta. */
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-contagem-email-'));
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raizAnterior = process.cwd();
// config-store.ts e inbox.ts resolvem `<cwd>/config` e `<cwd>/logs` no import.
// A troca de diretório vem ANTES de qualquer import, senão o teste escreveria
// na configuração e no histórico reais.
process.chdir(tmp);

const ARQ_INBOX = path.join(tmp, 'logs', 'inbox.jsonl');

/** O mesmo cálculo que o console tem de fazer, escrito aqui à parte para conferir. */
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/**
 * Uma entrada ANTIGA, gravada antes desta correção: tem a máscara de Maria e
 * é compra, mas não tem `emailHash`. Nenhuma linha antiga é migrada, então ela
 * tem de ficar FORA da contagem por comprador.
 */
const ANTIGA = {
  id: '00000000-0000-4000-8000-00000000c7a1',
  recebidoEm: '2026-09-01T12:00:00.000Z',
  origem: 'webhook',
  empresaId: 'emp_unidade',
  evento: 'Purchase',
  eventoMeta: 'Purchase',
  emailMascarado: 'ma***@gmail.com',
  temFbc: false,
  temFbp: false,
  temFbclid: false,
  temGclid: false,
  temTtclid: false,
  temMsclkid: false,
  status: 'novo',
  payload: { event: 'purchase_approved' },
};
fs.writeFileSync(ARQ_INBOX, JSON.stringify(ANTIGA) + '\n', 'utf8');

const { NextRequest } = await import('next/server.js');
const { assinarSessao, COOKIE_SESSAO } = await import(
  new URL('../src/lib/sessao.ts', import.meta.url).href
);
const cfgStore = await import(new URL('../src/lib/config-store.ts', import.meta.url).href);
const inbox = await import(new URL('../src/lib/inbox.ts', import.meta.url).href);
const deteccao = await import(new URL('../src/lib/deteccao-de-teste.ts', import.meta.url).href);
const { processarWebhook } = await import(
  new URL('../src/lib/webhook-handler.ts', import.meta.url).href
);
const rotaInbox = await import(new URL('../src/app/api/inbox/route.ts', import.meta.url).href);
const rotaStream = await import(
  new URL('../src/app/api/webhook/stream/route.ts', import.meta.url).href
);

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
 * de qualquer recebimento — continuar seria arriscar uma chamada de verdade.
 */
function exigirFetchFalso() {
  if (globalThis.fetch !== fetchFalso) {
    console.error('  FALHA  o fetch falso foi trocado por outro: o teste para antes de qualquer envio.');
    encerrar(1);
  }
}
exigirFetchFalso();

/** Sem a função (antes da correção), cada pergunta abaixo falha em vez de derrubar a suíte. */
const temHashDoEmail = typeof inbox.hashDoEmail === 'function';
const hashDoEmail = temHashDoEmail ? inbox.hashDoEmail : () => undefined;
const contar = (hash, empresaId) =>
  hash ? inbox.contarComprasDoEmail(hash, empresaId) : Promise.resolve(0);
const vazaHash = (x) => JSON.stringify(x ?? null).includes('"emailHash"');

console.log('\n  Contagem por comprador pelo hash do e-mail inteiro (C7, D1)\n');

/* ================================================================== */
/* A — hashDoEmail                                                     */
/* ================================================================== */
console.log('  A. hashDoEmail');

ok(temHashDoEmail, '🔴 A1: inbox.ts exporta hashDoEmail');
ok(
  hashDoEmail('maria@gmail.com') === sha256('maria@gmail.com'),
  'A2: é o SHA-256 (hex) do e-mail',
  String(hashDoEmail('maria@gmail.com')).slice(0, 12)
);
ok(
  hashDoEmail('  Maria@Gmail.COM ') === sha256('maria@gmail.com'),
  'A3: minúsculas e sem espaço nas pontas antes do hash (" Maria@Gmail.COM " = "maria@gmail.com")'
);
ok(/^[0-9a-f]{64}$/.test(String(hashDoEmail('maria@gmail.com'))), 'A4: 64 caracteres hexadecimais');
ok(
  hashDoEmail(undefined) === undefined && hashDoEmail('') === undefined && hashDoEmail('   ') === undefined,
  'A5: sem e-mail, sem hash'
);
ok(
  temHashDoEmail && hashDoEmail('sem-arroba') === undefined && hashDoEmail('n/a') === undefined,
  'A6: valor sem "@" não é e-mail e não vira chave (a mesma porta da máscara: "n/a" de várias pessoas não soma)'
);
ok(
  hashDoEmail('maria@gmail.com') !== hashDoEmail('marta@gmail.com'),
  'A7: pessoas diferentes, hashes diferentes'
);

/* ================================================================== */
/* B e C — a contagem e o que sai para a tela, direto na caixa         */
/* ================================================================== */
console.log('\n  B. contarComprasDoEmail pelo hash');

const ouvidos = [];
const cancelarOuvinte = inbox.assinar((item, tipo) => ouvidos.push({ tipo, json: JSON.stringify(item) }));

/**
 * Compra como o recebimento grava agora: máscara E hash. O hash é calculado
 * aqui à parte (sha256), e não por `hashDoEmail`, para as provas de "não sai
 * para a tela" valerem mesmo antes de a função existir.
 */
const compraNaCaixa = (email, empresaId = 'emp_unidade') =>
  inbox.registrarEntrada({
    origem: 'webhook',
    empresaId,
    evento: 'Purchase',
    eventoMeta: 'Purchase',
    eventoOrigem: 'purchase_approved',
    emailMascarado: inbox.mascararEmail(email),
    emailHash: sha256(email.trim().toLowerCase()),
    temFbc: false,
    temFbp: false,
    payload: { event: 'purchase_approved', data: { lead: { email } } },
    modo: 'fila',
  });

// maria, marta e mauro: 5 letras, a MESMA máscara `ma***@gmail.com`.
// marcos e mateus: 6 letras, a mesma máscara `ma****@gmail.com`.
// (O plano citava maria, marcos e mateus como "mesma máscara"; não são — a
// máscara repete `*` pelo tamanho do nome. Marta e Mauro fazem a colisão real.)
const registradas = [];
for (const email of [
  'maria@gmail.com',
  'marta@gmail.com',
  'mauro@gmail.com',
  'marcos@gmail.com',
  'mateus@gmail.com',
  'maria@gmail.com',
]) {
  registradas.push(await compraNaCaixa(email));
}
// A mesma Maria comprando numa OUTRA empresa não soma na primeira.
await compraNaCaixa('maria@gmail.com', 'emp_outra');

const todasDaUnidade = (await inbox.listarEntradas(1000, 'emp_unidade')).filter((i) => i.eventoMeta === 'Purchase');
const mesmaMascara = todasDaUnidade.filter((i) => i.emailMascarado === 'ma***@gmail.com').length;
ok(
  mesmaMascara === 5,
  'B0: controle — a máscara `ma***@gmail.com` junta 5 compras nesta empresa (Maria 2x, Marta, Mauro e a antiga)',
  `(${mesmaMascara})`
);

const nMaria = await contar(hashDoEmail('maria@gmail.com'), 'emp_unidade');
ok(nMaria === 2, '🔴 B1: contarComprasDoEmail(hash de maria) = 2, e não 4 (nem 5 com a antiga)', `n=${nMaria}`);
const nMarcos = await contar(hashDoEmail('marcos@gmail.com'), 'emp_unidade');
ok(nMarcos === 1, '🔴 B2: marcos = 1 (mateus tem a mesma máscara e não conta)', `n=${nMarcos}`);
const nMauro = await contar(hashDoEmail('mauro@gmail.com'), 'emp_unidade');
ok(nMauro === 1, 'B3: mauro = 1', `n=${nMauro}`);
const nMariaTodas = await contar(hashDoEmail('maria@gmail.com'));
ok(
  nMariaTodas === 3,
  'B4: sem empresa, conta as 3 compras de Maria (2 + 1 da outra empresa); a antiga, sem hash, fica fora',
  `n=${nMariaTodas}`
);
ok(
  (await contar(hashDoEmail('maria@gmail.com'), 'emp_outra')) === 1,
  'B5: na outra empresa, só a compra de lá'
);
ok(
  temHashDoEmail && (await inbox.contarComprasDoEmail(undefined, 'emp_unidade')) === 0,
  'B6: sem hash, contagem zero'
);
ok(
  temHashDoEmail && (await inbox.contarComprasDoEmail('ma***@gmail.com', 'emp_unidade')) === 0,
  '🔴 B7: a máscara não serve mais de chave (nenhum item tem máscara como hash)'
);

console.log('\n  C. o hash nunca sai para a tela');

ok(!vazaHash(registradas), '🔴 C1: registrarEntrada devolve o item sem emailHash');
const lista = await inbox.listarEntradas(1000);
ok(lista.length >= 8, 'C2: controle — a lista tem as compras registradas', `itens=${lista.length}`);
ok(!vazaHash(lista), '🔴 C3: JSON.stringify(await listarEntradas()) não contém emailHash');
ok(
  !vazaHash(await inbox.listarEntradas(50, 'emp_unidade')),
  'C4: nem a lista filtrada por empresa'
);
const achado = await inbox.acharEntrada(registradas[0].id);
ok(achado?.id === registradas[0].id, 'C5: controle — acharEntrada acha o item');
ok(!vazaHash(achado), '🔴 C6: JSON.stringify(await acharEntrada(id)) não contém emailHash');
const marcado = await inbox.marcarStatus(registradas[1].id, 'carregado');
ok(marcado?.status === 'carregado', 'C7: controle — marcarStatus muda o status');
ok(!vazaHash(marcado), '🔴 C8: o item devolvido por marcarStatus (que o PATCH devolve) não tem emailHash');
const anotado = await inbox.anotarResultado(registradas[2].id, [{ marcaId: 'default', status: 'fila' }]);
ok(Array.isArray(anotado?.resultados), 'C9: controle — anotarResultado guarda o resultado');
ok(!vazaHash(anotado), '🔴 C10: nem o devolvido por anotarResultado');
ok(
  ouvidos.some((o) => o.tipo === 'novo') && ouvidos.some((o) => o.tipo === 'atualizado'),
  'C11: controle — o ouvinte recebeu "novo" e "atualizado"',
  `(${ouvidos.length} avisos)`
);
ok(
  ouvidos.length > 0 && ouvidos.every((o) => !o.json.includes('"emailHash"')),
  '🔴 C12: o ouvinte registrado por assinar (o SSE) recebe o item sem emailHash'
);
ok(
  (await contar(hashDoEmail('maria@gmail.com'), 'emp_unidade')) === 2,
  '🔴 C13: depois de listar, achar e marcar, a contagem continua 2 (a cópia da tela não apagou o hash da memória)'
);
cancelarOuvinte();

/* ================================================================== */
/* D — o recebimento de verdade, sem rede                              */
/* ================================================================== */
console.log('\n  D. processarWebhook (empresa padrão, limite padrão de 3 compras)');

const cfgPadrao = await cfgStore.lerIntegracoes();
const regraCompra = cfgStore.acharRegra(cfgPadrao, 'purchase_approved');
ok(
  regraCompra?.modo === 'fila',
  'D0: controle — a regra de purchase_approved está em fila (nada sai sozinho neste teste)',
  String(regraCompra?.modo)
);
/* O segredo de entrada é falso (nasceu agora, no diretório temporário) e não é impresso. */
const SEGREDO = cfgPadrao.entrada.segredo;

let seq = 0;
async function receberCompra(email, nome) {
  seq += 1;
  const agora = new Date().toISOString();
  const corpo = JSON.stringify({
    event: 'purchase_approved',
    event_id: `evt_c7_${seq}_${Date.now()}`,
    created_at: agora,
    data: {
      purchase_id: `compra-c7-${seq}`,
      order_id: `pedido-c7-${seq}`,
      product: { name: 'Produto C7' },
      amount: 4990,
      currency: 'BRL',
      buyer: { external_id: `comprador-c7-${seq}` },
      approved_at: agora,
      lead: { email, name: nome, phone: '11988887777' },
    },
  });
  const antes = chamadas.length;
  const res = await processarWebhook(
    new NextRequest('http://localhost:3333/api/webhook/in', {
      method: 'POST',
      headers: {
        'x-capi-secret': SEGREDO,
        'content-type': 'application/json',
        'user-agent': 'xWinner-Webhook/1.0 (teste C7)',
      },
      body: corpo,
    })
  );
  const json = await res.json().catch(() => ({}));
  const item = json.id ? await inbox.acharEntrada(json.id) : undefined;
  const graph = chamadas.slice(antes).filter((u) => /graph\.facebook\.com|api\.cloudflare\.com/i.test(u));
  return { status: res.status, json, item, graph };
}

const r1 = await receberCompra('maria@gmail.com', 'Maria Aparecida Souza');
ok(r1.status === 202 && r1.item?.eventoMeta === 'Purchase', 'D1: controle — a compra de Maria entra (202, Purchase)', `status=${r1.status}`);
ok(r1.item?.autoBloqueadoPorSuspeita !== true, 'D1: 1ª compra de Maria, sem suspeita');

const r2 = await receberCompra('marta@gmail.com', 'Marta Ribeiro Lima');
ok(r2.item?.autoBloqueadoPorSuspeita !== true, 'D2: Marta (mesma máscara), sem suspeita');

const r3 = await receberCompra('mauro@gmail.com', 'Mauro Pereira Dias');
ok(
  r3.item?.autoBloqueadoPorSuspeita !== true && r3.item?.motivoDeTeste !== 'email-repetido',
  '🔴 D3: a 1ª compra de Mauro NÃO vira "e-mail repetido" (pela máscara eram 3 e travava)',
  `motivo=${r3.item?.motivoDeTeste ?? '-'}`
);
ok(r3.json.autoBloqueadoPorSuspeita !== true, 'D3: e a resposta do webhook não diz que o automático foi barrado');

const r4 = await receberCompra('maria@gmail.com', 'Maria Aparecida Souza');
ok(
  r4.item?.autoBloqueadoPorSuspeita !== true,
  '🔴 D4: 2ª compra de Maria, sem suspeita (conta 2; pela máscara eram 4)',
  `motivo=${r4.item?.motivoDeTeste ?? '-'}`
);

const r5 = await receberCompra('Maria@Gmail.com ', 'Maria Aparecida Souza');
ok(
  r5.item?.autoBloqueadoPorSuspeita === true && r5.item?.motivoDeTeste === 'email-repetido',
  '🔴 D5: a 3ª compra da MESMA Maria (com maiúsculas e espaço) ainda levanta a suspeita',
  `motivo=${r5.item?.motivoDeTeste ?? '-'}`
);
ok(r5.item?.testeInterno !== true, 'D5: suspeita não vira teste: a venda continua valendo');
ok(
  r5.json.autoBloqueadoPorSuspeita === true && r5.json.motivoDeTeste === 'email-repetido',
  'D5: e a resposta do webhook conta que o automático ficou em espera'
);
ok(
  typeof r5.item?.explicacaoDeTeste === 'string' && !r5.item.explicacaoDeTeste.includes('compra uma vez'),
  '🔴 D6: a explicação gravada no item não diz "comprador real compra uma vez"',
  JSON.stringify(r5.item?.explicacaoDeTeste ?? '')
);
ok(
  /continua na fila e pode ser enviada/.test(r5.item?.explicacaoDeTeste ?? ''),
  'D7: e diz que a venda continua na fila e pode ser enviada'
);
ok(
  [r1, r2, r3, r4, r5].every((r) => !vazaHash(r.json)),
  'D8: a resposta do webhook não leva o hash'
);

// O que foi para o disco: o hash tem de estar lá, senão a contagem se perde no
// primeiro reinício do container.
const linhasDisco = fs
  .readFileSync(ARQ_INBOX, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const noDisco = (id) => linhasDisco.find((l) => l.id === id);
ok(
  noDisco(r1.json.id)?.emailHash === sha256('maria@gmail.com') &&
    noDisco(r5.json.id)?.emailHash === sha256('maria@gmail.com'),
  '🔴 D9: o recebimento grava emailHash junto da máscara (o mesmo para "Maria@Gmail.com ")'
);
ok(
  noDisco(r3.json.id)?.emailHash === sha256('mauro@gmail.com') &&
    noDisco(r3.json.id)?.emailMascarado === 'ma***@gmail.com',
  'D10: a máscara continua gravada ao lado, para a tela'
);
ok(noDisco(ANTIGA.id)?.emailHash === undefined, 'D11: a linha antiga não foi migrada (continua sem hash)');
ok(
  [r1, r2, r3, r4, r5].every((r) => r.graph.length === 0),
  '🔴 D12: nenhuma chamada a graph.facebook.com nem a api.cloudflare.com durante os recebimentos'
);

// "Reinício": uma instância nova do módulo lê a caixa do disco do zero.
let recarregado = null;
try {
  recarregado = await import(new URL('../src/lib/inbox.ts?reinicio=c7', import.meta.url).href);
} catch (e) {
  console.log('  (não deu para carregar uma segunda instância do módulo: ' + (e?.message ?? e) + ')');
}
ok(
  Boolean(recarregado) &&
    typeof recarregado.contarComprasDoEmail === 'function' &&
    (await recarregado.contarComprasDoEmail(sha256('maria@gmail.com'), 'default')) === 3,
  'D13: depois de um reinício (módulo novo lendo o disco), Maria continua com 3 compras na empresa padrão'
);
ok(
  Boolean(recarregado) && !vazaHash(await recarregado.listarEntradas(1000)),
  'D14: e o que vem do disco também sai limpo para a tela'
);

/* ================================================================== */
/* E — as rotas que entregam o item à tela                             */
/* ================================================================== */
console.log('\n  E. rotas: GET/PATCH /api/inbox e o SSE');

const COOKIE = `${COOKIE_SESSAO}=${assinarSessao('admin', 12)}`;
const pedido = (caminho, { metodo = 'GET', corpo } = {}) => {
  const headers = { cookie: COOKIE };
  const init = { method: metodo, headers };
  if (corpo !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(corpo);
  }
  return new NextRequest('http://localhost:3333' + caminho, init);
};

const resLista = await rotaInbox.GET(pedido('/api/inbox?limite=1000'));
const txtLista = await resLista.text();
ok(resLista.status === 200 && txtLista.includes(r1.json.id), 'E1: controle — GET /api/inbox devolve as compras', `status=${resLista.status}`);
ok(!txtLista.includes('emailHash'), '🔴 E2: GET /api/inbox (lista) sem emailHash');

const resUm = await rotaInbox.GET(pedido('/api/inbox?id=' + encodeURIComponent(r5.json.id)));
const txtUm = await resUm.text();
ok(resUm.status === 200 && txtUm.includes(r5.json.id), 'E3: controle — GET /api/inbox?id= acha o item', `status=${resUm.status}`);
ok(!txtUm.includes('emailHash'), '🔴 E4: GET /api/inbox?id= sem emailHash');

/** Lê o SSE até o padrão aparecer, com teto de tempo: um canal mudo não pode travar a suíte. */
const decodificador = new TextDecoder();
async function lerAte(leitor, acumulado, padrao, ms = 5000) {
  const limite = Date.now() + ms;
  while (!padrao.test(acumulado.txt)) {
    const resta = limite - Date.now();
    if (resta <= 0) return false;
    const r = await Promise.race([
      leitor.read(),
      new Promise((res) => setTimeout(() => res({ esgotou: true }), resta)),
    ]);
    if (r.esgotou) return false;
    if (r.done) return padrao.test(acumulado.txt);
    acumulado.txt += decodificador.decode(r.value, { stream: true });
  }
  return true;
}

const resSse = await rotaStream.GET(pedido('/api/webhook/stream'));
ok(
  resSse.status === 200 && (resSse.headers.get('content-type') ?? '').includes('text/event-stream'),
  'E5: controle — o SSE abre',
  `status=${resSse.status}`
);
const leitor = resSse.body.getReader();
const sse = { txt: '' };
const veioInicial = await lerAte(leitor, sse, /event: inicial\ndata: [^\n]*\n\n/);
ok(veioInicial && sse.txt.includes(r1.json.id), 'E6: controle — o SSE manda a lista "inicial" com as compras');
ok(!sse.txt.includes('emailHash'), '🔴 E7: a lista "inicial" do SSE sem emailHash');

const aoVivo = await receberCompra('marcos@gmail.com', 'Marcos Antunes Rocha');
const veioEntrada = await lerAte(leitor, sse, new RegExp(`event: entrada\\ndata: [^\\n]*${aoVivo.json.id}[^\\n]*\\n\\n`));
ok(veioEntrada, 'E8: controle — a compra nova chega ao vivo pelo SSE ("entrada")');
const linhaAoVivo = fs
  .readFileSync(ARQ_INBOX, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .find((l) => l.id === aoVivo.json.id);
ok(linhaAoVivo?.emailHash === sha256('marcos@gmail.com'), 'E9: controle — e ela tem hash no disco');

const resPatch = await rotaInbox.PATCH(
  pedido('/api/inbox', { metodo: 'PATCH', corpo: { id: aoVivo.json.id, status: 'carregado' } })
);
const txtPatch = await resPatch.text();
ok(resPatch.status === 200 && txtPatch.includes('carregado'), 'E10: controle — PATCH /api/inbox muda o status', `status=${resPatch.status}`);
ok(!txtPatch.includes('emailHash'), '🔴 E11: a resposta do PATCH /api/inbox sem emailHash');

const veioAtualizado = await lerAte(leitor, sse, new RegExp(`event: atualizado\\ndata: [^\\n]*${aoVivo.json.id}[^\\n]*\\n\\n`));
ok(veioAtualizado, 'E12: controle — a mudança de status chega ao vivo ("atualizado")');
ok(!sse.txt.includes('emailHash'), '🔴 E13: nenhum evento do SSE ("inicial", "entrada", "atualizado") leva emailHash');
await leitor.cancel().catch(() => {});

/* ================================================================== */
/* F — a explicação de email-repetido                                  */
/* ================================================================== */
console.log('\n  F. explicação da suspeita por e-mail repetido');

const veredito = deteccao.avaliarTeste({
  email: 'comprador@loja-ficticia.invalid',
  ehCompra: true,
  comprasDoMesmoEmail: 3,
});
ok(veredito.motivo === 'email-repetido' && veredito.bloqueiaAutomatico && !veredito.ehTeste, 'F1: controle — 3 compras do mesmo e-mail é suspeita, não teste');
ok(
  !String(veredito.explicacao).includes('compra uma vez'),
  '🔴 F2: a explicação não contém "compra uma vez"',
  JSON.stringify(veredito.explicacao ?? '')
);
ok(
  veredito.explicacao ===
    'Este e-mail já aparece em 3 compras. O envio automático ficou em espera para você conferir; a venda continua na fila e pode ser enviada.',
  'F3: é a frase do plano, com o número de compras'
);
ok(
  deteccao.avaliarTeste({ email: 'x@loja-ficticia.invalid', ehCompra: true, comprasDoMesmoEmail: 5 }).explicacao?.includes('em 5 compras'),
  'F4: o número acompanha a contagem'
);

/* ================================================================== */
/* G — a tag do site (estático)                                        */
/* ================================================================== */
console.log('\n  G. tag do site');

const fonteTag = fs.readFileSync(
  fileURLToPath(new URL('../src/lib/tag-handler.ts', import.meta.url)),
  'utf8'
);
ok(/import\s*\{[^}]*\bhashDoEmail\b[^}]*\}\s*from\s*'@\/lib\/inbox'/.test(fonteTag), 'G1: tag-handler importa hashDoEmail da caixa');
ok(/emailHash:\s*hashDoEmail\(/.test(fonteTag), '🔴 G2: o item da tag grava emailHash junto da máscara');

const fonteWebhook = fs.readFileSync(
  fileURLToPath(new URL('../src/lib/webhook-handler.ts', import.meta.url)),
  'utf8'
);
ok(!/contarComprasDoEmail\(\s*emailMascarado/.test(fonteWebhook), 'G3: o webhook não conta mais pela máscara');
const fonteInbox = fs.readFileSync(fileURLToPath(new URL('../src/lib/inbox.ts', import.meta.url)), 'utf8');
ok(!/from\s+'\.\/meta-capi'|from\s+'@\/lib\/meta-capi'/.test(fonteInbox), 'G4: inbox.ts não importa meta-capi.ts (arquivo do P0)');

/* ================================================================== */
/* Rede                                                                */
/* ================================================================== */
exigirFetchFalso();
const proibidas = chamadas.filter((u) => /graph\.facebook\.com|api\.cloudflare\.com/i.test(u));
ok(proibidas.length === 0, '🔴 R1: nenhuma chamada a graph.facebook.com nem a api.cloudflare.com', `(${chamadas.length} tentativa(s) de rede no total, todas recusadas)`);

console.log(falhas ? `\n  ${falhas} falha(s).\n` : '\n  Tudo certo.\n');
encerrar(falhas ? 1 : 0);
