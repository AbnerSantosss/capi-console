#!/usr/bin/env node
/**
 * O sinal de "carregando" ao trocar de aba da empresa (T-M18, plano v8).
 *
 * Só LÊ os fontes. Nenhuma rede, nenhuma escrita.
 *
 *   a  existe `loading.tsx` na pasta da empresa, e ele reutiliza o esqueleto
 *      do produto;
 *   b  ele não lê nada (não pode esperar: aparece antes de tudo);
 *   c  é o único `loading.tsx` do app (um nível acima ele esconderia as abas).
 *
 * Uso: npm run test:carregando-da-aba
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMINHO = path.join(RAIZ, 'src', 'app', '(console)', 'e', '[slug]', 'loading.tsx');

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  a. O arquivo e o que ele reutiliza');
const existe = fs.existsSync(CAMINHO);
ok(existe, 'a1: src/app/(console)/e/[slug]/loading.tsx existe');
const cru = existe ? fs.readFileSync(CAMINHO, 'utf8') : '';
const fonte = cru.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(/export default function \w+\(\)/.test(fonte), 'a2: exporta um componente padrão, sem parâmetros');
ok(
  /import \{ Esqueleto, RegiaoDeEspera \} from '@\/components\/common\/Esqueleto';/.test(fonte),
  'a3: importa Esqueleto e RegiaoDeEspera do lugar único de espera'
);
ok(fonte.includes('<main className={consoleStyles.page}>'), 'a4: usa a mesma moldura das páginas (consoleStyles.page)');
ok(/<RegiaoDeEspera rotulo="[^"]+"/.test(fonte), 'a5: o leitor de tela ouve o que está acontecendo (rotulo)');
ok((fonte.match(/<Esqueleto /g) ?? []).length >= 2, 'a6: tem a forma da página (título e conteúdo)');

console.log('\n  b. Ele não lê nada');
ok(!/\basync\b|\bawait\b/.test(fonte), 'b1: sem async nem await');
ok(!/cookies\(|headers\(|fetch\(|lerIntegracoes|empresaDosParams|empresaDoSlug/.test(fonte), 'b2: sem cookie, cabeçalho, rede nem leitura de configuração');
ok(!/['"]use client['"]/.test(fonte), 'b3: é componente de servidor (sem "use client")');

console.log('\n  c. É o único do app');
const achados = [];
const andar = (pasta) => {
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) andar(caminho);
    else if (/^loading\.(tsx|ts|jsx|js)$/.test(item.name)) achados.push(path.relative(RAIZ, caminho).replace(/\\/g, '/'));
  }
};
andar(path.join(RAIZ, 'src', 'app'));
ok(
  achados.length === 1 && achados[0] === 'src/app/(console)/e/[slug]/loading.tsx',
  'c1: só existe o loading.tsx da pasta da empresa',
  achados.join(', ')
);

console.log(falhas === 0 ? '\n  Carregando da aba: tudo certo.' : `\n  ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
