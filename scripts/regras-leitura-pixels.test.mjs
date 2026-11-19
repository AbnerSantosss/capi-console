#!/usr/bin/env node
/**
 * A regra não diz "Pixel não encontrado" enquanto a lista de Pixels carrega
 * (T-M12, plano v8).
 *
 * Só LÊ o fonte de `RulesSection.tsx`. Nenhuma rede, nenhuma escrita.
 *
 *   a  `estadoDoSwitch` recebe a leitura da lista e tem um texto para
 *      "carregando" e outro para "erro";
 *   b  o componente lê `carregado`, `carregando` e `erro` do store de Pixels
 *      e passa a leitura adiante;
 *   c  o cabeçalho da regra não afirma "desligado" antes de a lista chegar;
 *   d  o que já existia continua: "Ligado", "Desligado" e a frase das duas
 *      travas.
 *
 * Uso: npm run test:regras-leitura-pixels
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cru = fs.readFileSync(
  path.join(RAIZ, 'src', 'components', 'integrations', 'RulesSection.tsx'),
  'utf8'
);
/** Sem comentários de bloco e sem as linhas que são só `//`. */
const fonte = cru.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  a. estadoDoSwitch sabe como está a leitura');
ok(
  /type LeituraDosPixels = 'carregando' \| 'erro' \| 'pronta';/.test(fonte),
  "a1: existe o tipo LeituraDosPixels com 'carregando', 'erro' e 'pronta'"
);
ok(
  /function estadoDoSwitch\(\s*m: MarcaPublica \| undefined,\s*leitura: LeituraDosPixels\s*\)/.test(fonte),
  'a2: estadoDoSwitch recebe a leitura como segundo parâmetro'
);
const corpo = fonte.slice(fonte.indexOf('function estadoDoSwitch('), fonte.indexOf('function pixelsDaRegra('));
const posCarregando = corpo.indexOf("leitura === 'carregando'");
const posErro = corpo.indexOf("leitura === 'erro'");
const posNaoEncontrado = corpo.indexOf('Pixel não encontrado nesta empresa');
ok(
  posCarregando !== -1 && posErro !== -1 && posNaoEncontrado !== -1,
  'a3: os três casos de Pixel fora da lista existem'
);
ok(
  posCarregando < posNaoEncontrado && posErro < posNaoEncontrado,
  'a4: "não encontrado" só vem depois de descartar "carregando" e "erro"'
);
ok(corpo.includes('Carregando o estado do Pixel…'), 'a5: texto de "carregando"');
ok(corpo.includes('Estado não lido. Use "Tentar de novo" no aviso acima.'), 'a6: texto de "erro" com o próximo passo');

console.log('\n  b. o componente lê o estado da lista');
ok(/useBrandStore\(\(s\) => s\.carregado\)/.test(fonte), 'b1: lê `carregado`');
ok(/useBrandStore\(\(s\) => s\.carregando\)/.test(fonte), 'b2: lê `carregando`');
ok(/useBrandStore\(\(s\) => s\.erro\)/.test(fonte), 'b3: lê `erro`');
ok(/estadoDoSwitch\(m, leituraDosPixels\)/.test(fonte), 'b4: passa a leitura para estadoDoSwitch');
ok(!/estadoDoSwitch\(m\)/.test(fonte), 'b5: não sobrou chamada sem a leitura');

console.log('\n  c. o cabeçalho da regra espera a lista');
ok(/pixelsSemLeitura/.test(fonte), 'c1: conta os Pixels que ainda não foram lidos');
ok(
  /leituraDosPixels !== 'pronta' && pixelsSemLeitura > 0/.test(fonte),
  'c2: sem leitura pronta, o cabeçalho não afirma "desligado"'
);
ok(fonte.includes('Conferindo os Pixels…') && fonte.includes('Pixels não lidos'), 'c3: textos do cabeçalho');

console.log('\n  d. o que já existia continua');
ok(/'Ligado'/.test(fonte) && /Desligado — vai para a Fila/.test(fonte), 'd1: "Ligado" e "Desligado" continuam');
ok(/Só sai sozinho quando as duas estão ligadas/.test(fonte), 'd2: a frase das duas travas continua');

console.log(falhas === 0 ? '\n  Leitura dos Pixels na regra: tudo certo.' : `\n  ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
