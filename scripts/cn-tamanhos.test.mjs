#!/usr/bin/env node
/**
 * O `cn()` de `src/lib/utils.ts` não joga fora o tamanho do texto (T-R01 do
 * redesenho de 18/11/2026).
 *
 * O defeito: o `tailwind-merge` sem configuração não conhece os tamanhos do
 * tema (`text-caption`, `text-label`...) e os tratava como cor. Numa chamada
 * com tamanho e cor, só a última classe `text-*` sobrava, e o texto voltava
 * para os 16 px do body. Nada media isso, por isso o defeito durou.
 *
 * O que este arquivo prova:
 *
 *   (a) tamanho e cor convivem, nas duas ordens
 *   (b) tamanho com tamanho e cor com cor continuam em conflito (o último vence)
 *   (c) todo token `--text-<nome>:` dos blocos @theme de globals.css está em
 *       TAMANHOS_DE_TEXTO: quem criar um tamanho novo e esquecer da lista
 *       reprova aqui
 *
 * Nenhuma rede, nada é gravado: só lê o fonte e chama uma função pura.
 *
 * Uso: npm run test:cn
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let falhas = 0;
function ok(condicao, rotulo, detalhe = '') {
  if (condicao) {
    console.log(`  ok  ${rotulo}`);
  } else {
    falhas += 1;
    console.error(`  FALHA  ${rotulo}${detalhe ? ` ${detalhe}` : ''}`);
  }
}

const { cn, TAMANHOS_DE_TEXTO, MEDIDAS_DE_CONTROLE } = await import('../src/lib/utils.ts');

/** As classes da saída, como conjunto, para comparar sem depender da ordem. */
const classes = (s) => new Set(s.split(/\s+/).filter(Boolean));
const tem = (saida, ...esperadas) => {
  const c = classes(saida);
  return esperadas.every((e) => c.has(e)) && c.size === esperadas.length;
};

/* ---------------- a. Tamanho e cor convivem ---------------- */

console.log('\na. Tamanho e cor convivem');

let r = cn('text-caption text-fg-body');
ok(tem(r, 'text-caption', 'text-fg-body'), "cn('text-caption text-fg-body') mantém as duas", `→ "${r}"`);

r = cn('text-fg-muted', 'text-caption');
ok(tem(r, 'text-fg-muted', 'text-caption'), "cn('text-fg-muted', 'text-caption') mantém as duas", `→ "${r}"`);

r = cn('text-input-mobile text-fg-strong sm:text-body');
ok(
  tem(r, 'text-input-mobile', 'text-fg-strong', 'sm:text-body'),
  "cn('text-input-mobile text-fg-strong sm:text-body') mantém as três",
  `→ "${r}"`
);

/* ---------------- b. Conflitos de verdade continuam ---------------- */

console.log('\nb. Conflitos de verdade continuam');

r = cn('text-caption', 'text-label');
ok(r === 'text-label', "cn('text-caption', 'text-label') → 'text-label'", `→ "${r}"`);

r = cn('text-fg-muted', 'text-fg-body');
ok(r === 'text-fg-body', "cn('text-fg-muted', 'text-fg-body') → 'text-fg-body'", `→ "${r}"`);

/* ---------------- c. A lista cobre todo tamanho do @theme ---------------- */

console.log('\nc. TAMANHOS_DE_TEXTO cobre os tokens --text-* do @theme');

const css = fs.readFileSync(path.join(RAIZ, 'src', 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** O corpo de cada bloco `@theme ... { }`, contando as chaves. */
function blocosDeTema(texto) {
  const saida = [];
  const re = /@theme\b[^{]*\{/g;
  let casa;
  while ((casa = re.exec(texto))) {
    let nivel = 1;
    let i = casa.index + casa[0].length;
    const inicio = i;
    while (i < texto.length && nivel > 0) {
      if (texto[i] === '{') nivel += 1;
      else if (texto[i] === '}') nivel -= 1;
      i += 1;
    }
    saida.push(texto.slice(inicio, i - 1));
  }
  return saida;
}

const blocos = blocosDeTema(css);
ok(blocos.length >= 1, 'globals.css tem bloco @theme', `(${blocos.length})`);

const nomes = new Set();
for (const bloco of blocos) {
  for (const m of bloco.matchAll(/--text-([a-z0-9-]+?)\s*:/g)) {
    if (!m[1].includes('--')) nomes.add(m[1]);
  }
}
// O sufixo `--line-height` não casa acima porque o nome para no primeiro `:`;
// ainda assim, filtra qualquer nome que tenha sobrado com `--`.
const semLista = [...nomes].filter((n) => !TAMANHOS_DE_TEXTO.includes(n));
ok(nomes.size >= 8, 'achou os tokens de tamanho do @theme', `(${[...nomes].join(', ')})`);
ok(semLista.length === 0, 'todo --text-<nome> do @theme está em TAMANHOS_DE_TEXTO', JSON.stringify(semLista));

/* ---------------- d. Medidas de controle entram em conflito ---------------- */

console.log('\nd. h-control-* conflita com outra altura (a de quem chama vence)');

r = cn('h-control-sm px-3', 'h-10');
ok(tem(r, 'px-3', 'h-10'), "cn('h-control-sm px-3', 'h-10') → só h-10", `→ "${r}"`);

r = cn('size-control-sm', 'size-9');
ok(r === 'size-9', "cn('size-control-sm', 'size-9') → 'size-9'", `→ "${r}"`);

const medidas = new Set();
for (const bloco of blocos) {
  for (const m of bloco.matchAll(/--spacing-([a-z0-9-]+?)\s*:/g)) medidas.add(m[1]);
}
const medidasSemLista = [...medidas].filter((n) => !MEDIDAS_DE_CONTROLE.includes(n));
ok(medidasSemLista.length === 0, 'todo --spacing-<nome> do @theme está em MEDIDAS_DE_CONTROLE', JSON.stringify(medidasSemLista));

console.log(falhas === 0 ? '\n  cn() e tamanhos de texto: tudo OK.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
