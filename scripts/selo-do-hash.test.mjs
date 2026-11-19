#!/usr/bin/env node
/**
 * O selo "SHA-256" diz qual caso viu (T-M36, plano v8).
 *
 * Nenhuma rede, nenhuma escrita. Os valores abaixo são inventados para o
 * teste: nenhum é dado de comprador, e nada é enviado.
 *
 *   a  o cálculo (`src/lib/emq.ts`): dado em claro, já em hash e ausente;
 *   b  hash pronto conta como preenchido (antes, e-mail em hash era "Ausente");
 *   c  o texto do selo em cada caso;
 *   d  o painel usa a função, e o selo fixo saiu.
 *
 * Uso: npm run test:selo-do-hash
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calcularEmq, seloDoHash } from '../src/lib/emq.ts';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe !== '' ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};
const ler = (relativo) => {
  const caminho = path.join(RAIZ, ...relativo.split('/'));
  return fs.existsSync(caminho) ? fs.readFileSync(caminho, 'utf8') : '';
};
const semComentario = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// 64 caracteres de [0-9a-f]: o formato de um SHA-256. Não é hash de ninguém.
const HASH_A = 'a'.repeat(64);
const HASH_B = '0123456789abcdef'.repeat(4);
const de = (campos, id) => calcularEmq(campos).parametros.find((p) => p.id === id);

console.log('\n  a. O caso visto');
const claro = calcularEmq({ email: 'pessoa@exemplo.com', phone: '11987654321', firstName: 'Ana', lastName: 'Lima' });
const emHash = calcularEmq({ email: HASH_A, phone: HASH_B, firstName: HASH_A, lastName: HASH_B });
const vazio = calcularEmq({});
for (const id of ['email', 'phone', 'nome']) {
  ok(claro.parametros.find((p) => p.id === id)?.jaEmHash === false, `a1 (${id}): dado em claro não é "já em hash"`);
  ok(emHash.parametros.find((p) => p.id === id)?.jaEmHash === true, `a2 (${id}): dado em hash é "já em hash"`);
  ok(vazio.parametros.find((p) => p.id === id)?.jaEmHash === false, `a3 (${id}): dado ausente não é "já em hash"`);
}
ok(de({ email: HASH_A.toUpperCase() }, 'email')?.jaEmHash === true, 'a4: hash em maiúsculas também é hash');
ok(de({ firstName: HASH_A, lastName: 'Lima' }, 'nome')?.jaEmHash === false, 'a5: nome em hash + sobrenome em claro = em claro');
ok(de({ firstName: HASH_A }, 'nome')?.jaEmHash === true, 'a6: só o nome, em hash = já em hash');
ok(vazio.parametros.filter((p) => !p.hash).every((p) => p.jaEmHash === undefined), 'a7: parâmetro que não vai em hash não ganha o campo');

console.log('\n  b. Hash pronto conta como preenchido');
ok(de({ email: HASH_A }, 'email')?.presente === true, 'b1: e-mail já em hash está presente');
ok(de({ phone: 'abcdef'.repeat(10) + 'abcd' }, 'phone')?.presente === true, 'b2: telefone já em hash está presente, mesmo sem dígito');
ok(de({ email: 'sem-arroba' }, 'email')?.presente === false, 'b3: texto solto continua ausente');
ok(de({ phone: '1234' }, 'phone')?.presente === false, 'b4: telefone curto continua ausente');
ok(calcularEmq({ email: HASH_A }).nota === calcularEmq({ email: 'pessoa@exemplo.com' }).nota, 'b5: a nota é a mesma com o e-mail em claro ou em hash');

console.log('\n  c. O texto do selo');
ok(seloDoHash(de({ email: 'pessoa@exemplo.com' }, 'email'))?.texto === 'SHA-256 no envio', 'c1: em claro = "SHA-256 no envio"');
ok(seloDoHash(de({ email: HASH_A }, 'email'))?.texto === 'já em SHA-256', 'c2: em hash = "já em SHA-256"');
ok(seloDoHash(de({}, 'email'))?.texto === 'SHA-256', 'c3: ausente = "SHA-256"');
ok(seloDoHash(de({}, 'fbc')) === null, 'c4: parâmetro que não vai em hash não tem selo');
ok(seloDoHash(de({ fbc: 'fb.1.1700000000.exemplo' }, 'fbc')) === null, 'c5: fbc preenchido também não tem selo');
const explicacoes = [
  seloDoHash(de({ email: 'pessoa@exemplo.com' }, 'email'))?.explicacao ?? '',
  seloDoHash(de({ email: HASH_A }, 'email'))?.explicacao ?? '',
  seloDoHash(de({}, 'email'))?.explicacao ?? '',
];
ok(explicacoes.every((t) => t.length > 0) && new Set(explicacoes).size === 3, 'c6: cada caso tem a sua explicação');

console.log('\n  d. O painel');
const painel = semComentario(ler('src/components/quality/QualityPanel.tsx'));
ok(painel.includes('seloDoHash(parametro)'), 'd1: o painel pergunta o texto à função');
ok(painel.includes('<SeloDoHashNaTabela parametro={p} />'), 'd2: a tabela monta o selo novo');
ok(!painel.includes('Transformado em hash SHA-256 antes do envio'), 'd3: o texto fixo antigo saiu');
ok(!/>\s*SHA-256\s*</.test(painel), 'd4: nenhum "SHA-256" fixo sobrou no painel');
const lib = semComentario(ler('src/lib/emq.ts'));
ok(/import \{ jaEhSha256 \} from '\.\/hash-detect';/.test(lib), 'd5: a detecção é a que já existe (jaEhSha256)');
ok(!/server-only/.test(lib), 'd6: emq.ts continua sem server-only (o painel roda no navegador)');

console.log(falhas === 0 ? '\n  Selo do hash: tudo certo.' : `\n  ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
