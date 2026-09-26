#!/usr/bin/env node
/**
 * Escrita só na empresa de onde os dados vieram (T1) e recusa de aba e
 * navegador divergentes (T6) — tarefa C1 do plano de correções do pacote 16.
 *
 * O defeito, no ar: a tela de Instalação/Automático guardava os dados da
 * empresa A; o operador trocava para a B (nesta aba ou em outra) e clicava em
 * Salvar. O `PUT /api/integracoes` resolvia a empresa pelo header/cookie DO
 * MOMENTO do clique e gravava o corpo inteiro — tirado da A — por cima do
 * arquivo da B. Configuração de cliente trocada não avisa ninguém: só para de
 * funcionar, ou pior, passa a mandar venda para o Pixel errado.
 *
 * O que este arquivo prova, com os handlers de verdade (nada copiado):
 *
 *   A  PUT sem `empresaId` no corpo → 400, e NADA gravado (byte a byte)
 *   B  PUT com `empresaId` diferente da empresa ativa → 409, nada gravado
 *   C  header `X-Empresa-Id` e cookie `capi_empresa` divergentes → 409
 *   D  a comparação header x cookie é dos valores CRUS: empresa apagada no
 *      header não "vira" a padrão e passa como igual
 *   E  PUT coerente → 200, grava na empresa certa, e `empresaId` não vai ao disco
 *   F  sem cookie (ou sem header) segue como antes
 *   G  POST /api/integracoes (troca de credencial) também recusa divergência
 *   H  POST /api/inbox/disparar recusa divergência ANTES de qualquer envio
 *   I  401 continua vindo antes do 409: sem sessão, nada é revelado
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/: ele anota a URL e LANÇA sempre — para a Graph API, para a
 * Cloudflare e para qualquer outro lugar. Nenhum caso daqui precisa de resposta
 * de fora; um envio que escapasse viraria falha visível. Sem ACCESS_TOKEN e
 * sem PIXEL_ID, e tudo roda num diretório temporário: o `config/` real nunca é
 * lido nem escrito.
 *
 * Roda SEM `--conditions=react-server`, como `rotas-api.test.mjs`: carregar um
 * route.ts arrasta meta-capi → meta-events → ícones.
 *
 * Uso: npm run test:empresa-escrita
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

/** Só a URL de cada tentativa. Nada de corpo: ele levaria token. */
const chamadas = [];
const fetchFalso = async (entrada) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  chamadas.push(url);
  if (/graph\.facebook\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Meta');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Cloudflare');
  throw new Error('rede bloqueada pelo teste');
};
globalThis.fetch = fetchFalso;

/* Credenciais de mentira ANTES de carregar sessao.ts, que lê o ambiente no import. */
process.env.CONSOLE_USER = 'admin';
process.env.CONSOLE_PASSWORD = 'senha-super-segura-com-mais-de-12-chars';
process.env.SESSION_SECRET = 'segredo-de-sessao-muito-seguro-com-mais-de-32-caracteres-para-teste';
/* Nada do .env: nenhum token existe aqui, então nada teria como sair para a Meta. */
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-empresa-escrita-'));
const CONFIG = path.join(tmp, 'config');
fs.mkdirSync(CONFIG, { recursive: true });
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raizAnterior = process.cwd();
// empresas.ts, config-store.ts e inbox.ts resolvem `<cwd>/config` e
// `<cwd>/logs` no import: o `chdir` vem ANTES, senão o teste tocaria o real.
process.chdir(tmp);

/* ---------------- 1. Sementes: três empresas que existem ---------------- */

const AGORA = '2026-09-23T00:00:00.000Z';
fs.writeFileSync(
  path.join(CONFIG, 'empresas.json'),
  JSON.stringify(
    {
      empresas: [
        { id: 'default', nome: 'Empresa Padrão (teste)', slug: 'padrao-teste', criadoEm: AGORA },
        { id: 'emp_a', nome: 'Empresa A', slug: 'empresa-a', criadoEm: AGORA },
        { id: 'emp_b', nome: 'Empresa B', slug: 'empresa-b', criadoEm: AGORA },
      ],
    },
    null,
    2
  ),
  'utf8'
);

/** Integrações mínimas e falsas de uma empresa. O segredo é de mentira. */
const integracoesMinimas = (id) => ({
  entrada: { segredo: `segredo-falso-${id}`, modo: 'fila', rotulo: `rotulo-${id}` },
  regras: [],
  saida: [],
  tag: { chave: `cvt_falsa_${id}`, dominios: [] },
});

const ARQ_DEFAULT = path.join(CONFIG, 'integracoes.json');
const ARQ_A = path.join(CONFIG, 'integracoes.emp_a.json');
const ARQ_B = path.join(CONFIG, 'integracoes.emp_b.json');
fs.writeFileSync(ARQ_DEFAULT, JSON.stringify(integracoesMinimas('default'), null, 2), 'utf8');
fs.writeFileSync(ARQ_A, JSON.stringify(integracoesMinimas('emp_a'), null, 2), 'utf8');
fs.writeFileSync(ARQ_B, JSON.stringify(integracoesMinimas('emp_b'), null, 2), 'utf8');

/* ---------------- 2. Imports de src/, depois da rede trancada e do chdir ---------------- */

const { NextRequest } = await import('next/server.js');
const { assinarSessao, COOKIE_SESSAO } = await import(
  new URL('../src/lib/sessao.ts', import.meta.url).href
);
const ativa = await import(new URL('../src/lib/empresa-ativa.ts', import.meta.url).href);
const rotaIntegracoes = await import(
  new URL('../src/app/api/integracoes/route.ts', import.meta.url).href
);
const rotaDisparar = await import(
  new URL('../src/app/api/inbox/disparar/route.ts', import.meta.url).href
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
 * de qualquer chamada de rota — continuar seria arriscar uma chamada de verdade.
 */
function exigirFetchFalso() {
  if (globalThis.fetch !== fetchFalso) {
    console.error('  FALHA  o fetch falso foi trocado por outro: o teste para antes de qualquer chamada.');
    encerrar(1);
  }
}
exigirFetchFalso();

const SESSAO = `${COOKIE_SESSAO}=${assinarSessao('admin', 12)}`;

/**
 * Uma requisição como a tela manda: sessão sempre (salvo `semSessao`), o
 * header da empresa quando `header` vem, e o cookie `capi_empresa` quando
 * `cookieEmpresa` vem.
 */
function req(caminho, { metodo = 'PUT', corpo, header, cookieEmpresa, semSessao = false } = {}) {
  exigirFetchFalso();
  const cookies = [];
  if (!semSessao) cookies.push(SESSAO);
  if (cookieEmpresa !== undefined) cookies.push(`${ativa.COOKIE_EMPRESA}=${cookieEmpresa}`);
  const headers = {};
  if (cookies.length) headers.cookie = cookies.join('; ');
  if (header !== undefined) headers['x-empresa-id'] = header;
  const init = { method: metodo, headers };
  if (corpo !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  }
  return new NextRequest('http://localhost:3333' + caminho, init);
}

async function corpoDe(res) {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { __naoEhJson: txt.slice(0, 120) };
  }
}

const lerArq = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

/** O estado inteiro de `config/`: nome e conteúdo de cada arquivo. */
function fotoDoConfig() {
  return fs
    .readdirSync(CONFIG)
    .sort()
    .map((nome) => `${nome}\n${lerArq(path.join(CONFIG, nome))}`)
    .join('\n----\n');
}

const put = async (opcoes) => {
  const res = await rotaIntegracoes.PUT(req('/api/integracoes', { metodo: 'PUT', ...opcoes }));
  return { status: res.status, tipo: res.headers.get('content-type') ?? '', corpo: await corpoDe(res) };
};

/** Um save igual ao da lista de testes: pequeno, válido, e fácil de achar no disco. */
const corpoValido = (empresaId, nome = 'Pessoa Teste Interno') => ({
  ...(empresaId !== undefined ? { empresaId } : {}),
  testes: { nomes: [nome] },
});

console.log('\n  Escrita por empresa: empresaId no corpo e header x cookie coerentes (C1: T1, T6)\n');

/* ---------------- 0. A função existe ---------------- */

const temFuncao = typeof ativa.empresaParaEscrita === 'function';
ok(temFuncao, 'empresa-ativa.ts exporta empresaParaEscrita(req)');

/* ---------------- A. Sem empresaId no corpo: 400 e nada gravado ---------------- */

console.log('\n  A. PUT sem empresaId');
{
  const antes = fotoDoConfig();
  const antesDefault = lerArq(ARQ_DEFAULT);
  const r = await put({ corpo: corpoValido(undefined) });
  ok(r.status === 400, '🔴 A1: PUT sem empresaId → 400', `status=${r.status}`);
  ok(r.tipo.includes('application/json') && typeof r.corpo.erro === 'string', 'A1: a recusa vem em JSON { erro }');
  ok(/empresaId/.test(r.corpo.erro ?? ''), 'A1: a mensagem diz o que falta (empresaId)', r.corpo.erro ?? '');
  ok(lerArq(ARQ_DEFAULT) === antesDefault, '🔴 A1: config/integracoes.json byte a byte igual ao de antes');
  ok(fotoDoConfig() === antes, 'A1: nenhum arquivo de config/ mudou nem nasceu');
}
{
  const antes = fotoDoConfig();
  const r = await put({ corpo: { empresaId: 42, testes: { nomes: ['Pessoa Teste Interno'] } } });
  ok(r.status === 400 && fotoDoConfig() === antes, 'A2: empresaId que não é texto → 400, nada gravado', `status=${r.status}`);
}
{
  const antes = fotoDoConfig();
  const r = await put({ corpo: corpoValido('   '), header: 'emp_a', cookieEmpresa: 'emp_a' });
  ok(r.status === 400 && fotoDoConfig() === antes, 'A3: empresaId em branco → 400, nada gravado', `status=${r.status}`);
}

/* ---------------- B. empresaId diferente da empresa ativa: 409 ---------------- */

console.log('\n  B. PUT com dados de uma empresa e a outra ativa');
{
  const antes = fotoDoConfig();
  const antesA = lerArq(ARQ_A);
  const antesB = lerArq(ARQ_B);
  const r = await put({ corpo: corpoValido('emp_a'), header: 'emp_b' });
  ok(r.status === 409, '🔴 B1: empresaId emp_a com header emp_b → 409', `status=${r.status}`);
  ok(
    /Empresa A/.test(r.corpo.erro ?? '') && /Empresa B/.test(r.corpo.erro ?? '') && /Recarregue/.test(r.corpo.erro ?? ''),
    'B1: a mensagem nomeia as duas empresas e manda recarregar',
    r.corpo.erro ?? ''
  );
  ok(lerArq(ARQ_A) === antesA && lerArq(ARQ_B) === antesB, '🔴 B1: nada gravado nem na A nem na B');
  ok(fotoDoConfig() === antes, 'B1: nenhum arquivo de config/ mudou nem nasceu');
}
{
  const antes = fotoDoConfig();
  const r = await put({ corpo: corpoValido('emp_a') }); // sem header e sem cookie: a ativa é a padrão
  ok(
    r.status === 409 && fotoDoConfig() === antes,
    'B2: dados da A com a padrão ativa (sem header nem cookie) → 409, nada gravado na padrão',
    `status=${r.status}`
  );
}
{
  const antes = fotoDoConfig();
  const r = await put({ corpo: corpoValido('emp_apagada'), header: 'emp_apagada' });
  ok(
    r.status === 409 && fotoDoConfig() === antes,
    'B3: dados de empresa apagada (header e corpo) → 409, e não caem na padrão',
    `status=${r.status}`
  );
}

/* ---------------- C. Header e cookie divergentes: 409 ---------------- */

console.log('\n  C. Aba numa empresa, navegador em outra');
{
  const antes = fotoDoConfig();
  const r = await put({ corpo: corpoValido('emp_a'), header: 'emp_a', cookieEmpresa: 'emp_b' });
  ok(r.status === 409, '🔴 C1: header emp_a + cookie emp_b → 409', `status=${r.status}`);
  ok(
    /aba/.test(r.corpo.erro ?? '') && /navegador/.test(r.corpo.erro ?? '') && /Recarregue a página/.test(r.corpo.erro ?? ''),
    'C1: a mensagem explica aba x navegador e manda recarregar',
    r.corpo.erro ?? ''
  );
  ok(fotoDoConfig() === antes, '🔴 C1: nada gravado em nenhuma empresa');
}
{
  const antes = fotoDoConfig();
  const r = await put({ corpo: corpoValido('emp_b'), header: 'emp_a', cookieEmpresa: 'emp_b' });
  ok(
    r.status === 409 && fotoDoConfig() === antes,
    'C2: mesmo com o corpo batendo com o cookie, header ≠ cookie → 409',
    `status=${r.status}`
  );
}

/* ---------------- D. Comparação CRUA (rodada 1, M3) ---------------- */

console.log('\n  D. Comparação crua, antes de resolver a empresa');
{
  const antes = fotoDoConfig();
  const r = await put({ corpo: corpoValido('emp_a'), header: 'emp_apagada', cookieEmpresa: 'emp_a' });
  ok(
    r.status === 409 && fotoDoConfig() === antes,
    '🔴 D1: header emp_apagada (não existe) + cookie emp_a → 409, nada gravado',
    `status=${r.status}`
  );
}
{
  // O caso que a comparação dos valores RESOLVIDOS deixaria passar: os dois
  // lados cairiam em 'default' e pareceriam iguais.
  const antes = fotoDoConfig();
  const r = await put({ corpo: corpoValido('default'), header: 'emp_apagada', cookieEmpresa: 'default' });
  ok(
    r.status === 409 && fotoDoConfig() === antes,
    '🔴 D2: header emp_apagada + cookie default → 409 (resolvidos, os dois dariam "default")',
    `status=${r.status}`
  );
}
if (temFuncao) {
  const pedido = (h, c) =>
    new Request('http://localhost:3333/api/integracoes', {
      method: 'PUT',
      headers: { 'x-empresa-id': h, cookie: `${ativa.COOKIE_EMPRESA}=${c}` },
    });
  let status = 0;
  try {
    await ativa.empresaParaEscrita(pedido('emp_b', 'emp_a'));
  } catch (e) {
    status = e instanceof Response ? e.status : -1;
  }
  ok(status === 409, 'D3: empresaParaEscrita lança uma Response 409 (a mesma que erroDeRota devolve)', `status=${status}`);
  const aparado = await ativa.empresaParaEscrita(pedido(' emp_a ', 'emp_a')).catch(() => 'lançou');
  ok(aparado === 'emp_a', 'D4: espaço em volta não conta como divergência (trim)', String(aparado));
}

/* ---------------- I. 401 antes do 409 ---------------- */

console.log('\n  I. Sem sessão, 401 vem primeiro');
{
  const antes = fotoDoConfig();
  const r = await put({ corpo: corpoValido('emp_a'), header: 'emp_a', cookieEmpresa: 'emp_b', semSessao: true });
  ok(r.status === 401 && fotoDoConfig() === antes, 'I1: sem sessão e com divergência → 401, não 409', `status=${r.status}`);
}

/* ---------------- G. POST /api/integracoes (troca de credencial) ---------------- */

console.log('\n  G. POST /api/integracoes');
{
  const antes = fotoDoConfig();
  const res = await rotaIntegracoes.POST(
    req('/api/integracoes', { metodo: 'POST', corpo: { alvo: 'entrada' }, header: 'emp_a', cookieEmpresa: 'emp_b' })
  );
  await corpoDe(res);
  ok(res.status === 409, '🔴 G1: troca de segredo com header emp_a + cookie emp_b → 409', `status=${res.status}`);
  ok(fotoDoConfig() === antes, '🔴 G1: nenhum segredo nem chave foi girado em empresa nenhuma');
}
{
  const antes = fotoDoConfig();
  const res = await rotaIntegracoes.POST(
    req('/api/integracoes', { metodo: 'POST', header: 'emp_b', cookieEmpresa: 'emp_a' })
  );
  await corpoDe(res);
  ok(
    res.status === 409 && fotoDoConfig() === antes,
    'G2: sem corpo (a chamada antiga) e com divergência → 409, nada girado',
    `status=${res.status}`
  );
}

/* ---------------- H. POST /api/inbox/disparar ---------------- */

console.log('\n  H. POST /api/inbox/disparar');
{
  const antesChamadas = chamadas.length;
  const res = await rotaDisparar.POST(
    req('/api/inbox/disparar', {
      metodo: 'POST',
      corpo: { id: 'item-que-nao-importa', marcas: ['default'] },
      header: 'emp_a',
      cookieEmpresa: 'emp_b',
    })
  );
  const corpo = await corpoDe(res);
  ok(res.status === 409, '🔴 H1: header emp_a + cookie emp_b → 409', `status=${res.status}`);
  ok(/Recarregue a página/.test(corpo.erro ?? ''), 'H1: a mensagem manda recarregar', corpo.erro ?? '');
  ok(chamadas.length === antesChamadas, '🔴 H1: o espião de fetch não foi chamado', `chamadas=${chamadas.length - antesChamadas}`);
}
{
  // Controle: coerente, a rota segue o caminho de sempre (item inexistente → 404).
  const antesChamadas = chamadas.length;
  const res = await rotaDisparar.POST(
    req('/api/inbox/disparar', {
      metodo: 'POST',
      corpo: { id: 'item-que-nao-existe' },
      header: 'emp_a',
      cookieEmpresa: 'emp_a',
    })
  );
  await corpoDe(res);
  ok(
    res.status === 404 && chamadas.length === antesChamadas,
    'H2: controle — header = cookie segue igual a antes (item inexistente → 404), sem rede',
    `status=${res.status}`
  );
}

/* ---------------- E. PUT coerente: grava na empresa certa, sem empresaId no disco ---------------- */

console.log('\n  E. PUT coerente');
{
  const antesDefault = lerArq(ARQ_DEFAULT);
  const antesB = lerArq(ARQ_B);
  const r = await put({
    corpo: corpoValido('emp_a', 'Pessoa Teste da A'),
    header: 'emp_a',
    cookieEmpresa: 'emp_a',
  });
  ok(r.status === 200, '🔴 E1: empresaId = header = cookie = emp_a → 200', `status=${r.status}`);
  const gravado = JSON.parse(lerArq(ARQ_A) ?? '{}');
  ok(
    gravado.testes?.nomes?.[0] === 'Pessoa Teste da A',
    'E1: gravou em integracoes.emp_a.json',
    JSON.stringify(gravado.testes?.nomes)
  );
  ok(!('empresaId' in gravado), '🔴 E1: empresaId NÃO aparece no JSON gravado');
  ok(!('empresaId' in (r.corpo.integracoes ?? {})), 'E1: nem na resposta, que espelha o gravado');
  ok(
    lerArq(ARQ_DEFAULT) === antesDefault && lerArq(ARQ_B) === antesB,
    'E1: a padrão e a B continuam byte a byte iguais'
  );
  ok(gravado.entrada?.segredo === 'segredo-falso-emp_a', 'E1: o segredo da A é o dela, intocado');
}

/* ---------------- F. Sem cookie, ou sem header: como antes ---------------- */

console.log('\n  F. Um lado só: segue como antes');
{
  const antesA = lerArq(ARQ_A);
  const r = await put({ corpo: corpoValido('emp_b', 'Pessoa Teste da B'), header: 'emp_b' });
  const gravadoB = JSON.parse(lerArq(ARQ_B) ?? '{}');
  ok(
    r.status === 200 && gravadoB.testes?.nomes?.[0] === 'Pessoa Teste da B' && !('empresaId' in gravadoB),
    'F1: só header emp_b (sem cookie) + empresaId emp_b → 200 na B',
    `status=${r.status}`
  );
  ok(lerArq(ARQ_A) === antesA, 'F1: a A não foi tocada');
}
{
  const r = await put({ corpo: corpoValido('emp_a', 'Outra Pessoa da A'), cookieEmpresa: 'emp_a' });
  const gravadoA = JSON.parse(lerArq(ARQ_A) ?? '{}');
  ok(
    r.status === 200 && gravadoA.testes?.nomes?.[0] === 'Outra Pessoa da A',
    'F2: só cookie emp_a (sem header, como uma página de servidor) + empresaId emp_a → 200 na A',
    `status=${r.status}`
  );
}
{
  const r = await put({ corpo: corpoValido('default', 'Pessoa Teste Padrão') });
  const gravadoDefault = JSON.parse(lerArq(ARQ_DEFAULT) ?? '{}');
  ok(
    r.status === 200 && gravadoDefault.testes?.nomes?.[0] === 'Pessoa Teste Padrão' && !('empresaId' in gravadoDefault),
    'F3: sem header nem cookie + empresaId "default" → 200 em config/integracoes.json',
    `status=${r.status}`
  );
}

/* ---------------- Fim ---------------- */

ok(chamadas.length === 0, '🔴 nenhuma tentativa de rede em toda a suíte', `chamadas=${chamadas.length}`);

console.log(
  falhas === 0
    ? '\n  Escrita por empresa trancada: empresaId obrigatório, header x cookie coerentes, nada gravado na recusa.\n'
    : `\n  ${falhas} falha(s).\n`
);
encerrar(falhas === 0 ? 0 : 1);
