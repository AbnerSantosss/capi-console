#!/usr/bin/env node
/**
 * Cada empresa com a sua memória de vendas recentes (M-05).
 *
 * 🔴 Por que este arquivo existe. A memória da Fila guardava os últimos 1000
 * itens somados de TODAS as empresas. Uma empresa com muita visita no site
 * enchia os 1000 e as vendas da empresa quieta saíam da memória: o painel dela
 * ficava vazio com venda gravada no disco.
 *
 * O teste roda num `cwd` temporário (o módulo resolve `<cwd>/logs` no import),
 * com dado inventado: 5 itens de uma empresa quieta, 3 sem `empresaId` (contam
 * como `default`) e 1200 de uma empresa barulhenta, nessa ordem. Nada daqui lê
 * o `logs/` de verdade nem envia evento a lugar nenhum.
 *
 * Uso: npm run test:inbox-teto
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-inbox-teto-'));
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const ARQ = path.join(tmp, 'logs', 'inbox.jsonl');

const BASE = Date.parse('2026-09-10T00:00:00.000Z');
/** Um segundo por item: a ordem do arquivo é a ordem do relógio. */
const hora = (k) => new Date(BASE + k * 1000).toISOString();
const linha = (id, k, empresaId) => ({
  id,
  recebidoEm: hora(k),
  status: 'novo',
  origem: 'webhook',
  evento: 'Purchase',
  temFbc: false,
  temFbp: false,
  ...(empresaId ? { empresaId } : {}),
  payload: {},
});

const linhas = [];
let k = 0;
for (let n = 1; n <= 5; n++) linhas.push(linha(`q${n}`, k++, 'emp_quieta'));
for (let n = 1; n <= 3; n++) linhas.push(linha(`d${n}`, k++, undefined));
for (let n = 1; n <= 1200; n++) linhas.push(linha(`b${n}`, k++, 'emp_barulhenta'));
fs.writeFileSync(ARQ, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');

const raizAnterior = process.cwd();
process.chdir(tmp);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  Memória da Fila por empresa (M-05)\n');

/* ---------------- 0. A função pura ---------------- */
const teto = await import(new URL('../src/lib/inbox-teto.ts', import.meta.url).href);

ok(teto.LIMITE_POR_EMPRESA === 1000, 'o teto é de 1000 itens por empresa', 'veio ' + teto.LIMITE_POR_EMPRESA);

const amostra = [
  { id: 'a1', empresaId: 'a' },
  { id: 'x1' },
  { id: 'a2', empresaId: 'a' },
  { id: 'b1', empresaId: 'b' },
  { id: 'a3', empresaId: 'a' },
  { id: 'x2', empresaId: 'padrao' },
  { id: 'x3' },
];
const cortada = teto.manterUltimosPorEmpresa(amostra, 2, 'padrao');
const idsCortados = cortada.map((i) => i.id).join(',');
ok(
  idsCortados === 'a2,b1,a3,x2,x3',
  '🔴 cada empresa fica com os 2 últimos dela, na ordem em que chegaram',
  'veio ' + idsCortados
);
ok(amostra.length === 7, 'a lista recebida não é alterada');
ok(teto.manterUltimosPorEmpresa(amostra, 0, 'padrao').length === 0, 'teto 0 não guarda nada');
ok(teto.manterUltimosPorEmpresa([], 1000, 'padrao').length === 0, 'lista vazia devolve lista vazia');

/* ---------------- 1. A primeira leitura do disco ---------------- */
const inbox = await import(new URL('../src/lib/inbox.ts', import.meta.url).href);

const quieta = await inbox.listarEntradas(1000, 'emp_quieta');
ok(
  quieta.length === 5,
  '🔴 a empresa quieta continua com as 5 dela, com 1200 itens de outra empresa depois',
  'veio ' + quieta.length
);
ok(quieta[0].id === 'q5' && quieta[4].id === 'q1', 'e na ordem de sempre: da mais nova para a mais velha');

const padrao = await inbox.listarEntradas(1000, 'default');
ok(padrao.length === 3, 'os 3 itens sem empresaId contam como default', 'veio ' + padrao.length);

const barulhenta = await inbox.listarEntradas(1000, 'emp_barulhenta');
ok(barulhenta.length === 1000, 'a barulhenta fica com 1000, o teto dela', 'veio ' + barulhenta.length);
ok(
  barulhenta[0].id === 'b1200' && barulhenta[999].id === 'b201',
  'e são os 1000 mais novos: de b1200 até b201',
  `veio de ${barulhenta[0].id} até ${barulhenta[999]?.id}`
);

const tudo = await inbox.listarEntradas(5000);
ok(tudo.length === 1008, 'sem empresaId vem tudo o que está na memória: 1000 + 5 + 3', 'veio ' + tudo.length);
ok(
  tudo[0].id === 'b1200' && tudo[tudo.length - 1].id === 'q1',
  'a lista única continua em ordem de chegada'
);

ok(
  (await inbox.inicioDaMemoriaNoTeto('emp_quieta')) === null,
  '🔴 a empresa quieta NÃO está no teto: o painel dela pode confiar no que leu'
);
ok((await inbox.inicioDaMemoriaNoTeto('default')) === null, 'a default também não está no teto');
ok((await inbox.inicioDaMemoriaNoTeto('emp_que_nao_existe')) === null, 'empresa sem item nenhum: null');
// q1..q5 ocupam k=0..4, d1..d3 ocupam k=5..7, b1 é k=8, então b201 é k=208.
const inicioBarulhenta = await inbox.inicioDaMemoriaNoTeto('emp_barulhenta');
ok(
  inicioBarulhenta === Date.parse(hora(208)),
  'a barulhenta está no teto, e a memória dela começa no b201',
  'veio ' + inicioBarulhenta
);

/* ---------------- 2. Chegada de item novo ---------------- */
const chegar = (empresaId) =>
  inbox.registrarEntrada({
    origem: 'webhook',
    evento: 'Purchase',
    temFbc: false,
    temFbp: false,
    ...(empresaId ? { empresaId } : {}),
    payload: {},
  });

await chegar('emp_barulhenta');
await chegar('emp_barulhenta');
const terceira = await chegar('emp_barulhenta');
const barulhentaDepois = await inbox.listarEntradas(1000, 'emp_barulhenta');
ok(barulhentaDepois.length === 1000, 'com 3 chegadas a barulhenta continua em 1000', 'veio ' + barulhentaDepois.length);
ok(
  barulhentaDepois[0].id === terceira.id && barulhentaDepois[999].id === 'b204',
  'entraram as 3 novas e saíram as 3 mais velhas DELA (b201, b202, b203)',
  `a mais velha agora é ${barulhentaDepois[999]?.id}`
);
ok(
  (await inbox.listarEntradas(1000, 'emp_quieta')).length === 5,
  '🔴 a chegada na barulhenta não tirou nada da quieta'
);
ok((await inbox.listarEntradas(1000, 'default')).length === 3, 'nem da default');

const novaQuieta = await chegar('emp_quieta');
const quietaDepois = await inbox.listarEntradas(1000, 'emp_quieta');
ok(
  quietaDepois.length === 6 && quietaDepois[0].id === novaQuieta.id && quietaDepois[5].id === 'q1',
  'a quieta recebe a 6ª e não perde nenhuma'
);
ok(
  (await inbox.listarEntradas(1000, 'emp_barulhenta')).length === 1000,
  'e a chegada na quieta não mexe na barulhenta'
);

const novaPadrao = await chegar(undefined);
ok((await inbox.listarEntradas(1000, 'default')).length === 4, 'item sem empresaId entra na default');

/* ---------------- 3. O disco não muda de formato ---------------- */
const noDisco = fs.readFileSync(ARQ, 'utf8').split('\n').filter(Boolean);
ok(
  noDisco.length === 1208 + 5,
  'o arquivo guarda TUDO (1208 de antes + 5 chegadas): o teto é só da memória',
  'veio ' + noDisco.length
);
const gravadas = noDisco.map((l) => JSON.parse(l));
const linhaDaQuieta = gravadas.find((l) => l.id === novaQuieta.id);
ok(
  linhaDaQuieta !== undefined &&
    Object.keys(linhaDaQuieta).sort().join(',') ===
      'empresaId,evento,id,origem,payload,recebidoEm,status,temFbc,temFbp',
  '🔴 a linha nova tem os mesmos campos de sempre: nenhum campo novo no inbox.jsonl',
  linhaDaQuieta ? Object.keys(linhaDaQuieta).sort().join(',') : 'linha não achada'
);
const linhaDaPadrao = gravadas.find((l) => l.id === novaPadrao.id);
ok(
  linhaDaPadrao !== undefined && !('empresaId' in linhaDaPadrao),
  'item sem empresaId continua gravado sem o campo'
);
ok(gravadas[0].id === 'q1', 'a primeira linha do arquivo continua sendo a mais antiga (nada foi reescrito)');

/* ---------------- Fechamento ---------------- */
process.chdir(raizAnterior);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Cada empresa tem a própria memória: a barulhenta não apaga a venda da quieta.\n'
    : `\n  ${falhas} FALHA(S)\n`
);
process.exit(falhas ? 1 : 0);
