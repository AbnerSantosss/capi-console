#!/usr/bin/env node
/**
 * Disparo por empresa (F1) e IP do visitante (F8) — auditoria de 23/09/2026.
 *
 * F1: com uma empresa não padrão ativa, o disparo manual levava o Pixel
 * `default` (do Código Vencedor) marcado e ESCONDIDO, e o servidor aceitava a
 * lista como viesse: a venda de um cliente saía no Pixel do dono. Conversão
 * enviada ao Pixel errado não volta atrás. Este arquivo prova as barreiras do
 * servidor com os handlers de verdade — nada da lógica é copiado para cá:
 *
 *   A  POST /api/inbox/disparar recusa (400) todo Pixel que não seja da
 *      empresa DO ITEM, ANTES do primeiro envio: nenhuma chamada sai, nem para
 *      o Pixel certo que veio junto. O recuo para `default` é só da empresa
 *      padrão; item de outra empresa sem Pixel é 400 pedindo a escolha
 *   B  item da empresa B com o Pixel da própria B segue e envia
 *   C  item da empresa padrão com `default` segue igual a antes
 *   D  `dispararItem` — que o AUTOMÁTICO também usa, sem passar pela rota —
 *      descarta Pixel de outra empresa, grava o motivo no item e nunca envia;
 *      para a empresa padrão o resultado é o mesmo de antes
 *   E  `ipDoVisitante` prefere CF-Connecting-IP ao X-Forwarded-For (F8)
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/: ele só anota a URL (o corpo leva o access_token, e não é
 * guardado nem impresso) e responde como a Meta responderia. URL que não seja
 * da Graph API é recusada e reprova o teste. Tokens e Pixels abaixo são falsos,
 * e tudo roda num diretório temporário: nenhum evento sai daqui, real ou não.
 *
 * Roda SEM `--conditions=react-server`, como `rotas-api.test.mjs`: carregar o
 * route.ts arrasta meta-capi → meta-events → lucide-react.
 *
 * Uso: npm run test:disparo-empresa
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

const GRAPH = /^https:\/\/graph\.facebook\.com\/[^/]+\/([^/]+)\/events$/;
/** Só a URL de cada chamada. O corpo leva o access_token: não é guardado nem impresso. */
const chamadas = [];
const fetchFalso = async (entrada) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  chamadas.push(url);
  if (!GRAPH.test(url)) throw new Error('rede bloqueada pelo teste');
  return new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'falso-local' }), {
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-disparo-empresa-'));
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raizAnterior = process.cwd();
// config-store.ts, inbox.ts, dedup.ts e companhia resolvem os caminhos no import.
process.chdir(tmp);

/**
 * Dois Pixels falsos, um de cada empresa. O `default` com o Switch do
 * automático LIGADO, como em produção desde 13/09: é o cenário em que o
 * automático de um cliente teria vazado para o Pixel do dono.
 */
const PIXEL_DONO = '111111111111111';
const PIXEL_B = '222222222222222';
fs.writeFileSync(
  path.join(tmp, 'config', 'marcas.json'),
  JSON.stringify(
    [
      {
        id: 'default',
        nome: 'Pixel do dono (falso)',
        pixelId: PIXEL_DONO,
        accessToken: 'token-falso-do-dono',
        testCode: '',
        autoDisparo: true,
      },
      {
        id: 'pixel_b',
        nome: 'Pixel da empresa B (falso)',
        pixelId: PIXEL_B,
        accessToken: 'token-falso-da-b',
        testCode: '',
        autoDisparo: true,
        empresaId: 'emp_b',
      },
    ],
    null,
    2
  ),
  'utf8'
);

const { NextRequest } = await import('next/server.js');
const { assinarSessao, COOKIE_SESSAO } = await import(
  new URL('../src/lib/sessao.ts', import.meta.url).href
);
const registro = await import(new URL('../src/lib/empresas.ts', import.meta.url).href);
const cfgStore = await import(new URL('../src/lib/config-store.ts', import.meta.url).href);
const inbox = await import(new URL('../src/lib/inbox.ts', import.meta.url).href);
const { parseWebhook } = await import(new URL('../src/lib/parser.ts', import.meta.url).href);
const { dispararItem } = await import(new URL('../src/lib/auto-dispatch.ts', import.meta.url).href);
const rotaDisparar = await import(
  new URL('../src/app/api/inbox/disparar/route.ts', import.meta.url).href
);
const { ipDoVisitante } = await import(new URL('../src/lib/tag-handler.ts', import.meta.url).href);

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

/* ---------------- Montagem: empresa B, com as sementes de empresa nova ---------------- */

await registro.salvarEmpresa({ id: 'emp_b', nome: 'Empresa B' });
await cfgStore.criarIntegracoesDaEmpresa({ id: 'emp_b', slug: 'empresa-b' });

const daB = (await cfgStore.listarMarcas('emp_b')).map((m) => m.id);
ok(
  daB.length === 1 && daB[0] === 'pixel_b',
  'montagem: a empresa B tem um Pixel só, o dela',
  `[${daB.join(', ')}]`
);
ok(
  cfgStore.acharRegra(await cfgStore.lerIntegracoes('emp_b'), 'purchase_approved') === undefined,
  'montagem: a empresa B nasce sem regra para purchase_approved (só as sementes da tag)'
);

let seq = 0;
/**
 * Uma compra aprovada no formato A com cara de venda real: e-mail, nome, id e
 * valor fora de todo padrão de teste — senão a trava de teste pararia o envio
 * antes da trava de empresa e o teste provaria a coisa errada.
 */
function compra({ email, nome } = {}) {
  seq += 1;
  const agora = new Date().toISOString();
  return {
    event: 'purchase_approved',
    event_id: `evt_f1_${seq}_${Date.now()}`,
    created_at: agora,
    data: {
      purchase_id: `compra-${seq}`,
      order_id: `pedido-f1-${seq}`,
      product: { name: 'Produto F1' },
      amount: 4990,
      currency: 'BRL',
      buyer: { external_id: `comprador-${seq}` },
      approved_at: agora,
      lead: {
        email: email ?? `comprador${seq}@loja-ficticia.invalid`,
        name: nome ?? `Comprador Numero ${seq}`,
        phone: '11988887777',
      },
    },
  };
}

/** Item como o webhook grava. `empresaId` ausente = item anterior à FASE E (empresa padrão). */
function novoItem(empresaId, extra = {}, dadosDaCompra) {
  return inbox.registrarEntrada({
    origem: 'webhook',
    ...(empresaId ? { empresaId } : {}),
    evento: 'Purchase',
    eventoOrigem: 'purchase_approved',
    temFbc: false,
    temFbp: false,
    payload: compra(dadosDaCompra),
    modo: 'fila',
    ...extra,
  });
}

const COOKIE = `${COOKIE_SESSAO}=${assinarSessao('admin', 12)}`;

/** O botão "Disparar direto": POST na rota de verdade, com a empresa ativa no header. */
async function disparar(corpo, empresaAtiva) {
  exigirFetchFalso();
  const headers = { cookie: COOKIE, 'content-type': 'application/json' };
  if (empresaAtiva) headers['x-empresa-id'] = empresaAtiva;
  const res = await rotaDisparar.POST(
    new NextRequest('http://localhost:3333/api/inbox/disparar', {
      method: 'POST',
      headers,
      body: JSON.stringify(corpo),
    })
  );
  return { status: res.status, corpo: await res.json() };
}

/** `dispararItem` direto, como o webhook e a tag chamam no modo automático. */
function direto(item, marcas, origem) {
  exigirFetchFalso();
  const campos = parseWebhook(JSON.stringify(item.payload)).fields;
  return dispararItem({ item, campos, eventoMeta: 'Purchase', marcas, origem });
}

const resumo = (resultados) =>
  (resultados ?? []).map((r) => `${r.marcaId}:${r.status}`).join(', ') || 'nenhum';

/* ---------------- A. A rota recusa Pixel de fora ANTES do primeiro envio ---------------- */

console.log('\n  A. POST /api/inbox/disparar');
{
  const item = await novoItem('emp_b');
  const antes = chamadas.length;
  const r = await disparar({ id: item.id, marcas: ['default'] }, 'emp_b');
  ok(r.status === 400, '🔴 A1: item da empresa B + marcas ["default"] → 400', `status=${r.status}`);
  ok(/outra empresa/.test(r.corpo.erro ?? ''), 'A1: a mensagem diz que o Pixel é de outra empresa');
  ok(chamadas.length === antes, '🔴 A1: ZERO chamadas ao envio', `chamadas=${chamadas.length - antes}`);
  const depois = await inbox.acharEntrada(item.id);
  ok(
    depois?.status === 'novo' && depois?.resultados === undefined,
    'A1: o item continua "novo", sem resultado de envio',
    `status=${depois?.status}`
  );
}
{
  const item = await novoItem('emp_b');
  const antes = chamadas.length;
  const r = await disparar({ id: item.id, marcas: ['pixel_b', 'default'] }, 'emp_b');
  ok(
    r.status === 400 && chamadas.length === antes,
    '🔴 A2: B + ["pixel_b", "default"] → 400 e nada sai, nem para o Pixel certo que veio junto',
    `status=${r.status} chamadas=${chamadas.length - antes}`
  );
  ok(
    (r.corpo.erro ?? '').includes('Pixel do dono (falso)'),
    'A2: a recusa nomeia o Pixel de fora, para o operador saber o que desmarcar'
  );
}
{
  const item = await novoItem('emp_b');
  const antes = chamadas.length;
  const semCampo = await disparar({ id: item.id }, 'emp_b');
  const vazia = await disparar({ id: item.id, marcas: [] }, 'emp_b');
  ok(
    semCampo.status === 400 &&
      vazia.status === 400 &&
      /Escolha ao menos um Pixel/.test(semCampo.corpo.erro ?? '') &&
      /Escolha ao menos um Pixel/.test(vazia.corpo.erro ?? '') &&
      chamadas.length === antes,
    '🔴 A3: item da B sem Pixel pedido e sem regra → 400 pedindo a escolha (sem recuo para "default")',
    `status=${semCampo.status}/${vazia.status}`
  );
}
{
  const item = await novoItem('emp_b');
  const antes = chamadas.length;
  const r = await disparar({ id: item.id, marcas: ['marca_apagada'] }, 'emp_b');
  ok(
    r.status === 400 && /não existe mais/.test(r.corpo.erro ?? '') && chamadas.length === antes,
    'A4: Pixel que não existe mais → 400, em vez de cair no "default" pela queda de acharMarca',
    `status=${r.status}`
  );
}
{
  const item = await novoItem('emp_b');
  const antes = chamadas.length;
  const r = await disparar({ id: item.id, marcas: ['pixel_b'] }); // sem header: empresa padrão ativa
  ok(
    r.status === 404 && chamadas.length === antes,
    'A5: controle — item da B pedido com a empresa padrão ativa → 404, como já era',
    `status=${r.status}`
  );
}
{
  const item = await novoItem(undefined);
  const antes = chamadas.length;
  const r = await disparar({ id: item.id, marcas: ['pixel_b'] });
  ok(
    r.status === 400 && /outra empresa/.test(r.corpo.erro ?? '') && chamadas.length === antes,
    'A6: o espelho — item da empresa padrão não vai para o Pixel da B',
    `status=${r.status}`
  );
}

/* ---------------- B. Item da B com o Pixel da própria B segue ---------------- */

console.log('\n  B. Pixel da própria empresa');
{
  const item = await novoItem('emp_b');
  const antes = chamadas.length;
  const r = await disparar({ id: item.id, marcas: ['pixel_b'] }, 'emp_b');
  const novas = chamadas.slice(antes);
  const res = r.corpo.resultados ?? [];
  ok(
    r.status === 200 && res.length === 1 && res[0].marcaId === 'pixel_b' && res[0].status === 'enviado',
    '🔴 B: item da B + ["pixel_b"] → 200 e "enviado"',
    `status=${r.status} [${resumo(res)}]`
  );
  ok(
    novas.length === 1 && pixelDe(novas[0]) === PIXEL_B,
    'B: exatamente uma chamada, e para o Pixel da B',
    `pixels=[${novas.map(pixelDe).join(', ')}]`
  );
}

/* ---------------- C. Empresa padrão: igual a antes ---------------- */

console.log('\n  C. Empresa padrão');
{
  const item = await novoItem('default');
  const antes = chamadas.length;
  const r = await disparar({ id: item.id, marcas: ['default'] });
  const novas = chamadas.slice(antes);
  const res = r.corpo.resultados ?? [];
  ok(
    r.status === 200 && res.length === 1 && res[0].status === 'enviado',
    '🔴 C1: item da empresa padrão + ["default"] → 200 e "enviado", igual a hoje',
    `status=${r.status} [${resumo(res)}]`
  );
  ok(
    novas.length === 1 && pixelDe(novas[0]) === PIXEL_DONO,
    'C1: uma chamada, para o Pixel do dono',
    `pixels=[${novas.map(pixelDe).join(', ')}]`
  );
  ok((await inbox.acharEntrada(item.id))?.status === 'disparado', 'C1: o item vira "disparado"');
}
{
  // Item anterior à FASE E (sem `empresaId`) e sem Pixel no corpo: vale a regra
  // semente r-purchase, que aponta para `default` — o caminho de sempre.
  const item = await novoItem(undefined);
  const antes = chamadas.length;
  const r = await disparar({ id: item.id });
  const novas = chamadas.slice(antes);
  const res = r.corpo.resultados ?? [];
  ok(
    r.status === 200 &&
      res.length === 1 &&
      res[0].marcaId === 'default' &&
      res[0].status === 'enviado' &&
      novas.length === 1 &&
      pixelDe(novas[0]) === PIXEL_DONO,
    'C2: item sem empresaId e sem Pixel pedido → Pixels da regra (["default"]) e envia, igual a hoje',
    `status=${r.status} [${resumo(res)}]`
  );
}

/* ---------------- D. dispararItem, a última barreira (também do automático) ---------------- */

console.log('\n  D. dispararItem');
{
  // O que o webhook faria com um item da B numa regra em `auto` sem Pixel: a
  // lista vazia recai em ['default'], e o Switch do default está LIGADO.
  const item = await novoItem('emp_b');
  const antes = chamadas.length;
  const res = await direto(item, [], 'auto');
  ok(
    res.length === 1 &&
      res[0].marcaId === 'default' &&
      res[0].status === 'pixel-de-outra-empresa' &&
      chamadas.length === antes,
    '🔴 D1: automático de item da B sem Pixel (recai no "default", Switch ligado) → descartado, zero chamadas',
    `[${resumo(res)}] chamadas=${chamadas.length - antes}`
  );
  ok(
    /outra empresa/.test(res[0]?.erro ?? '') && res[0]?.pixelId === PIXEL_DONO,
    'D1: o motivo vai no resultado, com o Pixel que TERIA recebido'
  );
  const gravado = await inbox.acharEntrada(item.id);
  ok(
    gravado?.status === 'novo' && gravado?.resultados?.[0]?.status === 'pixel-de-outra-empresa',
    'D1: o item não vira "disparado" e guarda o motivo',
    `status=${gravado?.status}`
  );
}
{
  const item = await novoItem('emp_b');
  const antes = chamadas.length;
  const res = await direto(item, ['default'], 'manual');
  ok(
    res.length === 1 && res[0].status === 'pixel-de-outra-empresa' && chamadas.length === antes,
    '🔴 D2: manual de item da B para ["default"] → descartado, zero chamadas',
    `[${resumo(res)}]`
  );
}
{
  const item = await novoItem('emp_b');
  const antes = chamadas.length;
  const res = await direto(item, ['marca_apagada'], 'manual');
  ok(
    res.length === 1 && res[0].status === 'pixel-de-outra-empresa' && chamadas.length === antes,
    'D3: id apagado, que acharMarca troca pelo "default" → descartado, zero chamadas',
    `[${resumo(res)}]`
  );
}
{
  const item = await novoItem('emp_b');
  const antes = chamadas.length;
  const res = await direto(item, ['pixel_b', 'default'], 'manual');
  const novas = chamadas.slice(antes);
  const porMarca = Object.fromEntries(res.map((r) => [r.marcaId, r.status]));
  ok(
    porMarca.pixel_b === 'enviado' && porMarca.default === 'pixel-de-outra-empresa',
    'D4: lista mista → o Pixel da B recebe, o do dono é descartado',
    `[${resumo(res)}]`
  );
  ok(
    novas.length === 1 && pixelDe(novas[0]) === PIXEL_B,
    '🔴 D4: uma chamada só, e para o Pixel da B',
    `pixels=[${novas.map(pixelDe).join(', ')}]`
  );
}
{
  const item = await novoItem(undefined);
  const antes = chamadas.length;
  const res = await direto(item, ['default'], 'auto');
  const novas = chamadas.slice(antes);
  ok(
    res.length === 1 &&
      res[0].status === 'enviado' &&
      novas.length === 1 &&
      pixelDe(novas[0]) === PIXEL_DONO,
    '🔴 D5: automático da empresa padrão para ["default"] → "enviado", igual a hoje',
    `[${resumo(res)}]`
  );
}
{
  const item = await novoItem('default');
  const antes = chamadas.length;
  const res = await direto(item, [], 'auto');
  const novas = chamadas.slice(antes);
  ok(
    res.length === 1 &&
      res[0].marcaId === 'default' &&
      res[0].status === 'enviado' &&
      novas.length === 1 &&
      pixelDe(novas[0]) === PIXEL_DONO,
    'D6: empresa padrão sem Pixel → o recuo para "default" continua valendo e envia',
    `[${resumo(res)}]`
  );
}
{
  // Ramo de teste: o Pixel de fora aparece com o motivo dele, e não como
  // "teste-ignorado" — ele nunca iria, nem se a venda fosse real.
  const dadosDeTeste = { email: 'comprador@example.com', nome: 'Comprador Exemplo' };
  const deB = await novoItem('emp_b', {}, dadosDeTeste);
  const doDono = await novoItem('default', {}, dadosDeTeste);
  const antes = chamadas.length;
  const resB = await direto(deB, ['default'], 'manual');
  const resDono = await direto(doDono, ['default'], 'manual');
  ok(
    resB[0]?.status === 'pixel-de-outra-empresa' &&
      resDono[0]?.status === 'teste-ignorado' &&
      chamadas.length === antes,
    'D7: item de teste → da B: "pixel-de-outra-empresa"; do dono: "teste-ignorado" (igual a hoje); zero chamadas',
    `B=[${resumo(resB)}] dono=[${resumo(resDono)}]`
  );
}
{
  // Ramo de suspeita (mesmo e-mail em várias compras): o automático não sai.
  const suspeita = { autoBloqueadoPorSuspeita: true, explicacaoDeTeste: 'suspeita do teste' };
  const deB = await novoItem('emp_b', suspeita);
  const doDono = await novoItem('default', suspeita);
  const antes = chamadas.length;
  const resB = await direto(deB, ['default'], 'auto');
  const resDono = await direto(doDono, ['default'], 'auto');
  ok(
    resB[0]?.status === 'pixel-de-outra-empresa' &&
      resDono[0]?.status === 'suspeita-de-teste' &&
      chamadas.length === antes,
    'D8: suspeita no automático → da B: "pixel-de-outra-empresa"; do dono: "suspeita-de-teste" (igual a hoje); zero chamadas',
    `B=[${resumo(resB)}] dono=[${resumo(resDono)}]`
  );
}

/* ---------------- E. F8: IP do visitante ---------------- */

console.log('\n  E. ipDoVisitante (F8)');
{
  const pedido = (headers) => new NextRequest('http://localhost:3333/api/tag/coletar', { headers });
  const forjado = ipDoVisitante(
    pedido({ 'cf-connecting-ip': '200.1.2.3', 'x-forwarded-for': '8.8.8.8, 200.1.2.3' })
  );
  ok(
    forjado === '200.1.2.3',
    '🔴 E1: com CF-Connecting-IP vale ele — o 8.8.8.8 que o remetente escreveu no X-Forwarded-For é ignorado',
    `ip=${forjado || '(vazio)'}`
  );
  const cfPrivado = ipDoVisitante(
    pedido({ 'cf-connecting-ip': '10.0.0.7', 'x-forwarded-for': '8.8.8.8' })
  );
  ok(
    cfPrivado === '',
    'E2: CF-Connecting-IP não roteável → vazio, sem cair para o texto do remetente',
    `ip=${cfPrivado || '(vazio)'}`
  );
  const semCf = ipDoVisitante(pedido({ 'x-forwarded-for': '10.0.0.1, 187.10.20.30' }));
  ok(
    semCf === '187.10.20.30',
    'E3: sem Cloudflare na frente (dev local) → primeiro IP público do X-Forwarded-For, como antes',
    `ip=${semCf || '(vazio)'}`
  );
  ok(ipDoVisitante(pedido({})) === '', 'E4: sem cabeçalho nenhum → vazio');

  const fonteTag = fs.readFileSync(
    fileURLToPath(new URL('../src/lib/tag-handler.ts', import.meta.url)),
    'utf8'
  );
  ok(
    /sePreenchido\(campos,\s*'ip',\s*ipDoVisitante\(request\)\)/.test(fonteTag),
    'E5: é esta função que preenche o `ip` do evento que a tag manda para a Meta'
  );
}

/* ---------------- Fim: nada fora da Graph API falsa ---------------- */

ok(
  chamadas.every((u) => GRAPH.test(u)),
  '🔴 nenhuma chamada para fora da Graph API (e a Graph API aqui é o fetch falso)',
  `chamadas=${chamadas.length}`
);
ok(
  chamadas.every((u) => [PIXEL_DONO, PIXEL_B].includes(pixelDe(u))),
  'toda chamada foi para um dos dois Pixels falsos deste teste'
);

// Deixa assentar o que ficou sem `await` (o relay do dispatch) antes de apagar o diretório.
await new Promise((r) => setTimeout(r, 50));

console.log(
  falhas === 0
    ? '\n  Disparo por empresa trancado: Pixel de outra empresa não recebe nem pela rota, nem pelo automático; IP vem da Cloudflare.\n'
    : `\n  ${falhas} falha(s).\n`
);
encerrar(falhas === 0 ? 0 : 1);
