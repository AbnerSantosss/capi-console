#!/usr/bin/env node
/**
 * T-M21 — nenhum link "Abrir Regras" tira o operador da tela em que ele está.
 *
 *   a  nenhum arquivo de `src/` traz o texto "Abrir Regras", nem em comentário;
 *   b  o cartão do Pixel não recebe mais o endereço da aba Regras e, no estado
 *      "ligado sem regra", diz o próximo passo por escrito;
 *   c  o painel de Pixels não monta link nem lê o endereço para montar um, e a
 *      frase das duas travas é visível;
 *   d  a explicação "manual ou automático" só monta link quando a linha tem o
 *      texto `abrir`, e a linha do automático não tem.
 *
 * Só lê fonte: não sobe o app e não chama nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe !== '' ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const ler = (relativo) => {
  const inteiro = path.join(RAIZ, relativo);
  return fs.existsSync(inteiro) ? fs.readFileSync(inteiro, 'utf8') : '';
};

const semComentario = (texto) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Todos os `.ts` e `.tsx` de uma pasta, com as subpastas. */
function arquivosDe(pasta) {
  const saida = [];
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const inteiro = path.join(pasta, item.name);
    if (item.isDirectory()) saida.push(...arquivosDe(inteiro));
    else if (/\.(ts|tsx)$/.test(item.name)) saida.push(inteiro);
  }
  return saida;
}

console.log('\n  a. O texto saiu de src/');
const comOTexto = arquivosDe(path.join(RAIZ, 'src'))
  .filter((arquivo) => /abrir\s+(as\s+)?regras/i.test(fs.readFileSync(arquivo, 'utf8')))
  .map((arquivo) => path.relative(RAIZ, arquivo).split(path.sep).join('/'));
ok(comOTexto.length === 0, 'a1: nenhum arquivo de src/ tem "Abrir Regras"', comOTexto.join(' | '));

console.log('\n  b. O cartão do Pixel');
const cartao = ler('src/components/pixels/CardDePixel.tsx');
const cartaoCodigo = semComentario(cartao);
ok(cartao !== '', 'b0: o arquivo do cartão existe');
ok(!/hrefRegras/.test(cartao), 'b1: o cartão não recebe mais hrefRegras');
ok(!/from 'next\/link'/.test(cartao), 'b2: o cartão não importa next/link');
ok(!/buttonVariants/.test(cartao), 'b3: o cartão não usa mais buttonVariants');
ok(
  /estado\.faixa === 'ligado-sem-regra' && \(\s*<p\b[^>]*>\s*Falta a regra\./.test(cartaoCodigo),
  'b4: o estado "ligado sem regra" mostra a frase do próximo passo'
);
ok(/Na aba Regras, ponha em Automático/.test(cartaoCodigo), 'b5: a frase diz onde e o que fazer');
ok(
  /Colar o token/.test(cartaoCodigo) && /Tudo certo/.test(cartaoCodigo),
  'b6: as outras duas saídas do cartão continuam'
);

console.log('\n  c. O painel de Pixels');
const painel = ler('src/components/pixels/PixelsPanel.tsx');
ok(painel !== '', 'c0: o arquivo do painel existe');
ok(!/abaRegras|cartaoJaLevaARegras|hrefRegras/.test(painel), 'c1: nada no painel monta o endereço da aba Regras');
ok(!/from 'next\/link'/.test(painel) && !/useParams/.test(painel), 'c2: o painel não importa next/link nem useParams');
ok(!/enderecoDaAba/.test(painel), 'c3: o painel não importa enderecoDaAba');
ok(
  /Só sai sozinho quando as duas estão ligadas: a regra em Automático,/.test(painel),
  'c4: a legenda diz quais são as duas'
);
ok(!/sr-only/.test(painel), 'c5: a frase das duas não está mais escondida');

console.log('\n  d. A explicação "manual ou automático"');
const explicacao = ler('src/components/common/ExplicacaoDoDisparo.tsx');
const inicioAutomatico = explicacao.indexOf('automatico: {');
const fimAutomatico = explicacao.indexOf('const ORDEM');
const blocoAutomatico =
  inicioAutomatico >= 0 && fimAutomatico > inicioAutomatico
    ? explicacao.slice(inicioAutomatico, fimAutomatico)
    : '';
ok(/abrir\?: string;/.test(explicacao), 'd1: o texto do link é opcional');
ok(blocoAutomatico !== '' && !/\babrir:/.test(blocoAutomatico), 'd2: a linha do automático não tem link');
ok(
  /aba Regras/.test(blocoAutomatico) && /aba Pixels/.test(blocoAutomatico),
  'd3: a linha do automático diz onde ele se liga'
);
ok(/\{!aqui && abrir && \(/.test(explicacao), 'd4: o link só é montado quando a linha tem o texto');
ok(/eventos\?vista=manual/.test(explicacao), 'd5: o endereço do envio manual continua (g2 do test:abas)');

console.log(falhas === 0 ? '\n  Sem "Abrir Regras": tudo certo.' : `\n  ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
