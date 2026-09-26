#!/usr/bin/env node
/**
 * A empresa no endereço (V2 do plano v7): `/empresas`, `/e/<slug>/<aba>`, o 307
 * das rotas antigas no proxy e o `EmpresaDoEndereco`.
 *
 * O que este arquivo prova:
 *
 *   (a) `validarDestino` aceita o padrão fechado `/e/<slug>[/<aba>]` e recusa
 *       aba desconhecida, barra dupla, `..`, maiúscula, ponto e origem externa
 *   (b) `destinoDaRotaAntiga`: uma asserção por linha da tabela, com o slug
 *       `gtech`; a query é repassada; `/guia`, `/empresas`, `/e/**` e
 *       `/api/**` não são rota antiga (`null`)
 *   (c) `destinoAoTrocar`: a mesma aba na empresa nova; fora de uma aba, a
 *       Visão geral dela
 *   (d) `prepararEmpresaDoEndereco`: cookie e store alinhados ANTES de
 *       `pronto`; a primeira `pedir()` depois disso já sai com
 *       `X-Empresa-Id` da empresa do endereço; antes, nenhum pedido
 *   (e) `acharEmpresaPorSlug`: comparação exata, num diretório temporário
 *   (f) o contrato I4 no proxy DE VERDADE: `/e/<slug>` grava o cookie
 *       `capi_empresa` da empresa do endereço (e só quando ele difere), a API
 *       nunca é realinhada pelo endereço, e rota antiga responde 307 num salto
 *       só para a aba nova da empresa ativa, com `private, no-store`
 *   (g) estático: nenhuma página de `/e/` lê o cookie para decidir a empresa,
 *       as 8 páginas remontam por empresa (`key={empresaId}`), o proxy lê o
 *       cookie pela API do `NextRequest` e `empresa-ativa.ts` não mudou de
 *       exportações
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/: responde só `/api/teste-navegacao` e `/api/marcas` e LANÇA
 * para qualquer outro endereço, inclusive graph.facebook.com e
 * api.cloudflare.com. Sem ACCESS_TOKEN e sem PIXEL_ID. A senha e o segredo de
 * sessão são descartáveis e só existem neste processo. O registro de empresas
 * é gravado num `mkdtemp`, nunca no `config/` de verdade.
 *
 * Roda SEM `--conditions=react-server`: o store e o `pedir()` são código de
 * navegador, e o `server-only` do proxy vira módulo vazio pelo resolver.
 *
 * Uso: npm run test:navegacao
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AGORA = '2026-09-24T00:00:00.000Z';

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

/** URL e header de empresa de cada tentativa. Nada de corpo. */
const chamadas = [];
const fetchFalso = async (entrada, init) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  let empresa = null;
  try {
    empresa = new Headers(init?.headers).get('X-Empresa-Id');
  } catch {
    /* header ilegível: fica null */
  }
  chamadas.push({ url, empresa });
  if (/graph\.facebook\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Meta');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Cloudflare');
  const json = (dados) =>
    new Response(JSON.stringify(dados), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  if (url === '/api/teste-navegacao') return json({ ok: true });
  if (url === '/api/marcas') return json({ marcas: [] });
  throw new Error(`rede bloqueada pelo teste: ${url}`);
};
globalThis.fetch = fetchFalso;
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

// Credenciais DESCARTÁVEIS, só deste processo: o proxy exige senha forte e o
// teste (f) precisa de um cookie de sessão válido.
process.env.CONSOLE_USER = 'operador';
process.env.CONSOLE_PASSWORD = 'senha-descartavel-do-teste-de-navegacao';
process.env.SESSION_SECRET = 'segredo-descartavel-do-teste-de-navegacao-com-mais-de-32';

/* ---------------- 1. Registro de empresas num diretório temporário ---------------- */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-navegacao-'));
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'config', 'empresas.json'),
  JSON.stringify(
    {
      empresas: [
        { id: 'emp_a', nome: 'Alfa (teste)', slug: 'alfa', criadoEm: AGORA },
        { id: 'emp_b', nome: 'Beta (teste)', slug: 'beta', criadoEm: AGORA },
      ],
    },
    null,
    2
  )
);
// `empresas.ts` e `config-store.ts` resolvem `<cwd>/config` no import: a troca
// de diretório vem ANTES de qualquer import, senão o teste leria (ou gravaria)
// a configuração real.
process.chdir(tmp);

/* ---------------- 2. Navegador de mentira: window, localStorage, document ---------------- */

const CHAVE = 'capi_empresa_ativa_v1';
const armazenamento = new Map();
const localStorageFalso = {
  getItem: (k) => (armazenamento.has(k) ? armazenamento.get(k) : null),
  setItem: (k, v) => {
    armazenamento.set(k, String(v));
  },
  removeItem: (k) => {
    armazenamento.delete(k);
  },
  clear: () => armazenamento.clear(),
  key: (i) => [...armazenamento.keys()][i] ?? null,
  get length() {
    return armazenamento.size;
  },
};
// A aba abriu na empresa padrão: é o que o `persist` teria deixado gravado.
armazenamento.set(CHAVE, JSON.stringify({ state: { empresaAtivaId: 'default' }, version: 0 }));

const janela = new EventTarget();
janela.location = { protocol: 'http:', pathname: '/e/x/pixels', origin: 'http://localhost:3333' };
janela.localStorage = localStorageFalso;

const cookiesEscritos = [];
const documentoFalso = {
  set cookie(valor) {
    cookiesEscritos.push(String(valor));
  },
  get cookie() {
    return cookiesEscritos.at(-1) ?? '';
  },
};

globalThis.window = janela;
globalThis.document = documentoFalso;
globalThis.localStorage = localStorageFalso;

/* ---------------- 3. Imports de src/, depois da rede trancada ---------------- */

const src = (rel) => new URL(`../src/${rel}`, import.meta.url).href;

const { validarDestino, assinarSessao, COOKIE_SESSAO } = await import(src('lib/sessao.ts'));
const { ABAS_DA_EMPRESA, ehEnderecoDeEmpresa } = await import(src('lib/rotas-console.ts'));
const { destinoDaRotaAntiga, abaDasRegrasPeloEndereco, ehRotaAntiga, ROTAS_ANTIGAS } = await import(
  src('lib/rotas-antigas.ts')
);
const {
  ABAS_DO_ENDERECO,
  slugDoEndereco,
  empresaIdDoEndereco,
  prepararEmpresaDoEndereco,
  travaDeAlinhamento,
  destinoAoTrocar,
} = await import(src('lib/empresa-do-endereco.ts'));
const { acharEmpresaPorSlug, listarEmpresas } = await import(src('lib/empresas.ts'));
const { COOKIE_EMPRESA_MAX_AGE } = await import(src('lib/empresa-ativa.ts'));
const { useEmpresaStore, escreverCookieEmpresa } = await import(src('stores/useEmpresaStore.ts'));
const { pedir } = await import(src('lib/cliente-api.ts'));
const { proxy } = await import(src('proxy.ts'));
const { NextRequest } = await import('next/server');

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

if (globalThis.fetch !== fetchFalso) {
  console.log('  FALHA  algum import trocou o fetch falso; o teste para aqui');
  process.exit(1);
}

console.log('\n  Empresa no endereço (V2)\n');

/* ---------------- (a) validarDestino e o padrão fechado ---------------- */

console.log('  (a) validarDestino');
ok(validarDestino('/e/gtech/pixels') === '/e/gtech/pixels', "(a) '/e/gtech/pixels' aceito");
ok(validarDestino('/e/gtech') === '/e/gtech', "(a) '/e/gtech' (Visão geral) aceito");
for (const recusado of ['/e/gtech/nada', '/e//pixels', '/e/../pixels', '/e/Gtech/pixels', '/e/g.tech/pixels', '//evil.com']) {
  ok(validarDestino(recusado) === '/', `(a) '${recusado}' → '/'`, validarDestino(recusado));
}
ok(
  JSON.stringify([...ABAS_DO_ENDERECO]) === JSON.stringify([...ABAS_DA_EMPRESA]),
  '(a) as 7 abas de empresa-do-endereco.ts são as mesmas de rotas-console.ts',
  JSON.stringify([...ABAS_DO_ENDERECO])
);
// O padrão das duas cópias tem de concordar caminho a caminho.
for (const caminho of [
  '/e/gtech',
  '/e/gtech/regras',
  '/e/codigo-vencedor/configuracoes',
  '/e/gtech/nada',
  '/e/Gtech',
  '/e/gtech/',
  `/e/${'a'.repeat(40)}`,
  `/e/${'a'.repeat(41)}`,
  '/empresas',
]) {
  ok(
    (slugDoEndereco(caminho) !== null) === ehEnderecoDeEmpresa(caminho),
    `(a) slugDoEndereco e ehEnderecoDeEmpresa concordam em '${caminho.length > 30 ? caminho.slice(0, 30) + '…' : caminho}'`
  );
}

/* ---------------- (b) destinoDaRotaAntiga, uma linha da tabela por asserção ---------------- */

console.log('\n  (b) destinoDaRotaAntiga');
const tabela = [
  ['/', '', '/e/gtech'],
  ['/painel', '', '/e/gtech/eventos'],
  ['/painel/compras', '', '/e/gtech/eventos?vista=compras'],
  ['/painel/eventos', '?evento=Purchase', '/e/gtech/eventos?evento=Purchase'],
  ['/pixels', '', '/e/gtech/pixels'],
  ['/instalacao', '', '/e/gtech/fontes'],
  ['/automatico', '', '/e/gtech/regras'],
  ['/integracoes', '', '/e/gtech/regras'],
  ['/integracoes', '?aba=inbox', '/e/gtech/eventos?vista=fila'],
  ['/automatico', '?aba=inbox', '/e/gtech/eventos?vista=fila'],
  ['/automatico', '?aba=regras', '/e/gtech/regras'],
  ['/automatico', '?aba=testes', '/e/gtech/regras#testes-internos'],
  ['/automatico', '?aba=retornos', '/e/gtech/regras#repasse'],
  ['/automatico', '?aba=recebimento', '/e/gtech/fontes#webhook'],
  ['/automatico', '?aba=tag', '/e/gtech/fontes#tag'],
  ['/automatico', '?aba=inventada', '/e/gtech/regras'],
  // A query é repassada; o `?aba=` nunca vai cru; a vista fixa vence.
  ['/painel', '?de=2026-09-01&ate=2026-09-20', '/e/gtech/eventos?de=2026-09-01&ate=2026-09-20'],
  ['/painel/compras', '?vista=fila&de=2026-09-01', '/e/gtech/eventos?vista=compras&de=2026-09-01'],
  ['/instalacao', 'x=1', '/e/gtech/fontes?x=1'],
  ['/integracoes', '?aba=inbox&item=abc', '/e/gtech/eventos?vista=fila&item=abc'],
];
for (const [caminho, busca, esperado] of tabela) {
  const obtido = destinoDaRotaAntiga(caminho, busca, 'gtech');
  ok(obtido === esperado, `(b) ${caminho}${busca && !busca.startsWith('?') ? '?' : ''}${busca} → ${esperado}`, obtido ?? 'null');
}
for (const naoAntiga of ['/guia', '/empresas', '/e/gtech/pixels', '/e/gtech', '/api/inbox', '/login', '/painel/inventada']) {
  const obtido = destinoDaRotaAntiga(naoAntiga, '', 'gtech');
  ok(obtido === null, `(b) '${naoAntiga}' não é rota antiga → null`, String(obtido));
}
ok(
  destinoDaRotaAntiga('/pixels', '', 'codigo-vencedor') === '/e/codigo-vencedor/pixels',
  '(b) slug com hífen vai inteiro'
);
ok(destinoDaRotaAntiga('/painel', '', '') === null, '(b) sem slug da ativa → null (o proxy deixa a página de reserva decidir)');
// `ehRotaAntiga` é a pergunta que o proxy faz antes de ler o disco: tem de
// bater com a tabela, nos dois sentidos.
for (const [caminho] of tabela) {
  ok(ehRotaAntiga(caminho), `(b) ehRotaAntiga('${caminho}')`);
}
for (const naoAntiga of ['/guia', '/empresas', '/e/gtech/pixels', '/e/gtech', '/api/inbox', '/login', '/painel/inventada']) {
  ok(!ehRotaAntiga(naoAntiga), `(b) !ehRotaAntiga('${naoAntiga}')`);
}
ok(
  [...ROTAS_ANTIGAS].every((c) => destinoDaRotaAntiga(c, '', 'gtech') !== null),
  '(b) toda rota de ROTAS_ANTIGAS tem destino na tabela'
);

console.log('\n  (b2) Qual sub-aba a aba Regras abre (até a V7)');
ok(abaDasRegrasPeloEndereco(null, '') === 'regras', '(b2) sem aba e sem âncora → Regras (e não a Caixa de entrada)');
ok(abaDasRegrasPeloEndereco(null, '#repasse') === 'retornos', '(b2) #repasse → Repasse');
ok(abaDasRegrasPeloEndereco(null, '#testes-internos') === 'testes', '(b2) #testes-internos → Testes');
ok(abaDasRegrasPeloEndereco('inbox', '') === null, '(b2) ?aba= já na URL → não mexe');
ok(abaDasRegrasPeloEndereco(null, '#historico') === null, '(b2) hash que o Automático já entende → não mexe');

/* ---------------- (c) destinoAoTrocar ---------------- */

console.log('\n  (c) destinoAoTrocar');
ok(
  destinoAoTrocar('/e/gtech/pixels', 'codigo-vencedor') === '/e/codigo-vencedor/pixels',
  "(c) ('/e/gtech/pixels', 'codigo-vencedor') → '/e/codigo-vencedor/pixels'"
);
ok(destinoAoTrocar('/empresas', 'gtech') === '/e/gtech', "(c) ('/empresas', 'gtech') → '/e/gtech'");
ok(destinoAoTrocar('/e/alfa', 'beta') === '/e/beta', "(c) da Visão geral → Visão geral da nova");
ok(destinoAoTrocar('/e/alfa/regras', 'beta') === '/e/beta/regras', '(c) Regras → Regras da nova');
ok(destinoAoTrocar('/e/alfa/nada', 'beta') === '/e/beta', '(c) aba desconhecida → Visão geral da nova');
ok(destinoAoTrocar('/painel', 'beta') === '/e/beta', '(c) rota antiga → Visão geral da nova');
ok(destinoAoTrocar('/guia', 'beta') === '/e/beta', '(c) Guia → Visão geral da nova');

/* ---------------- (d) prepararEmpresaDoEndereco ---------------- */

console.log('\n  (d) prepararEmpresaDoEndereco');

// d1: store e cookie FALSOS, registrando a ordem.
{
  const ordem = [];
  let estado = { empresaAtivaId: 'default' };
  const storeFalso = {
    getState: () => estado,
    setState: (parcial) => {
      ordem.push(`store:${parcial.empresaAtivaId}`);
      estado = { ...estado, ...parcial };
    },
  };
  const escreverCookieFalso = (id) => ordem.push(`cookie:${id}`);

  const r = prepararEmpresaDoEndereco('emp_x', storeFalso, escreverCookieFalso);
  ok(r.pronto === true, '(d1) devolve pronto: true');
  ok(r.trocou === true, '(d1) diz que trocou (o store estava em default)');
  ok(estado.empresaAtivaId === 'emp_x', '(d1) o store falso foi trocado para emp_x', estado.empresaAtivaId);
  ok(ordem.includes('cookie:emp_x'), "(d1) escreverCookieFalso('emp_x') chamado", JSON.stringify(ordem));
  ok(
    JSON.stringify(ordem) === JSON.stringify(['cookie:emp_x', 'store:emp_x']),
    '(d1) cookie antes do store, os dois antes de devolver (ordem de setEmpresaAtiva)',
    JSON.stringify(ordem)
  );

  ordem.length = 0;
  const denovo = prepararEmpresaDoEndereco('emp_x', storeFalso, escreverCookieFalso);
  ok(denovo.pronto === true && denovo.trocou === false, '(d1) store já certo → pronto, sem troca');
  ok(!ordem.some((o) => o.startsWith('store:')), '(d1) store já certo → setState NÃO é chamado (sem escrita à toa no persist)');
  ok(ordem.includes('cookie:emp_x'), '(d1) o cookie é regravado mesmo assim (barato, e cobre cookie apagado)');

  ordem.length = 0;
  const vazio = prepararEmpresaDoEndereco('', storeFalso, escreverCookieFalso);
  ok(vazio.pronto === false && ordem.length === 0, '(d1) id vazio → não pronto, nada tocado');
}

// d1b: a trava de "já alinhou" do EmpresaDoEndereco.
{
  let estado = { empresaAtivaId: 'default' };
  const storeFalso = { getState: () => estado };
  const ler = travaDeAlinhamento('emp_x', storeFalso);
  ok(ler() === false, '(d1b) antes de o store chegar à empresa do endereço: filhos esperam');
  estado = { empresaAtivaId: 'emp_x' };
  ok(ler() === true, '(d1b) store alinhado: filhos montam');
  estado = { empresaAtivaId: 'emp_y' };
  ok(ler() === true, '(d1b) outra aba trocou depois: a tela NÃO desmonta (o rascunho fica)');
  ok(travaDeAlinhamento('', { getState: () => ({ empresaAtivaId: '' }) })() === false, '(d1b) id vazio nunca alinha');
}

// d2: o store DE VERDADE e o `pedir()` de verdade.
{
  ok(useEmpresaStore.getState().empresaAtivaId === 'default', '(d2) o store nasce em default', useEmpresaStore.getState().empresaAtivaId);
  ok(chamadas.length === 0, '(d2) nenhum pedido de rede até aqui', JSON.stringify(chamadas));

  let pedidosQuandoOCookieFoiEscrito = -1;
  const cookieEspiao = (id) => {
    pedidosQuandoOCookieFoiEscrito = chamadas.length;
    escreverCookieEmpresa(id);
  };
  const r = prepararEmpresaDoEndereco('emp_x', useEmpresaStore, cookieEspiao);
  ok(r.pronto === true, '(d2) pronto com o store real');
  ok(pedidosQuandoOCookieFoiEscrito === 0, '(d2) antes de pronto o fetch falso não recebeu nada');
  ok(chamadas.length === 0, '(d2) e continua sem nada até o primeiro pedir()');
  ok(useEmpresaStore.getState().empresaAtivaId === 'emp_x', '(d2) o store real está em emp_x', useEmpresaStore.getState().empresaAtivaId);
  ok(
    cookiesEscritos.some((c) => c.startsWith('capi_empresa=emp_x;') && /Path=\//.test(c)),
    '(d2) document.cookie recebeu capi_empresa=emp_x com Path=/',
    cookiesEscritos.at(-1) ?? '(nenhum)'
  );

  await pedir('/api/teste-navegacao');
  ok(chamadas.length === 1, '(d2) um pedido chegou ao fetch falso', String(chamadas.length));
  ok(chamadas[0]?.empresa === 'emp_x', '🔴 (d2) a primeira pedir() saiu com X-Empresa-Id: emp_x', JSON.stringify(chamadas[0] ?? null));
}

/* ---------------- (e) acharEmpresaPorSlug ---------------- */

console.log('\n  (e) acharEmpresaPorSlug');
const registro = await listarEmpresas();
ok(
  JSON.stringify(registro.map((e) => e.id)) === JSON.stringify(['default', 'emp_a', 'emp_b']),
  '(e) o registro temporário tem a padrão + 2 empresas',
  JSON.stringify(registro.map((e) => e.id))
);
ok((await acharEmpresaPorSlug('nao-existe')) === undefined, "(e) 'nao-existe' → undefined");
ok((await acharEmpresaPorSlug('beta'))?.id === 'emp_b', "(e) 'beta' → emp_b");
ok((await acharEmpresaPorSlug('alfa'))?.id === 'emp_a', "(e) 'alfa' → emp_a");
ok((await acharEmpresaPorSlug('codigo-vencedor'))?.id === 'default', "(e) 'codigo-vencedor' → default");
ok((await acharEmpresaPorSlug('Beta')) === undefined, "(e) 'Beta' (maiúscula) → undefined: comparação exata");
ok((await acharEmpresaPorSlug('')) === undefined, "(e) '' → undefined");
ok(process.cwd() === tmp, '(e) o cwd continua no diretório temporário (o config/ real nunca foi lido)');

/* ---------------- (f) O contrato I4, no proxy de verdade ---------------- */

console.log('\n  (f) proxy');
const token = assinarSessao('operador', 1);
ok(typeof token === 'string' && token.length > 0, '(f) cookie de sessão assinado pela mesma função da rota de login');

const pedirAoProxy = (caminho, cookieEmpresa, { comSessao = true } = {}) => {
  const partes = [];
  if (comSessao) partes.push(`${COOKIE_SESSAO}=${token}`);
  if (cookieEmpresa) partes.push(`capi_empresa=${cookieEmpresa}`);
  // `host` explícito: requisição de verdade sempre traz o cabeçalho, e o
  // proxy trata a falta dele como endereço do cliente (404), que é o lado
  // seguro do bloqueio por Host (2º deploy, 26/09).
  return proxy(
    new NextRequest(`http://localhost${caminho}`, {
      headers: partes.length ? { host: 'localhost', cookie: partes.join('; ') } : { host: 'localhost' },
    })
  );
};
const setCookie = (r) => r.headers.get('set-cookie');
const seguiu = (r) => r.status === 200 && r.headers.get('x-middleware-next') === '1';

{
  const r = await pedirAoProxy('/e/beta/pixels', 'emp_a');
  const sc = setCookie(r) ?? '';
  ok(seguiu(r), '(f) /e/beta/pixels com cookie emp_a → 200/next', `${r.status}`);
  ok(/(^|[\s,;])capi_empresa=emp_b(;|$)/.test(sc), '🔴 (f) Set-Cookie com capi_empresa=emp_b', sc || '(sem Set-Cookie)');
  ok(/Path=\//i.test(sc), '(f) Set-Cookie com Path=/', sc);
  ok(new RegExp(`Max-Age=${COOKIE_EMPRESA_MAX_AGE}`, 'i').test(sc), '(f) Set-Cookie com o Max-Age de COOKIE_EMPRESA_MAX_AGE', sc);
  ok(/SameSite=Lax/i.test(sc), '(f) Set-Cookie com SameSite=Lax', sc);
  ok(!/Secure/i.test(sc), '(f) sem Secure fora de produção', sc);
  ok(r.headers.get('cache-control') === 'private, no-store', '(f) Cache-Control private, no-store mantido', String(r.headers.get('cache-control')));
}
{
  const antes = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const r = await pedirAoProxy('/e/beta', 'emp_a');
    ok(/Secure/i.test(setCookie(r) ?? ''), '(f) com NODE_ENV=production o cookie sai Secure', setCookie(r) ?? '(sem Set-Cookie)');
  } finally {
    if (antes === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = antes;
  }
}
{
  const r = await pedirAoProxy('/e/beta/pixels', 'emp_b');
  ok(seguiu(r) && setCookie(r) === null, '(f) /e/beta/pixels com cookie emp_b → segue, sem Set-Cookie', setCookie(r) ?? '');
}
{
  const r = await pedirAoProxy('/e/beta/dominio', undefined);
  ok(/capi_empresa=emp_b/.test(setCookie(r) ?? ''), '(f) /e/beta/dominio sem cookie de empresa → grava emp_b', setCookie(r) ?? '(sem Set-Cookie)');
}
{
  const r = await pedirAoProxy('/e/nao-existe', 'emp_a');
  ok(seguiu(r) && setCookie(r) === null, '(f) /e/nao-existe → segue (o layout dá 404), sem Set-Cookie', setCookie(r) ?? '');
}
{
  const r = await pedirAoProxy('/e/beta/nada', 'emp_a');
  ok(seguiu(r) && setCookie(r) === null, '(f) /e/beta/<aba desconhecida> → sem Set-Cookie', setCookie(r) ?? '');
}
{
  const r = await pedirAoProxy('/api/inbox', 'emp_a');
  ok(seguiu(r) && setCookie(r) === null, '(f) /api/inbox com cookie emp_a → sem Set-Cookie (API não é realinhada)', setCookie(r) ?? '');
}
{
  const r = await pedirAoProxy('/painel', 'emp_b');
  const destino = r.headers.get('location') ?? '';
  ok(r.status === 307, '🔴 (f) /painel com cookie emp_b → 307', String(r.status));
  ok(new URL(destino, 'http://localhost').pathname === '/e/beta/eventos', '(f) Location /e/beta/eventos', destino);
  ok(r.headers.get('cache-control') === 'private, no-store', '(f) 307 com Cache-Control private, no-store', String(r.headers.get('cache-control')));
}
{
  const r = await pedirAoProxy('/painel', undefined);
  const destino = new URL(r.headers.get('location') ?? '/', 'http://localhost');
  ok(r.status === 307 && destino.pathname === '/e/codigo-vencedor/eventos', '(f) /painel sem cookie de empresa → a padrão', destino.pathname);
}
{
  const r = await pedirAoProxy('/painel', 'emp_inexistente');
  const destino = new URL(r.headers.get('location') ?? '/', 'http://localhost');
  ok(r.status === 307 && destino.pathname === '/e/codigo-vencedor/eventos', '(f) cookie de empresa apagada → a padrão', destino.pathname);
}
{
  const r = await pedirAoProxy('/automatico?aba=retornos', 'emp_a');
  const destino = new URL(r.headers.get('location') ?? '/', 'http://localhost');
  ok(
    r.status === 307 && destino.pathname === '/e/alfa/regras' && destino.hash === '#repasse' && destino.search === '',
    '(f) /automatico?aba=retornos → /e/alfa/regras#repasse, num salto só',
    `${destino.pathname}${destino.search}${destino.hash}`
  );
}
{
  const r = await pedirAoProxy('/painel/eventos?evento=Purchase', 'emp_a');
  const destino = new URL(r.headers.get('location') ?? '/', 'http://localhost');
  ok(
    r.status === 307 && destino.pathname === '/e/alfa/eventos' && destino.searchParams.get('evento') === 'Purchase',
    '(f) /painel/eventos?evento=Purchase repassa a query',
    `${destino.pathname}${destino.search}`
  );
}
{
  const r = await pedirAoProxy('/', 'emp_a');
  const destino = new URL(r.headers.get('location') ?? '/', 'http://localhost');
  ok(r.status === 307 && destino.pathname === '/e/alfa', '(f) / → Visão geral da ativa', destino.pathname);
}
{
  const r = await pedirAoProxy('/guia', 'emp_a');
  ok(seguiu(r) && setCookie(r) === null, '(f) /guia segue como está', `${r.status}`);
}
{
  const r = await pedirAoProxy('/empresas', 'emp_a');
  ok(seguiu(r) && setCookie(r) === null, '(f) /empresas segue como está', `${r.status}`);
}
{
  const r = await pedirAoProxy('/e/beta/pixels', 'emp_a', { comSessao: false });
  const destino = new URL(r.headers.get('location') ?? '/', 'http://localhost');
  ok(
    r.status === 307 && destino.pathname === '/login' && destino.searchParams.get('destino') === '/e/beta/pixels',
    '(f) sem sessão, /e/beta/pixels → /login?destino=/e/beta/pixels (o padrão é destino válido)',
    `${destino.pathname}${destino.search}`
  );
  ok(setCookie(r) === null, '(f) sem sessão, nenhum cookie de empresa é gravado');
}
{
  const r = await pedirAoProxy('/painel', 'emp_b', { comSessao: false });
  const destino = new URL(r.headers.get('location') ?? '/', 'http://localhost');
  ok(r.status === 307 && destino.pathname === '/login', '(f) sem sessão, rota antiga continua indo ao /login', destino.pathname);
}
{
  const r = await pedirAoProxy('/api/inbox', 'emp_a', { comSessao: false });
  ok(r.status === 401, '(f) sem sessão, a API continua 401', String(r.status));
}

console.log('\n  (f2) empresaIdDoEndereco');
const empresasDoTeste = [
  { id: 'emp_a', slug: 'alfa' },
  { id: 'emp_b', slug: 'beta' },
];
ok(empresaIdDoEndereco('/e/beta', empresasDoTeste) === 'emp_b', "(f2) '/e/beta' → emp_b");
ok(empresaIdDoEndereco('/e/beta/dominio', empresasDoTeste) === 'emp_b', "(f2) '/e/beta/dominio' → emp_b");
ok(empresaIdDoEndereco('/empresas', empresasDoTeste) === null, "(f2) '/empresas' → null");
ok(empresaIdDoEndereco('/e/Beta', empresasDoTeste) === null, "(f2) '/e/Beta' → null");
ok(empresaIdDoEndereco('/e/gama', empresasDoTeste) === null, "(f2) slug que não existe → null");

/* ---------------- (g) Estático ---------------- */

console.log('\n  (g) Estático');
const ler = (rel) => {
  try {
    return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  } catch {
    return null;
  }
};
const DIR_E = path.join(RAIZ, 'src', 'app', '(console)', 'e');
const arquivosDeE = [];
const andar = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const cheio = path.join(dir, item.name);
    if (item.isDirectory()) andar(cheio);
    else if (/\.(tsx?|jsx?)$/.test(item.name)) arquivosDeE.push(cheio);
  }
};
andar(DIR_E);
ok(arquivosDeE.length > 0, '(g) a pasta src/app/(console)/e existe', String(arquivosDeE.length));
const leemCookie = arquivosDeE.filter((f) => /empresaDaPagina|cookies\(\)/.test(fs.readFileSync(f, 'utf8')));
ok(
  leemCookie.length === 0,
  '🔴 (g) nenhuma página de /e/ lê o cookie para decidir a empresa (empresaDaPagina, cookies())',
  leemCookie.map((f) => path.relative(RAIZ, f)).join(', ')
);

const PAGINAS = [
  'page.tsx',
  'dominio/page.tsx',
  'fontes/page.tsx',
  'pixels/page.tsx',
  'eventos/page.tsx',
  'teste/page.tsx',
  'regras/page.tsx',
  'configuracoes/page.tsx',
];
for (const pagina of PAGINAS) {
  const texto = ler(path.join('src', 'app', '(console)', 'e', '[slug]', pagina));
  ok(texto !== null && texto.includes('key={empresaId}'), `(g) e/[slug]/${pagina} remonta por empresa (key={empresaId})`);
}
for (const extra of ['layout.tsx', 'not-found.tsx']) {
  ok(ler(path.join('src', 'app', '(console)', 'e', '[slug]', extra)) !== null, `(g) e/[slug]/${extra} existe`);
}
ok(ler(path.join('src', 'app', '(console)', 'empresas', 'page.tsx')) !== null, '(g) /empresas/page.tsx existe');

const dialogo = ler(path.join('src', 'components', 'empresa', 'EmpresaDialog.tsx')) ?? '';
ok(
  !/router\.push\('\/instalacao'\)|router\.push\('\/pixels'\)/.test(dialogo),
  '(g) EmpresaDialog não manda mais para /instalacao nem /pixels'
);
const seletor = ler(path.join('src', 'components', 'empresa', 'SeletorDeEmpresa.tsx')) ?? '';
ok(/destinoAoTrocar\(/.test(seletor) && /router\.push\(/.test(seletor), '(g) SeletorDeEmpresa troca de empresa navegando (destinoAoTrocar + router.push)');

const textoProxy = ler(path.join('src', 'proxy.ts')) ?? '';
ok(/cookies\.set\(/.test(textoProxy) && /COOKIE_EMPRESA\b/.test(textoProxy), '(g) proxy grava o cookie da empresa (bloco b)');
ok(
  (textoProxy.match(/NextResponse\.redirect\([^)]*,\s*307\)/g) ?? []).length >= 2,
  '(g) proxy tem o 307 das rotas antigas e o do login'
);
ok(!/cookieEmpresaDe|cookieDaRequisicao/.test(textoProxy), '(g) proxy lê o cookie por req.cookies.get, sem helper privado');
const importDeEmpresaAtiva = /import\s*\{([^}]*)\}\s*from\s*'@\/lib\/empresa-ativa'/.exec(textoProxy)?.[1] ?? '';
const nomesImportados = importDeEmpresaAtiva
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean)
  .sort();
ok(
  JSON.stringify(nomesImportados) === JSON.stringify(['COOKIE_EMPRESA', 'COOKIE_EMPRESA_MAX_AGE', 'resolverEmpresaId']),
  '(g) de empresa-ativa o proxy importa só COOKIE_EMPRESA, COOKIE_EMPRESA_MAX_AGE e resolverEmpresaId',
  JSON.stringify(nomesImportados)
);

/* ---------------- Rede: nada saiu ---------------- */

ok(
  !chamadas.some((c) => /graph\.facebook\.com|api\.cloudflare\.com/i.test(c.url)),
  '🔴 nenhuma tentativa de falar com a Meta ou a Cloudflare'
);

try {
  process.chdir(RAIZ);
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* limpeza do temporário é cortesia */
}

console.log(falhas === 0 ? '\n  Navegação por empresa: tudo OK.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
