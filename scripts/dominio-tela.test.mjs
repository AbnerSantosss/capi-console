#!/usr/bin/env node
/**
 * Aba Domínio honesta — tarefa V8 do plano v7 (§4), com os acréscimos de
 * 24/09 05:25 (a tag não pode parar de coletar) e 08:50 (o "pronto" é medido).
 *
 * O que este arquivo prova:
 *
 *   a  `textoDoCartao` com subdomínio e sem endereço pronto: "pedido ao
 *      cliente" e "aguardando configuração da Cloudflare"
 *   b  sem subdomínio: "Não cadastrado"
 *   c  para qualquer entrada com `enderecoPronto: false`, nenhuma linha diz
 *      "Ativo", "Encontrado" ou "Emitindo"
 *   d  o texto de "Copiar mensagem para o cliente" é o de `textoDnsParaCliente`
 *   e  (estático) os 3 componentes não têm "Verificar agora" nem endereço de
 *      provedor; `TagDoSite.tsx` perdeu o bloco do subdomínio e manteve
 *      "Confirmar remoção"
 *   f  `endpointDoDominio(…, false)` → o coletor da nossa base, mesmo com
 *      subdomínio
 *   g  `endpointDoDominio(…, true)` → o coletor do subdomínio do cliente
 *   h  sem domínio → a base; `http://localhost:3333` mantém a porta
 *   i  (estático) a rota importa `endpointDoDominio` de `@/lib/endereco-da-tag`
 *      e não declara mais a função; o cartão aguardando diz "continua coletando"
 *   j  `respostaEhDoConsole`: só 200 + `ok: true` + `servico: "capi-console"`
 *   k  `enderecoProprioPronto` chama exatamente `https://<host>/api/health`,
 *      uma vez; a 2ª chamada vem do cache
 *   l  `buscar` que lança, estoura o tempo ou devolve lixo → `false`, sem
 *      exceção
 *   m  `textoDoCartao(comSub, true)` diz "Pronto" e o host completo; com
 *      `false`, nem "Pronto" nem "Ativo"; `endereco-da-tag.ts` não tem endereço
 *      de provedor
 *   R  (dinâmico) a rota `GET /api/tag/gerar` de verdade: com subdomínio que
 *      não responde, a tag sai com o NOSSO coletor e `enderecoProprioPronto:
 *      false`; sem subdomínio, nem pergunta; com o endereço respondendo pelo
 *      console, a tag passa para o subdomínio
 *   C2 (estático) a aba grava com `empresaId` no corpo e a página monta
 *      `AbaDominio` com `key={empresaId}`
 *
 * 🔴 Nenhuma rede de verdade. O `fetch` global é trocado por um espião ANTES de
 * qualquer import de src/: ele LANÇA para qualquer endereço — graph.facebook.com
 * e api.cloudflare.com com mensagem própria — e só responde, quando o cenário
 * pede, ao `https://m.exemplo.com.br/api/health` inventado deste teste. As
 * outras sondas usam um `buscar` falso, injetado. Sem ACCESS_TOKEN e sem
 * PIXEL_ID. O processo roda numa pasta temporária: o `config/` criado é o de
 * lá, nunca o real.
 *
 * Uso: npm run test:dominio-tela
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

const HEALTH_DO_TESTE = 'https://m.exemplo.com.br/api/health';
/** null: a sonda da rota falha (DNS/TLS); objeto: a sonda recebe este corpo com 200. */
let respostaDaSonda = null;
const chamadasGlobais = [];
const fetchEspiao = async (entrada) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  chamadasGlobais.push(url);
  if (/graph\.facebook\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Meta');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Cloudflare');
  if (url === HEALTH_DO_TESTE && respostaDaSonda) {
    return new Response(JSON.stringify(respostaDaSonda), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error(`rede bloqueada pelo teste: ${url}`);
};
globalThis.fetch = fetchEspiao;
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

/* Credenciais de teste ANTES de carregar sessao.ts, que lê o ambiente no import. */
process.env.CONSOLE_USER = 'admin';
process.env.CONSOLE_PASSWORD = 'senha-de-teste-com-mais-de-12-caracteres';
process.env.SESSION_SECRET = 'segredo-de-sessao-so-do-teste-com-mais-de-32-caracteres';
const BASE = 'https://capi.proxserverabner.site';
process.env.PUBLIC_BASE_URL = BASE;

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'dominio-tela-'));
fs.mkdirSync(path.join(PASTA, 'config'), { recursive: true });
fs.mkdirSync(path.join(PASTA, 'logs'), { recursive: true });
// config-store.ts resolve os caminhos no import: a pasta muda ANTES dele.
process.chdir(PASTA);

/* ---------------- Harness ---------------- */

let falhas = 0;
function ok(condicao, rotulo, detalhe = '') {
  if (condicao) {
    console.log(`  ok  ${rotulo}`);
  } else {
    falhas += 1;
    console.error(`  FALHOU  ${rotulo}${detalhe ? ` ${detalhe}` : ''}`);
  }
}
const mostra = (v) => JSON.stringify(v);
const fonte = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));
const ocorrencias = (texto, trecho) => texto.split(trecho).length - 1;

const src = (rel) => new URL(`../src/${rel}`, import.meta.url).href;

const mensagens = await import(src('components/dominio/mensagens-dominio.ts'));
const endereco = await import(src('lib/endereco-da-tag.ts'));
const { textoDnsParaCliente } = await import(src('lib/tag-dominios.ts'));

const { textoDoCartao, mensagemParaCliente } = mensagens;
const { endpointDoDominio, respostaEhDoConsole, enderecoProprioPronto, limparCacheDoEndereco } =
  endereco;

const PROIBIDAS_NO_CARTAO = /\b(Ativo|Encontrado|Emitindo)\b/i;
const linhas = (t) => [t.apontamento, t.certificado, t.detalhe];

/* ---------------- a, b. As duas linhas do cartão ---------------- */

console.log('\n  a/b. textoDoCartao nos estados que existem hoje');

const comSub = { host: 'exemplo.com.br', subdominio: 'm' };
const semSub = { host: 'exemplo.com.br' };

const tA = textoDoCartao(comSub, false);
ok(/pedido ao cliente/.test(tA.apontamento), '(a) com subdomínio: apontamento "pedido ao cliente"', mostra(tA.apontamento));
ok(
  /aguardando configuração da Cloudflare/.test(tA.certificado),
  '(a) com subdomínio: certificado "aguardando configuração da Cloudflare"',
  mostra(tA.certificado)
);
ok(tA.estado === 'aguardando', '(a) estado "aguardando"', mostra(tA.estado));

const tB = textoDoCartao(semSub, false);
ok(/Não cadastrado/.test(tB.apontamento), '(b) sem subdomínio: "Não cadastrado"', mostra(tB.apontamento));
ok(tB.estado === 'sem-subdominio', '(b) estado "sem-subdominio"', mostra(tB.estado));
ok(/nosso endereço/.test(tB.detalhe) && !/cookie/i.test(tB.detalhe), '(b) sem subdomínio: a tag usa o nosso endereço, sem falar de cookie', mostra(tB.detalhe));

/* ---------------- c. Nunca "Ativo" sem prova ---------------- */

console.log('\n  c. Com enderecoPronto false, nenhuma linha diz Ativo, Encontrado ou Emitindo');

const entradas = [
  comSub,
  semSub,
  { host: 'loja.com.br', subdominio: 'tk' },
  { host: 'LOJA.COM.BR', subdominio: ' M ' },
  { host: 'capi.gtech.uy'.replace('capi.', ''), subdominio: 'capi' },
  { host: '', subdominio: 'm' },
  { host: 'exemplo.com.br', subdominio: '' },
  {},
];
for (const e of entradas) {
  for (const t of [textoDoCartao(e, false), textoDoCartao(e)]) {
    const achou = linhas(t).find((l) => PROIBIDAS_NO_CARTAO.test(l));
    ok(!achou, `(c) ${mostra(e)} → sem Ativo/Encontrado/Emitindo`, achou ? mostra(achou) : '');
    ok(!/Pronto/.test(t.apontamento + t.certificado), `(c) ${mostra(e)} → sem "Pronto"`);
  }
}

/* ---------------- d. Copiar mensagem = textoDnsParaCliente ---------------- */

console.log('\n  d. A mensagem para o cliente é a de textoDnsParaCliente');

const dominioCompleto = { id: 'd1', host: 'exemplo.com.br', subdominio: 'm', criadoEm: '2026-09-25T00:00:00.000Z', hits: 0 };
const msg = mensagemParaCliente(dominioCompleto, BASE);
ok(msg.texto === textoDnsParaCliente(dominioCompleto, BASE), '(d) texto igual a textoDnsParaCliente(dominio, base)');
ok(msg.whatsapp.startsWith('https://wa.me/?text='), '(d) WhatsApp abre https://wa.me/?text=', mostra(msg.whatsapp.slice(0, 40)));
ok(
  decodeURIComponent(msg.whatsapp.slice('https://wa.me/?text='.length)) === msg.texto,
  '(d) o WhatsApp leva o mesmo texto, inteiro'
);
ok(msg.email.startsWith('mailto:'), '(d) E-mail é mailto:', mostra(msg.email.slice(0, 30)));
ok(
  decodeURIComponent(msg.email.split('&body=')[1] ?? '') === msg.texto,
  '(d) o E-mail leva o mesmo texto no corpo'
);

/* ---------------- e. Estático: componentes e TagDoSite ---------------- */

console.log('\n  e. Componentes da aba sem verificação inventada; TagDoSite sem o bloco do subdomínio');

const COMPONENTES = [
  'src/components/dominio/AbaDominio.tsx',
  'src/components/dominio/CartaoDeDominio.tsx',
  'src/components/dominio/ModalAdicionarDominio.tsx',
];
for (const rel of COMPONENTES) {
  if (!existe(rel)) {
    ok(false, `(e) ${rel} existe`);
    continue;
  }
  const t = fonte(rel);
  ok(!/Verificar agora/i.test(t), `(e) ${rel}: sem "Verificar agora"`);
  ok(!/api\.cloudflare\.com|dns\.google|cloudflare-dns\.com/i.test(t), `(e) ${rel}: sem endereço de provedor (api.cloudflare.com, dns.google, cloudflare-dns.com)`);
}
const mensagensFonte = fonte('src/components/dominio/mensagens-dominio.ts');
ok(!/api\.cloudflare\.com|dns\.google|cloudflare-dns\.com/i.test(mensagensFonte), '(e) mensagens-dominio.ts: sem endereço de provedor');

const tagDoSite = fonte('src/components/integrations/TagDoSite.tsx');
const contaSub = ['tag-subdominio-novo', 'subdominioNovo', 'cnamesPendentes'].reduce(
  (n, trecho) => n + tagDoSite.split('\n').filter((l) => l.includes(trecho)).length,
  0
);
ok(contaSub === 0, '(e) TagDoSite.tsx: grep "tag-subdominio-novo|subdominioNovo|cnamesPendentes" → 0', `(${contaSub})`);
const contaRemocao = tagDoSite.split('\n').filter((l) => l.includes('Confirmar remoção')).length;
ok(contaRemocao === 1, '(e) TagDoSite.tsx: grep "Confirmar remoção" → 1', `(${contaRemocao})`);
ok(!tagDoSite.includes('Registro de DNS para o cliente criar'), '(e) TagDoSite.tsx: o painel "Registro de DNS para o cliente criar" saiu');
ok(/O domínio próprio fica na aba/.test(tagDoSite.replace(/\s+/g, ' ')), '(e) TagDoSite.tsx: no lugar, a linha "O domínio próprio fica na aba Domínio"');
ok(/enderecoDaAba\([^)]*'dominio'\)/.test(tagDoSite), '(e) TagDoSite.tsx: a linha leva à aba Domínio (enderecoDaAba(slug, \'dominio\'))');
ok(tagDoSite.includes('id="tag-dominio-novo"'), '(e) TagDoSite.tsx: o campo do site (tag-dominio-novo) ficou');

/* ---------------- f, g, h. endpointDoDominio ---------------- */

console.log('\n  f/g/h. endpointDoDominio: a tag nunca aponta para endereço que não responde');

const dF = { id: 'd1', host: 'exemplo.com.br', subdominio: 'm' };
const f = endpointDoDominio(dF, BASE, false);
ok(f === `${BASE}/api/tag/coletar`, '(f) com subdomínio e certificado NÃO pronto → nosso coletor', mostra(f));
const g = endpointDoDominio(dF, BASE, true);
ok(g === 'https://m.exemplo.com.br/api/tag/coletar', '(g) com subdomínio e certificado pronto → coletor do cliente', mostra(g));
const h1 = endpointDoDominio(undefined, BASE, false);
const h2 = endpointDoDominio(undefined, BASE, true);
ok(h1 === `${BASE}/api/tag/coletar` && h2 === h1, '(h) sem domínio → a base (pronto ou não)', mostra([h1, h2]));
const h3 = endpointDoDominio({ id: 'd2', host: 'exemplo.com.br' }, 'http://localhost:3333', false);
const h4 = endpointDoDominio({ id: 'd2', host: 'exemplo.com.br' }, 'http://localhost:3333', true);
ok(
  h3 === 'http://localhost:3333/api/tag/coletar' && h4 === h3,
  '(h) base http://localhost:3333 sem subdomínio → a porta fica',
  mostra([h3, h4])
);
const h5 = endpointDoDominio(dF, 'base torta', false);
ok(h5 === 'http://localhost:3333/api/tag/coletar', '(h) base ilegível não derruba: cai no padrão local', mostra(h5));

/* ---------------- i. Estático: a rota usa a função da lib ---------------- */

console.log('\n  i. A rota importa endpointDoDominio da lib e não declara mais a função');

const rota = fonte('src/app/api/tag/gerar/route.ts');
ok(
  /import\s*\{[^}]*\bendpointDoDominio\b[^}]*\}\s*from\s*'@\/lib\/endereco-da-tag'/.test(rota),
  "(i) route.ts importa endpointDoDominio de '@/lib/endereco-da-tag'"
);
ok(!/function\s+endpointDoDominio\b/.test(rota), '(i) route.ts não declara mais a função endpointDoDominio');
ok(/\bexport\s+async\s+function\s+GET\b/.test(rota) && !/export\s+(async\s+)?function\s+(POST|PUT|DELETE|PATCH)\b/.test(rota), '(i) a rota só exporta o GET');
ok(/continua coletando/.test(tA.detalhe), '(i) o cartão com certificado aguardando diz que a tag "continua coletando"', mostra(tA.detalhe));
const cartaoFonte = existe(COMPONENTES[1]) ? fonte(COMPONENTES[1]) : '';
ok(/textoDoCartao\(/.test(cartaoFonte) && /\.detalhe\b/.test(cartaoFonte), '(i) o cartão mostra a frase de textoDoCartao (detalhe)');
ok(/copiar\(\s*mensagem\.texto/.test(cartaoFonte) && cartaoFonte.includes('Copiar mensagem para o cliente'), '(d) o botão "Copiar mensagem para o cliente" copia mensagem.texto');

/* ---------------- j. respostaEhDoConsole ---------------- */

console.log('\n  j. respostaEhDoConsole: só a resposta deste console conta');

ok(respostaEhDoConsole(200, { ok: true, servico: 'capi-console' }) === true, '(j) 200 + ok + capi-console → true');
ok(respostaEhDoConsole(404, { ok: true, servico: 'capi-console' }) === false, '(j) 404 → false');
ok(respostaEhDoConsole(200, { ok: true, servico: 'outro-servico' }) === false, '(j) outro serviço → false');
ok(respostaEhDoConsole(200, null) === false, '(j) corpo null → false');
ok(respostaEhDoConsole(200, { ok: 'true', servico: 'capi-console' }) === false, '(j) ok como texto → false');
ok(respostaEhDoConsole(301, { ok: true, servico: 'capi-console' }) === false, '(j) redirecionamento → false');

/* ---------------- k. Sonda com cache ---------------- */

console.log('\n  k. enderecoProprioPronto: uma chamada, ao endereço certo, e cache');

limparCacheDoEndereco();
const chamadasK = [];
const buscarPronto = async (url, init) => {
  chamadasK.push({ url, init });
  return new Response(JSON.stringify({ ok: true, servico: 'capi-console' }), { status: 200 });
};
const k1 = await enderecoProprioPronto('capi.gtech.uy', buscarPronto);
const k2 = await enderecoProprioPronto('capi.gtech.uy', buscarPronto);
ok(k1 === true && k2 === true, '(k) o endereço que responde pelo console → true', mostra([k1, k2]));
ok(chamadasK.length === 1, '(k) a 2ª chamada no mesmo minuto vem do cache (1 chamada só)', `(${chamadasK.length})`);
ok(chamadasK[0]?.url === 'https://capi.gtech.uy/api/health', '(k) chama exatamente https://capi.gtech.uy/api/health', mostra(chamadasK[0]?.url));
const initK = chamadasK[0]?.init ?? {};
ok(initK.redirect === 'manual', '(k) redirect: "manual"', mostra(initK.redirect));
ok(initK.cache === 'no-store', '(k) cache: "no-store"', mostra(initK.cache));
ok(initK.signal instanceof AbortSignal, '(k) com signal de tempo limite');
ok((initK.method ?? 'GET') === 'GET', '(k) método GET', mostra(initK.method));

limparCacheDoEndereco();
const chamadasNao = [];
const buscar404 = async (url) => {
  chamadasNao.push(url);
  return new Response('não achei', { status: 404 });
};
const kn1 = await enderecoProprioPronto('m.exemplo.com.br', buscar404);
const kn2 = await enderecoProprioPronto('m.exemplo.com.br', buscar404);
ok(kn1 === false && kn2 === false, '(k) 404 → false', mostra([kn1, kn2]));
ok(chamadasNao.length === 1, '(k) o "não pronto" também fica guardado (60 s): 1 chamada só', `(${chamadasNao.length})`);
limparCacheDoEndereco();
await enderecoProprioPronto('m.exemplo.com.br', buscar404);
ok(chamadasNao.length === 2, '(k) limparCacheDoEndereco faz perguntar de novo', `(${chamadasNao.length})`);

limparCacheDoEndereco();
const chamadasHostTorto = [];
const buscarQualquer = async (url) => {
  chamadasHostTorto.push(url);
  return new Response(JSON.stringify({ ok: true, servico: 'capi-console' }), { status: 200 });
};
for (const torto of ['', 'localhost', 'evil.com/x', 'a@b.com', 'exemplo.com.br:8443', 'exem plo.com.br', 'https://m.exemplo.com.br']) {
  const r = await enderecoProprioPronto(torto, buscarQualquer);
  ok(r === false, `(k) host torto ${mostra(torto)} → false`);
}
ok(chamadasHostTorto.length === 0, '(k) host torto não vira chamada nenhuma', mostra(chamadasHostTorto));

/* ---------------- l. Erro e tempo esgotado ---------------- */

console.log('\n  l. Erro, tempo esgotado e lixo dão false, sem exceção');

limparCacheDoEndereco();
let lancou = false;
let l1;
try {
  l1 = await enderecoProprioPronto('m.falha.com.br', async () => {
    throw new TypeError('fetch failed: getaddrinfo ENOTFOUND');
  });
} catch {
  lancou = true;
}
ok(l1 === false && !lancou, '(l) buscar que lança (DNS/TLS) → false, sem exceção', mostra(l1));

limparCacheDoEndereco();
let l2;
lancou = false;
try {
  l2 = await enderecoProprioPronto('m.lixo.com.br', async () => new Response('<html>estacionado</html>', { status: 200 }));
} catch {
  lancou = true;
}
ok(l2 === false && !lancou, '(l) 200 com corpo que não é JSON → false', mostra(l2));

limparCacheDoEndereco();
let l3;
lancou = false;
// AbortSignal.timeout usa um timer que não segura o processo; este segura, só
// durante a espera, para o Node não sair antes de o tempo limite estourar.
const segura = setTimeout(() => {}, 10_000);
const t0 = Date.now();
try {
  l3 = await enderecoProprioPronto(
    'm.lento.com.br',
    (_url, init) =>
      new Promise((_resolver, rejeitar) => {
        init.signal.addEventListener('abort', () => rejeitar(init.signal.reason));
      })
  );
} catch {
  lancou = true;
}
const espera = Date.now() - t0;
clearTimeout(segura);
ok(l3 === false && !lancou, '(l) buscar que estoura o tempo → false, sem exceção', mostra(l3));
ok(espera >= 2000 && espera < 5000, '(l) o tempo limite é curto (≈ 2,5 s)', `(${espera} ms)`);

/* ---------------- m. "Pronto" só com prova ---------------- */

console.log('\n  m. "Pronto" só quando o endereço respondeu');

const tM = textoDoCartao(comSub, true);
ok(/Pronto/.test(tM.apontamento) && tM.apontamento.includes('m.exemplo.com.br'), '(m) com true: "Pronto" e o host completo', mostra(tM.apontamento));
ok(/copie de novo/.test(tM.certificado), '(m) com true: "Se a tag foi instalada antes, copie de novo"', mostra(tM.certificado));
ok(tM.estado === 'pronto', '(m) estado "pronto"');
const tM2 = textoDoCartao(comSub, false);
ok(!/Pronto|Ativo/.test(linhas(tM2).join(' ')), '(m) com false: nem "Pronto" nem "Ativo"', mostra(linhas(tM2)));
const tM3 = textoDoCartao(semSub, true);
ok(tM3.estado === 'sem-subdominio' && !/Pronto/.test(tM3.apontamento), '(m) sem subdomínio, true não inventa "Pronto"', mostra(tM3.apontamento));
const enderecoFonte = fonte('src/lib/endereco-da-tag.ts');
ok(!/api\.cloudflare\.com|dns\.google|cloudflare-dns\.com/i.test(enderecoFonte), '(m) endereco-da-tag.ts: sem api.cloudflare.com, dns.google nem cloudflare-dns.com');
ok(ocorrencias(enderecoFonte, 'buscar(') === 1, '(m) endereco-da-tag.ts: uma única chamada de rede (a sonda)');

/* ---------------- R. A rota de verdade ---------------- */

console.log('\n  R. GET /api/tag/gerar: a tag só troca de endereço depois de medido');

const ARQ = path.join(PASTA, 'config', 'integracoes.json');
fs.writeFileSync(
  ARQ,
  JSON.stringify(
    {
      entrada: { segredo: 'segredo-de-entrada-so-do-teste', modo: 'fila', rotulo: 'teste' },
      regras: [],
      saida: [],
      tag: {
        chave: 'cvt_chave_so_do_teste',
        dominios: [
          { id: 'd1', host: 'exemplo.com.br', subdominio: 'm', criadoEm: '2026-09-25T00:00:00.000Z', hits: 0 },
          { id: 'd2', host: 'outro.com.br', criadoEm: '2026-09-25T00:00:00.000Z', hits: 0 },
        ],
      },
    },
    null,
    2
  ),
  'utf8'
);

const { NextRequest } = await import('next/server.js');
const { assinarSessao, COOKIE_SESSAO } = await import(src('lib/sessao.ts'));
const rotaGerar = await import(src('app/api/tag/gerar/route.ts'));
const COOKIE = `${COOKIE_SESSAO}=${assinarSessao('admin', 12)}`;
const pedirGerar = async (dominio) => {
  const res = await rotaGerar.GET(
    new NextRequest(`http://localhost:3333/api/tag/gerar${dominio ? `?dominio=${dominio}` : ''}`, {
      headers: { cookie: COOKIE },
    })
  );
  let corpo = null;
  try {
    corpo = await res.json();
  } catch {
    corpo = null;
  }
  return { status: res.status, corpo };
};
const sondasDaRota = () => chamadasGlobais.filter((u) => u === HEALTH_DO_TESTE).length;

limparCacheDoEndereco();
respostaDaSonda = null;
const r1 = await pedirGerar('d1');
ok(r1.status === 200, '(R) domínio com subdomínio → 200', mostra(r1.status));
ok(r1.corpo?.endpoint === `${BASE}/api/tag/coletar`, '🔴 (R) subdomínio que não responde → a tag usa o NOSSO coletor e continua coletando', mostra(r1.corpo?.endpoint));
ok(r1.corpo?.enderecoProprioPronto === false, '(R) a resposta diz enderecoProprioPronto: false', mostra(r1.corpo?.enderecoProprioPronto));
ok(r1.corpo?.dominioId === 'd1' && Array.isArray(r1.corpo?.tags) && r1.corpo.tags.length > 0, '(R) os campos de hoje continuam (dominioId, tags)');
const tagsR1 = JSON.stringify(r1.corpo?.tags ?? []);
ok(tagsR1.includes(`${BASE}/api/tag/coletar`) && !tagsR1.includes('m.exemplo.com.br/api/tag/coletar'), '(R) o código das tags chama o nosso coletor, não o subdomínio');
ok(sondasDaRota() === 1, '(R) a rota perguntou uma vez a https://m.exemplo.com.br/api/health', `(${sondasDaRota()})`);

const r2 = await pedirGerar('d2');
ok(r2.corpo?.endpoint === `${BASE}/api/tag/coletar` && r2.corpo?.enderecoProprioPronto === false, '(R) sem subdomínio → nosso coletor, enderecoProprioPronto: false', mostra([r2.corpo?.endpoint, r2.corpo?.enderecoProprioPronto]));
ok(sondasDaRota() === 1, '(R) sem subdomínio a rota nem pergunta', `(${sondasDaRota()})`);

limparCacheDoEndereco();
respostaDaSonda = { ok: true, servico: 'capi-console', versao: 'teste' };
const r3 = await pedirGerar('d1');
ok(r3.corpo?.endpoint === 'https://m.exemplo.com.br/api/tag/coletar', '(R) endereço próprio respondendo pelo console → a tag passa a chamar o subdomínio', mostra(r3.corpo?.endpoint));
ok(r3.corpo?.enderecoProprioPronto === true, '(R) a resposta diz enderecoProprioPronto: true', mostra(r3.corpo?.enderecoProprioPronto));
respostaDaSonda = null;

const r4 = await pedirGerar('nao-existe');
ok(r4.status === 404, '(R) id que não existe continua 404', mostra(r4.status));
const r5 = await rotaGerar.GET(new NextRequest('http://localhost:3333/api/tag/gerar?dominio=d1'));
ok(r5.status === 401, '(R) sem sessão continua 401', mostra(r5.status));

/* ---------------- C2. empresaId no PUT e key na página ---------------- */

console.log('\n  C2. A aba grava com empresaId e remonta por empresa');

const aba = existe(COMPONENTES[0]) ? fonte(COMPONENTES[0]) : '';
ok(/JSON\.stringify\(\{\s*tag:\s*\{\s*dominios[^}]*\}\s*,\s*empresaId\s*\}\)/.test(aba), '(C2) o PUT manda { tag: { dominios }, empresaId }');
ok(/'\/api\/integracoes'/.test(aba) && /method:\s*'PUT'/.test(aba), '(C2) grava pelo PUT /api/integracoes de hoje');
ok(/\/api\/tag\/gerar\?dominio=/.test(aba) && /enderecoProprioPronto/.test(aba), '(C2) lê enderecoProprioPronto de GET /api/tag/gerar?dominio=<id>');
ok(/'X-Empresa-Id':\s*empresaId/.test(aba), '(C2) as chamadas dizem a empresa da tela no header');
const pagina = fonte('src/app/(console)/e/[slug]/dominio/page.tsx');
ok(/<AbaDominio[\s\S]*?key=\{empresaId\}/.test(pagina) && /empresaId=\{empresaId\}/.test(pagina), '(C2) a página monta <AbaDominio key={empresaId} empresaId={empresaId} …>');
ok(!/InstalacaoPage|TagDoSite/.test(pagina), '(C2) a página não monta mais InstalacaoPage/TagDoSite');

const modal = existe(COMPONENTES[2]) ? fonte(COMPONENTES[2]) : '';
ok(modal.includes('Sem https:// e sem barra'), '(modal) passo 1: "Sem https:// e sem barra"');
ok(/SUBDOMINIO_SUGERIDO/.test(modal) && /DICA_DO_SUBDOMINIO/.test(modal), '(modal) passo 2: sugestão m e a dica do subdomínio');
ok(!/cookie/i.test(modal), '(modal) nenhuma promessa de cookie no modal');
ok(mensagens.SUBDOMINIO_SUGERIDO === 'm', '(modal) a sugestão é "m"');
ok(
  mensagens.DICA_DO_SUBDOMINIO.startsWith('Curto e neutro. Evite ad, gtm, sgtm, tracking, analytics, metrics, stape, gtag'),
  '(modal) a dica é a do plano',
  mostra(mensagens.DICA_DO_SUBDOMINIO)
);

/* ---------------- Fim ---------------- */

const foraDoTeste = chamadasGlobais.filter((u) => u !== HEALTH_DO_TESTE);
ok(foraDoTeste.length === 0, '🔴 nenhuma chamada de rede além da sonda inventada deste teste', mostra(foraDoTeste));
ok(!chamadasGlobais.some((u) => /graph\.facebook\.com|api\.cloudflare\.com/i.test(u)), '🔴 nada foi para a Meta nem para a Cloudflare');
if (globalThis.fetch !== fetchEspiao) {
  falhas += 1;
  console.error('  FALHOU  alguém trocou o fetch espião no meio do teste');
}

process.chdir(RAIZ);
fs.rmSync(PASTA, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Aba Domínio: só os estados que existem, a tag nunca aponta para endereço que não responde e o "pronto" é medido.'
    : `\n  ${falhas} falha(s).`
);
process.exit(falhas === 0 ? 0 : 1);
