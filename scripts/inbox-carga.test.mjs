#!/usr/bin/env node
/**
 * A primeira leitura da caixa de entrada, quando DUAS telas pedem ao mesmo tempo.
 *
 * 🔴 Por que este arquivo existe. O Painel de eventos e a caixa de entrada
 * carregam juntos na primeira tela do console. `carregarDoDisco()` levantava a
 * trava `carregado = true` ANTES do `await fs.readFile`, então a segunda
 * chamada do mesmo tick via a trava de pé, voltava na hora e lia `memoria`
 * ainda vazia. O sintoma era o pior possível: o Painel dizia "0 eventos
 * recebidos" numa empresa com venda entrando, e um F5 desfazia — ou seja, um
 * número mentiroso que não dava para reproduzir de propósito.
 *
 * O teste roda num `cwd` temporário (o módulo resolve `<cwd>/logs` no import) e
 * dispara as duas leituras SEM `await` entre elas, que é a única forma de
 * reproduzir a corrida.
 *
 * Uso: npm run test:inbox-carga
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-inbox-carga-'));
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });

/** Três linhas: duas da padrão (uma sem `empresaId`) e uma de outra empresa. */
const linhas = [
  { id: 'i1', recebidoEm: '2026-09-12T10:00:00.000Z', status: 'novo', origem: 'webhook', evento: 'Purchase', temFbc: false, temFbp: false, payload: {} },
  { id: 'i2', recebidoEm: '2026-09-12T11:00:00.000Z', status: 'disparado', origem: 'webhook', evento: 'Purchase', temFbc: false, temFbp: false, empresaId: 'default', payload: {} },
  { id: 'i3', recebidoEm: '2026-09-12T12:00:00.000Z', status: 'novo', origem: 'webhook', evento: 'Purchase', temFbc: false, temFbp: false, empresaId: 'emp_x', payload: {} },
];
fs.writeFileSync(
  path.join(tmp, 'logs', 'inbox.jsonl'),
  linhas.map((l) => JSON.stringify(l)).join('\n') + '\n',
  'utf8'
);

const raizAnterior = process.cwd();
process.chdir(tmp);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  Primeira carga da caixa de entrada\n');

const inbox = await import(new URL('../src/lib/inbox.ts', import.meta.url).href);

/* ---------------- 1. Duas leituras no mesmo tick ---------------- */
// Sem `await` entre as duas: é exatamente o que o Painel e a lista fazem quando
// a primeira tela do console monta.
const [a, b] = await Promise.all([inbox.listarEntradas(1000), inbox.listarEntradas(1000)]);

ok(a.length === 3, 'a primeira leitura traz as três linhas', 'veio ' + a.length);
ok(
  b.length === 3,
  '🔴 e a SEGUNDA também — quem chega no meio da leitura espera, não volta vazio',
  'veio ' + b.length
);

/* ---------------- 2. Filtro por empresa depois da corrida ---------------- */
const daPadrao = await inbox.listarEntradas(1000, 'default');
ok(daPadrao.length === 2, 'a padrão fica com as duas dela (uma sem campo de empresa)', 'veio ' + daPadrao.length);
const daX = await inbox.listarEntradas(1000, 'emp_x');
ok(daX.length === 1 && daX[0].id === 'i3', 'e a emp_x com a dela');

/* ---------------- 3. A trava continua travando ---------------- */
// Depois da primeira carga, apagar o arquivo não pode esvaziar a memória: a
// releitura é uma vez por processo, e o retrofit dos sinais depende disso.
fs.rmSync(path.join(tmp, 'logs', 'inbox.jsonl'));
const depois = await inbox.listarEntradas(1000);
ok(depois.length === 3, 'a segunda chamada não relê o disco — a trava sobe e fica');

/* ---------------- Fechamento ---------------- */
process.chdir(raizAnterior);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Duas telas pedindo junto na primeira carga não produzem mais uma caixa vazia.\n'
    : `\n  ${falhas} FALHA(S)\n`
);
process.exit(falhas ? 1 : 0);
