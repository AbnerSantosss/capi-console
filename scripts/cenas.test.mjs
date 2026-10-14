#!/usr/bin/env node
/**
 * Biblioteca de cenas (padrão HyperFrames, E0 do plano de 14/10).
 *
 * Lê os fontes e prova as regras de movimento e de vocabulário que valem para
 * TODA cena animada do console:
 *
 *   a  toda declaração `animation*` dos CSS de cena mora dentro de
 *      `@media (prefers-reduced-motion: no-preference)`
 *   b  keyframe só mexe em `transform` e `opacity`
 *   c  `infinite` só em seletor de estado "esperando" (espera real)
 *   d  nenhum import do pacote de ícones antigo em `src/`, e o nome dele não
 *      aparece em `src/components/cenas/` nem nos arquivos migrados
 *   e  no máximo um `<Palco` por arquivo .tsx de `src/`
 *   f  `@keyframes` fora de `src/components/cenas/` só os três que já
 *      existiam (sombraDaFaixa, listras, gira)
 *   g  o Funil fala de eventos, nunca de gente (lista de palavras proibidas)
 *   h  o Palco não tem prop de espera própria: o laço vem só de `estado`
 *   O2 o ramo do Funil: `depoisDe`/`rotulo`/`valor: number | null`, "sem
 *      sinal" quando não há valor, `title` com a dica, âmbar no CSS, rótulo de
 *      até 22 caracteres e até 5 etapas
 *   O3 `IconeDoAssunto` sai do índice, é `aria-hidden`, não é palco, roda no
 *      servidor e usa a moldura dos ícones da Instalação (1.25rem / 1.75rem)
 *   +  `cenas.module.css` sem tamanho de fonte, hex ou `rgb(`; a Instalação
 *      sem `@keyframes` próprio
 *
 * O verificador de CSS também roda contra um CSS de exemplo ERRADO, para
 * provar que ele reprova o que deve reprovar.
 *
 * Nenhuma rede e nenhum disco além da leitura dos fontes: não importa nada de
 * `src/`, não grava arquivo e não abre `config/`, `logs/` nem `.env*`. O
 * `fetch` global é trocado por um que LANÇA.
 *
 * Uso: npm run test:cenas
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------------- 0. Rede trancada ---------------- */

globalThis.fetch = async (entrada) => {
  const url = typeof entrada === 'string' ? entrada : String(entrada?.url ?? entrada);
  throw new Error(`teste estático não chama rede (tentou ${url.slice(0, 80)})`);
};

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const abs = (rel) => path.join(RAIZ, ...rel.split('/'));
const ler = (rel) => fs.readFileSync(abs(rel), 'utf8');
const existe = (rel) => fs.existsSync(abs(rel));

function arquivosSob(rel) {
  const saida = [];
  const andar = (d) => {
    if (!fs.existsSync(abs(d))) return;
    for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) {
      const filho = `${d}/${e.name}`;
      if (e.isDirectory()) andar(filho);
      else saida.push(filho);
    }
  };
  andar(rel);
  return saida;
}

const semComentarioCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
/** Tira comentários de bloco e de linha de TS/TSX (sem confundir `://`). */
const semComentarioTs = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const normal = (v) => v.replace(/\s+/g, ' ').trim();

/* ---------------- Leitor de CSS com @media/@container aninhados ---------------- */

/**
 * Cada bloco `{ … }` vira `{ pilha, decls }`: `pilha` são os prelúdios do mais
 * de fora ao do próprio bloco (`@media …`, `@container …`, `.seletor`), e
 * `decls` as declarações `prop: valor` diretas dele.
 */
function blocos(css) {
  const limpo = semComentarioCss(css);
  const saida = [];
  const pilha = [];
  const abertos = [];
  let buf = '';
  const declarar = () => {
    const texto = buf.trim();
    buf = '';
    if (!texto || !abertos.length) return;
    const i = texto.indexOf(':');
    if (i < 0) return;
    abertos[abertos.length - 1].decls.push({
      prop: texto.slice(0, i).trim().toLowerCase(),
      valor: normal(texto.slice(i + 1)),
    });
  };
  for (const ch of limpo) {
    if (ch === '{') {
      pilha.push(normal(buf));
      buf = '';
      abertos.push({ pilha: [...pilha], decls: [] });
    } else if (ch === '}') {
      declarar();
      const b = abertos.pop();
      if (b) saida.push(b);
      pilha.pop();
    } else if (ch === ';') {
      declarar();
    } else {
      buf += ch;
    }
  }
  return saida;
}

const MEDIA_DE_MOVIMENTO = /^@media\b.*prefers-reduced-motion\s*:\s*no-preference/;
const dentroDeKeyframes = (b) => b.pilha.some((p) => /^@(-\w+-)?keyframes\b/.test(p));
const ESPERANDO = '[data-estado="esperando"]';

/** Os problemas de movimento (a, b, c) de um CSS. */
function problemasDeMovimento(css) {
  const p = { a: [], b: [], c: [] };
  for (const b of blocos(css)) {
    const seletor = b.pilha[b.pilha.length - 1] ?? '';
    if (dentroDeKeyframes(b)) {
      for (const d of b.decls) {
        if (d.prop !== 'transform' && d.prop !== 'opacity') p.b.push(`${b.pilha.join(' › ')} { ${d.prop} }`);
      }
      continue;
    }
    for (const d of b.decls) {
      if (!d.prop.startsWith('animation')) continue;
      if (!b.pilha.some((x) => MEDIA_DE_MOVIMENTO.test(x))) p.a.push(`${seletor} { ${d.prop} }`);
      if (/\binfinite\b/.test(d.valor)) {
        const partes = seletor.split(',').map((x) => x.trim());
        if (!partes.every((x) => x.includes(ESPERANDO))) p.c.push(seletor);
      }
    }
  }
  return p;
}

/* ---------------- Prova do verificador: um CSS errado tem de reprovar -------- */

console.log('\n0. O verificador reprova um CSS errado');
{
  const errado = `
    .solta { animation: girar 1s; }
    @media (prefers-reduced-motion: no-preference) {
      .laco { animation: girar 1s infinite; }
      .palco[data-estado="esperando"] .fio { animation: girar 1s infinite; }
      @container cena (max-width: 22rem) { .x { animation-name: girar; } }
    }
    @keyframes girar { from { width: 0; } to { transform: none; opacity: 1; } }
  `;
  const p = problemasDeMovimento(errado);
  ok(p.a.length === 1 && p.a[0].startsWith('.solta'), 'a: pega a animação fora do @media de movimento', JSON.stringify(p.a));
  ok(p.b.length === 1 && p.b[0].includes('width'), 'b: pega o keyframe que mexe em width', JSON.stringify(p.b));
  ok(p.c.length === 1 && p.c[0] === '.laco', 'c: pega o infinite fora de "esperando"', JSON.stringify(p.c));
}

/* ---------------- a, b, c — CSS de cena ---------------- */

const CSS_CENAS = 'src/components/cenas/cenas.module.css';
const CSS_INSTALACAO = 'src/components/instalacao/instalacao.module.css';

console.log('\na/b/c. Movimento nos CSS de cena');
for (const rel of [CSS_CENAS, CSS_INSTALACAO]) {
  ok(existe(rel), `${rel} existe`);
  if (!existe(rel)) continue;
  const p = problemasDeMovimento(ler(rel));
  ok(p.a.length === 0, `a: ${rel} — animação só dentro de prefers-reduced-motion: no-preference`, p.a.join(' | '));
  ok(p.b.length === 0, `b: ${rel} — keyframes só com transform e opacity`, p.b.join(' | '));
  ok(p.c.length === 0, `c: ${rel} — infinite só em ${ESPERANDO}`, p.c.join(' | '));
}

{
  const css = ler(CSS_CENAS);
  const limpo = semComentarioCss(css);
  ok(!/font-size/i.test(css), 'cenas.module.css sem font-size');
  ok(!/#[0-9a-f]{3,8}\b/i.test(limpo), 'cenas.module.css sem cor em hex');
  ok(!/rgb\(/i.test(css), 'cenas.module.css sem rgb(');
  const nKf = (semComentarioCss(ler(CSS_INSTALACAO)).match(/@keyframes\b/g) ?? []).length;
  ok(nKf < 15, `instalacao.module.css com menos de 15 @keyframes (tem ${nKf})`);
}

/* ---------------- d — pacote de ícones antigo ---------------- */

console.log('\nd. Ícones só do barril');
const PACOTE_ANTIGO = ['lu', 'cide'].join('');
{
  const fontes = arquivosSob('src').filter((f) => /\.(t|j)sx?$|\.mjs$/.test(f));
  const comImport = fontes.filter((f) =>
    new RegExp(`from\\s+['"]${PACOTE_ANTIGO}-react`).test(ler(f)),
  );
  ok(comImport.length === 0, `nenhum import do pacote antigo em src/`, comImport.join(', '));

  const vigiados = [
    ...arquivosSob('src/components/cenas'),
    'src/components/instalacao/PassoAPasso.tsx',
    'src/components/instalacao/icones-animados.tsx',
    'src/components/instalacao/CenaDaTag.tsx',
    'src/components/instalacao/CenaDoWebhook.tsx',
    CSS_INSTALACAO,
  ].filter(existe);
  const citam = vigiados.filter((f) => new RegExp(PACOTE_ANTIGO, 'i').test(ler(f)));
  ok(citam.length === 0, 'o nome do pacote antigo não aparece em cenas/ nem nos arquivos migrados', citam.join(', '));

  const outrosIcones = arquivosSob('src/components/cenas')
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => /from\s+['"](@phosphor-icons|react-icons|@heroicons)/.test(ler(f)));
  ok(outrosIcones.length === 0, 'cenas/ só importa ícone de @/components/ui/icones', outrosIcones.join(', '));
}

/* ---------------- e — um palco por arquivo ---------------- */

console.log('\ne. Um <Palco> por arquivo');
{
  const tsx = arquivosSob('src').filter((f) => f.endsWith('.tsx'));
  const demais = tsx
    .map((f) => [f, (semComentarioTs(ler(f)).match(/<Palco\b/g) ?? []).length])
    .filter(([, n]) => n > 1);
  ok(demais.length === 0, 'nenhum .tsx com mais de um <Palco', demais.map(([f, n]) => `${f} (${n})`).join(', '));
  for (const rel of ['src/components/instalacao/CenaDaTag.tsx', 'src/components/instalacao/CenaDoWebhook.tsx']) {
    const n = existe(rel) ? (semComentarioTs(ler(rel)).match(/<Palco\b/g) ?? []).length : 0;
    ok(n === 1, `${rel} tem exatamente um <Palco`, `(${n})`);
  }
}

/* ---------------- f — @keyframes fora de cenas/ ---------------- */

console.log('\nf. @keyframes fora de src/components/cenas/');
{
  const PERMITIDOS = new Set(['sombraDaFaixa', 'listras', 'gira']);
  const achados = [];
  for (const f of arquivosSob('src')) {
    if (f.startsWith('src/components/cenas/')) continue;
    let texto;
    if (f.endsWith('.css')) texto = semComentarioCss(ler(f));
    else if (/\.(t|j)sx?$/.test(f)) texto = semComentarioTs(ler(f));
    else continue;
    for (const m of texto.matchAll(/@(?:-\w+-)?keyframes\s+([\w-]+)/g)) {
      if (!PERMITIDOS.has(m[1])) achados.push(`${f}: ${m[1]}`);
    }
  }
  ok(achados.length === 0, 'só sombraDaFaixa, listras e gira fora de cenas/', achados.join(', '));
}

/* ---------------- g, O2 — Funil ---------------- */

const FUNIL = 'src/components/cenas/Funil.tsx';
console.log('\ng/O2. Funil');
ok(existe(FUNIL), `${FUNIL} existe`);
if (existe(FUNIL)) {
  const bruto = ler(FUNIL);
  const fonte = semComentarioTs(bruto);
  const proibidas = ['seguiram', 'pessoas', 'perderam'].filter((p) => new RegExp(p, 'i').test(bruto));
  ok(proibidas.length === 0, 'g: o Funil não fala de gente (seguiram, pessoas, perderam)', proibidas.join(', '));
  ok(/dos eventos anteriores/.test(fonte), 'g: a taxa diz "dos eventos anteriores"');

  const tipoDoRamo = fonte.match(/export type RamoDoFunil = \{([\s\S]*?)\n\};/)?.[1] ?? '';
  ok(/\bdepoisDe:\s*number;/.test(tipoDoRamo), 'O2: ramo.depoisDe: number');
  ok(/\brotulo:\s*string;/.test(tipoDoRamo), 'O2: ramo.rotulo: string');
  ok(/\bvalor:\s*number \| null;/.test(tipoDoRamo), 'O2: ramo.valor: number | null (obrigatório, aceita null)');
  ok(/ramo\?:\s*RamoDoFunil/.test(fonte), 'O2: a prop `ramo` é opcional');
  ok(/'sem sinal'/.test(fonte), 'O2: sem valor, o ramo escreve "sem sinal"');
  ok(/title=\{ramo\.dica \?\? ramo\.rotulo\}/.test(fonte), 'O2: o ramo tem title (a dica, ou o rótulo)');
  ok(/data-sem-sinal=/.test(fonte), 'O2: o ramo sem valor marca data-sem-sinal (contorno)');
  ok(/MAXIMO_DO_ROTULO = 22\b/.test(fonte), 'O2: rótulo de barra até 22 caracteres');
  ok(/MAXIMO_DE_ETAPAS = 5\b/.test(fonte) && /slice\(0, MAXIMO_DE_ETAPAS\)/.test(fonte), 'até 5 etapas');
  ok(/aria-hidden/.test(fonte), 'o Funil é aria-hidden');
  ok(!/^\s*['"]use client['"]/m.test(fonte), 'o Funil roda no servidor (sem use client)');

  const css = blocos(ler(CSS_CENAS));
  const regra = (sel) => css.find((b) => b.pilha.length === 1 && b.pilha[0] === sel);
  const ramo = regra('.ramo');
  ok(Boolean(ramo?.decls.some((d) => d.valor.includes('var(--warning)'))), 'O2: .ramo é âmbar (--warning)');
  ok(Boolean(regra('.ramo .barraFundo')?.decls.some((d) => d.prop === 'height')), 'O2: a barra do ramo é fina (altura própria)');
  ok(Boolean(regra('.ramo[data-sem-sinal] .ramoValor')), 'O2: o valor "sem sinal" tem estilo próprio');
  ok(Boolean(regra('.barraFundo[data-vazia]')?.decls.some((d) => d.prop === 'outline')), 'O2: sem dado, a barra vira contorno');
  const atrasoDoRamo = css.find(
    (b) => b.pilha.some((x) => MEDIA_DE_MOVIMENTO.test(x)) && b.pilha[b.pilha.length - 1] === '.ramo',
  );
  ok(
    Boolean(atrasoDoRamo?.decls.some((d) => d.prop === 'animation' && /5 \* var\(--cena-defasagem\)/.test(d.valor))),
    'O2: o ramo entra depois das 5 barras principais',
  );
}

/* ---------------- h — Palco ---------------- */

const PALCO = 'src/components/cenas/Palco.tsx';
console.log('\nh. Palco');
ok(existe(PALCO), `${PALCO} existe`);
if (existe(PALCO)) {
  const fonte = ler(PALCO);
  ok(!/\besperando\??\s*:/.test(fonte), 'h: o Palco não tem prop `esperando` (o laço vem de `estado`)');
  ok(/estado === 'esperando'/.test(fonte), 'h: o botão "Pausar animação" depende só de estado === "esperando"');
  ok(/Pausar animação/.test(fonte) && /aria-pressed/.test(fonte), 'h: o botão "Pausar animação" existe e tem aria-pressed');
  ok(/aria-hidden/.test(fonte), 'h: o palco é aria-hidden');
}

/* ---------------- O3 — IconeDoAssunto ---------------- */

const ICONE = 'src/components/cenas/IconeDoAssunto.tsx';
console.log('\nO3. IconeDoAssunto');
ok(existe(ICONE), `${ICONE} existe`);
if (existe(ICONE)) {
  const fonte = semComentarioTs(ler(ICONE));
  const indice = semComentarioTs(ler('src/components/cenas/index.ts'));
  ok(/export \{[^}]*\bIconeDoAssunto\b[^}]*\} from '\.\/IconeDoAssunto'/.test(indice), 'O3: o índice exporta IconeDoAssunto');
  ok(/export function IconeDoAssunto\(/.test(fonte), 'O3: IconeDoAssunto é um componente');
  ok(/assunto:\s*Assunto;/.test(fonte) && /icone\??:\s*React\.ComponentType/.test(fonte) && /grande\?:\s*boolean;/.test(fonte),
    'O3: props { assunto: Assunto; icone: ComponentType; grande?: boolean }');
  const corpo = fonte.slice(fonte.indexOf('export function IconeDoAssunto('), fonte.indexOf('export type PropsDaMoldura'));
  ok(/aria-hidden/.test(corpo), 'O3: IconeDoAssunto é aria-hidden');
  ok(/s\.iconeDoAssunto/.test(corpo) && /s\.icone\b/.test(corpo) && /data-assunto=\{assunto\}/.test(corpo),
    'O3: mesma moldura dos ícones da Instalação, na cor do assunto');
  ok(!/<Palco\b/.test(fonte), 'O3: IconeDoAssunto não é um <Palco>');
  ok(!/^\s*['"]use client['"]/m.test(fonte), 'O3: roda no servidor (sem use client)');

  const css = blocos(ler(CSS_CENAS));
  const base = (sel) => css.find((b) => b.pilha.length === 1 && b.pilha[0] === sel);
  const tamanho = (sel) => base(sel)?.decls.find((d) => d.prop === 'width')?.valor;
  ok(tamanho('.icone') === '1.25rem' && tamanho('.icone[data-grande]') === '1.75rem', 'O3: 1.25rem, ou 1.75rem com grande');
  const mov = css.filter((b) => b.pilha.some((x) => MEDIA_DE_MOVIMENTO.test(x)));
  const doIcone = mov.filter((b) => /\.iconeDoAssunto/.test(b.pilha[b.pilha.length - 1]));
  ok(doIcone.length >= 2 && doIcone.every((b) => b.decls.every((d) => !/infinite/.test(d.valor))),
    'O3: entra e acende uma vez (sem laço) e só com movimento permitido');
  ok(Boolean(base('.iconeDoAssunto::after')?.decls.some((d) => d.prop === 'opacity' && d.valor === '0')),
    'O3: com movimento reduzido, o halo fica apagado (quadro final)');
}

/* ---------------- Migração da Instalação ---------------- */

console.log('\nMigração da Instalação');
{
  const passo = semComentarioTs(ler('src/components/instalacao/PassoAPasso.tsx'));
  ok(/from '@\/components\/cenas'/.test(passo) && (passo.match(/<CartaoDePasso\b/g) ?? []).length === 2,
    'PassoAPasso usa dois CartaoDePasso da biblioteca');
  ok(passo.includes("href: '#tag'") && passo.includes("href: '#webhook'"), 'as âncoras #tag e #webhook continuam');
  const icones = semComentarioTs(ler('src/components/instalacao/icones-animados.tsx'));
  ok(/MolduraDeIcone/.test(icones) && !/instalacao\.module\.css/.test(icones), 'icones-animados usa a MolduraDeIcone e nenhum CSS próprio');
}

console.log(falhas ? `\n${falhas} falha(s).\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
