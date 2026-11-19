#!/usr/bin/env node
/**
 * Alvos de toque e o "Fechar" do diálogo (T-M30, plano v8).
 *
 * Só LÊ fontes de `src/`. Nenhuma rede, nenhuma escrita, não abre `config/`
 * nem `logs/`.
 *
 *   a  o diálogo diz "Fechar" nos dois lugares, e não "Close";
 *   b  os botões `sm` e `icon-sm` continuam com 30px na tela e ganham a área
 *      de toque invisível só com dedo (`pointer: coarse`);
 *   c  o interruptor continua com a área de toque que já tinha.
 *
 * Uso: npm run test:alvos-de-toque
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (relativo) => fs.readFileSync(path.join(RAIZ, relativo), 'utf8');

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const dialogo = ler('src/components/ui/dialog.tsx');
const botao = ler('src/components/ui/button.tsx');
const interruptor = ler('src/components/ui/switch.tsx');

console.log('\n  a. O diálogo fala português');
ok(!/>\s*Close\s*</.test(dialogo), 'a1: nenhum texto "Close" sobrou no dialog.tsx');
ok(
  /<span className="sr-only">Fechar<\/span>/.test(dialogo),
  'a2: o X do diálogo diz "Fechar" para o leitor de tela'
);
ok(
  /<DialogPrimitive\.Close render=\{<Button variant="outline" \/>\}>\s*Fechar\s*<\/DialogPrimitive\.Close>/.test(dialogo),
  'a3: o botão do rodapé diz "Fechar"'
);

console.log('\n  b. Botões pequenos: 30px na tela, 46px no dedo');
const classesDe = (chave) => botao.match(new RegExp(`^\\s*${chave}:\\s*"([^"]*)"`, 'm'))?.[1] ?? '';
const pequeno = classesDe('sm');
const iconePequeno = classesDe('"icon-sm"');
const DEDO = '[@media(pointer:coarse)]:';
ok(pequeno.split(' ').includes('h-[30px]'), 'b1: sm continua com h-[30px]', pequeno);
ok(
  [`${DEDO}after:absolute`, `${DEDO}after:-inset-y-2`, `${DEDO}after:inset-x-0`, `${DEDO}after:content-['']`].every(
    (c) => pequeno.split(' ').includes(c)
  ),
  'b2: sm tem a área de toque invisível só com dedo',
  pequeno
);
ok(iconePequeno.split(' ').includes('size-[30px]'), 'b3: icon-sm continua com size-[30px]', iconePequeno);
ok(
  [`${DEDO}after:absolute`, `${DEDO}after:-inset-2`, `${DEDO}after:content-['']`].every((c) =>
    iconePequeno.split(' ').includes(c)
  ),
  'b4: icon-sm tem a área de toque invisível só com dedo',
  iconePequeno
);
ok(
  /"isolate overflow-hidden border-papel-active text-papel-texto"/.test(botao),
  'b5: a variante principal do botão não foi mexida'
);

console.log('\n  c. O interruptor continua com a área de toque');
ok(
  interruptor.includes('after:absolute after:-inset-y-2.5 after:-inset-x-0 after:content-[""]'),
  'c1: switch.tsx mantém a área de 44px'
);
ok(
  interruptor.includes('[@media(pointer:coarse)]:after:-inset-y-3'),
  'c2: switch.tsx mantém os 48px com dedo'
);

console.log(falhas === 0 ? '\n  Alvos de toque e "Fechar": tudo certo.' : `\n  ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
