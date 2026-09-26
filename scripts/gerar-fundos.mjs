#!/usr/bin/env node
/**
 * Gera as cópias otimizadas dos fundos e dos ícones de navegação do design
 * do dono (v7, tarefa V1) em `public/brand/`.
 *
 * Uso (a partir da raiz do app):
 *
 *   node scripts/gerar-fundos.mjs <pasta-da-entrega>
 *
 * `<pasta-da-entrega>` é a pasta que o dono entregou, com `backgrounds/` e
 * `icones/` dentro. O caminho dela vem SEMPRE por argumento e nunca fica
 * gravado aqui: nenhum caminho de fora do repositório entra no código do app
 * (trava T-h do plano v7). O app só conhece as cópias em `public/brand/`.
 *
 * O que sai (13 arquivos):
 *
 *   public/brand/fundo/lateral.webp|.avif      384×1024  (1x da lateral)
 *   public/brand/fundo/lateral@2x.webp|.avif   768×2048  (2x, o original)
 *   public/brand/fundo/principal.webp|.avif    1536×1024 (só 1x: é degradê)
 *   public/brand/nav/<aba>-72.png              72×72 com alfa (servido a 36px)
 *
 * O `sharp` não é dependência do app: vem transitivo pelo `next`, e é
 * carregado por `createRequire` para não instalar nada.
 */

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(join(RAIZ, 'package.json'))('sharp');

const origem = process.argv[2];
if (!origem) {
  console.error('\n  Uso: node scripts/gerar-fundos.mjs <pasta-da-entrega>\n');
  process.exit(1);
}
const ORIGEM = resolve(origem);
const DESTINO = join(RAIZ, 'public', 'brand');

const FUNDOS = [
  { de: 'backgrounds/background-lateral.png', para: 'fundo/lateral', w: 384, h: 1024 },
  { de: 'backgrounds/background-lateral.png', para: 'fundo/lateral@2x', w: 768, h: 2048 },
  { de: 'backgrounds/background-principal.png', para: 'fundo/principal', w: 1536, h: 1024 },
];

const ABAS = ['visao-geral', 'dominio', 'fontes', 'pixels', 'eventos', 'regras', 'configuracoes'];

const kb = (arquivo) => `${(statSync(arquivo).size / 1024).toFixed(1)} KB`;

for (const pasta of ['fundo', 'nav']) mkdirSync(join(DESTINO, pasta), { recursive: true });

for (const f of FUNDOS) {
  const entrada = join(ORIGEM, f.de);
  if (!existsSync(entrada)) {
    console.error(`\n  Falta ${f.de} na pasta da entrega.\n`);
    process.exit(1);
  }
  const base = sharp(entrada).resize(f.w, f.h, { fit: 'cover', position: 'centre' });
  const webp = join(DESTINO, `${f.para}.webp`);
  const avif = join(DESTINO, `${f.para}.avif`);
  await base.clone().webp({ quality: 74, effort: 6 }).toFile(webp);
  await base.clone().avif({ quality: 50, effort: 6 }).toFile(avif);
  console.log(`  ${f.para}  ${f.w}×${f.h}  webp ${kb(webp)}  avif ${kb(avif)}`);
}

for (const aba of ABAS) {
  const entrada = join(ORIGEM, 'icones', `${aba}.png`);
  if (!existsSync(entrada)) {
    console.error(`\n  Falta icones/${aba}.png na pasta da entrega.\n`);
    process.exit(1);
  }
  const saida = join(DESTINO, 'nav', `${aba}-72.png`);
  await sharp(entrada)
    .resize(72, 72, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(saida);
  console.log(`  nav/${aba}-72.png  72×72  ${kb(saida)}`);
}
