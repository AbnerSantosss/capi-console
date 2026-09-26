#!/usr/bin/env node
/**
 * Tema do console com duas paletas (v7, tarefa V1).
 *
 * Desde o v7 o console usa a paleta do design do dono ("Abner Tracker") e o
 * login continua exatamente como no P0 (decisão D5). As duas convivem em
 * `src/app/globals.css`:
 *
 *   - o PRIMEIRO `:root` é a paleta do console;
 *   - o bloco `:root:not(:has([data-console]))` é a paleta do P0, e vale em
 *     toda página que não monta a casca do console (o `data-console` mora só
 *     no div.shell de `ConsoleShell.tsx`).
 *
 * O gate de contraste (`scripts/contrast-check.mjs`) mede as razões nas duas
 * paletas. Este teste prova o resto, lendo o fonte:
 *
 *   a  o primeiro `:root` tem a paleta do console, `--surface-success` em hex,
 *      `--surface-painel` com `color-mix` a 92%, e nenhum token de nome
 *      parecido com os que existem (`--fg`, `--line-control`, `--sucesso`,
 *      `--alerta`, `--foco`)
 *   b  o bloco do login repete, token por token, a paleta do P0 (o mapa
 *      abaixo foi extraído do `:root` do commit do P0, 35f3888), e toda
 *      classe ou `var()` de cor que o login usa — nos dez lugares que ele
 *      importa — resolve para um token desse mapa
 *   c  `data-console` está na linha do `styles.shell` de `ConsoleShell.tsx`;
 *      `(console)/layout.tsx` exporta o `themeColor` do console e não tem
 *      `data-console` (o `tsc --noEmit` do `npm run check` roda antes deste)
 *   d  `src/app/layout.tsx` continua com o `themeColor` do login
 *   d′ o módulo do botão tem os quatro estados e nenhum deles mexe em
 *      tamanho ou posição (`transform`, `margin`, `padding`)
 *   e  os 13 arquivos de `public/brand/fundo/` e `public/brand/nav/` existem
 *      e cabem no teto (PNG ≤ 6 KB, fundo ≤ 40 KB)
 *   f  nenhum arquivo de `src/`, `public/` ou `scripts/` cita a pasta de
 *      origem do design nem o caminho da máquina de quem o gerou
 *   g  os dois hex que definem o console não aparecem em `.ts`/`.tsx` de
 *      `src/` fora de `(console)/layout.tsx`
 *   h  o glifo do checkbox e o polegar do switch marcados são `papel-texto`
 *   i  todo `.css` de `src/` passa no parse do postcss e do lightningcss (sem
 *      recuperar erro), e `globals.css` compila pelo `@tailwindcss/postcss`
 *      (o mesmo plugin do `postcss.config.mjs`) com os dois `:root` inteiros
 *      na saída, valor por valor. Motivo (revisão 1 da V1, B1): um `*` + `/`
 *      no meio de um comentário o fecha antes da hora, o resto vira CSS solto,
 *      o build quebra, e os itens a–h não percebem, porque leem o fonte por
 *      expressão regular. Um parser tolerante descartaria o bloco do login, e
 *      o login herdaria a paleta do console.
 *
 * Nenhuma rede e nenhum disco além da leitura dos fontes: este teste não
 * importa nada de `src/`, não grava arquivo e não abre `config/`, `logs/` nem
 * `.env*`. Mesmo assim o `fetch` global é trocado por um que LANÇA — em
 * especial para graph.facebook.com e api.cloudflare.com —, para que um
 * descuido futuro falhe alto em vez de sair para a rede. Roda sem
 * ACCESS_TOKEN.
 *
 * Uso: npm run test:tema
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------------- 0. Rede trancada ---------------- */

const HOSTS_PROIBIDOS = ['graph.facebook.com', 'api.cloudflare.com'];
globalThis.fetch = async (entrada) => {
  const url = typeof entrada === 'string' ? entrada : String(entrada?.url ?? entrada);
  const host = HOSTS_PROIBIDOS.find((h) => url.includes(h));
  throw new Error(
    host
      ? `o teste do tema tentou falar com ${host} — proibido`
      : `teste estático não chama rede (tentou ${url.slice(0, 80)})`
  );
};
delete process.env.ACCESS_TOKEN;

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const abs = (rel) => path.join(RAIZ, ...rel.split('/'));
const ler = (rel) => fs.readFileSync(abs(rel), 'utf8');
const existe = (rel) => fs.existsSync(abs(rel));

/** Todos os arquivos sob `rel` (recursivo), como caminhos relativos com `/`. */
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

/** O conteúdo entre a chave que abre `abertura` e a que fecha o bloco. */
function corpoDoBloco(css, abertura) {
  const i = css.indexOf(abertura);
  if (i < 0) return null;
  let prof = 0;
  for (let j = i + abertura.length - 1; j < css.length; j++) {
    if (css[j] === '{') prof++;
    else if (css[j] === '}') {
      prof--;
      if (prof === 0) return css.slice(i + abertura.length, j);
    }
  }
  return null;
}

const semComentarioCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const normal = (v) => v.replace(/\s+/g, ' ').trim();

/** `--nome: valor;` de um bloco, sem comentários, valor com espaço simples. */
function declaracoes(bloco) {
  const mapa = new Map();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(semComentarioCss(bloco)))) mapa.set(m[1], normal(m[2]));
  return mapa;
}

const CSS = ler('src/app/globals.css');
const ROOT = corpoDoBloco(CSS, ':root {');
const ROOT_LOGIN = corpoDoBloco(CSS, ':root:not(:has([data-console])) {');
const THEME_INLINE = corpoDoBloco(CSS, '@theme inline {');

if (!ROOT || !ROOT_LOGIN || !THEME_INLINE) {
  console.error('\n  globals.css sem um dos blocos: `:root {`, `:root:not(:has([data-console])) {` ou `@theme inline {`.\n');
  process.exit(1);
}

const CONSOLE = declaracoes(ROOT);
const LOGIN = declaracoes(ROOT_LOGIN);
const TEMA = declaracoes(THEME_INLINE);

/* ---------------- a. A paleta do console no primeiro :root ---------------- */

console.log('\na. O primeiro :root é a paleta do console');

const PALETA_CONSOLE = {
  '--surface-0': '#07121E',
  '--surface-1': '#102130',
  '--surface-2': '#172C3E',
  '--surface-3': '#21384B',
  '--fg-strong': '#F1F5FF',
  '--fg-body': '#B2CCE6',
  '--fg-muted': '#8FA8C1',
  '--fg-disabled': '#6B839B',
  '--border-subtle': '#29465F',
  '--border-default': '#3B5872',
  '--border-control': '#6B8AA6',
  '--border-focus': '#13BFF4',
  '--papel': '#0665EF',
  '--papel-hover': '#0559D6',
  '--papel-active': '#0450C2',
  '--papel-texto': '#FFFFFF',
  '--success': '#21D8B0',
  '--warning': '#F1BE67',
  '--danger': '#FF899B',
  '--tinta-painel': '#0665EF',
  '--tinta-instalacao': '#0665EF',
  '--tinta-pixels': '#0665EF',
  '--tinta-manual': '#0665EF',
  '--tinta-automatico': '#0665EF',
  '--tinta-texto-painel': '#66B3FF',
  '--tinta-texto-instalacao': '#66B3FF',
  '--tinta-texto-pixels': '#66B3FF',
  '--tinta-texto-manual': '#66B3FF',
  '--tinta-texto-automatico': '#66B3FF',
};
for (const [nome, valor] of Object.entries(PALETA_CONSOLE)) {
  const achado = CONSOLE.get(nome);
  ok(
    achado?.toUpperCase() === valor.toUpperCase(),
    `${nome}: ${valor}`,
    achado?.toUpperCase() === valor.toUpperCase() ? '' : `(achado: ${achado ?? 'ausente'})`
  );
}

const sucesso = CONSOLE.get('--surface-success');
ok(/^#[0-9a-f]{6}$/i.test(sucesso ?? ''), '--surface-success é hex opaco', `(${sucesso ?? 'ausente'})`);

const painel = CONSOLE.get('--surface-painel') ?? '';
ok(
  /^color-mix\(\s*in srgb\s*,\s*var\(--surface-1\)\s+92%\s*,\s*transparent\s*\)$/.test(painel),
  '--surface-painel = color-mix(in srgb, var(--surface-1) 92%, transparent)',
  painel ? '' : '(ausente)'
);

for (const parecido of ['--fg', '--line-control', '--sucesso', '--alerta', '--foco']) {
  ok(!CONSOLE.has(parecido), `nenhum ${parecido}: no primeiro :root (S-1, nome parecido)`);
}

/* ---------------- b. O login: a paleta do P0, token por token ---------------- */

console.log('\nb. O bloco do login repete a paleta do P0');

/**
 * Os 34 tokens de cor e véu do `:root` do P0 (commit 35f3888), extraídos
 * por script antes de a V1 mexer no CSS. Valor com espaço simples.
 */
const P0 = {
  '--surface-0': '#0d0b08',
  '--surface-1': '#1b1815',
  '--surface-2': '#262320',
  '--surface-3': '#33302c',
  '--border-subtle': '#3e3b38',
  '--border-default': '#565350',
  '--border-control': '#7e7a76',
  '--border-focus': '#c8c3bd',
  '--fg-strong': '#f2f0ed',
  '--fg-body': '#ceccc8',
  '--fg-muted': '#a09c97',
  '--fg-disabled': '#74716d',
  '--papel': '#f0ece7',
  '--papel-hover': '#fbfaf7',
  '--papel-active': '#ddd8d2',
  '--papel-texto': '#16130f',
  '--success': '#22c55e',
  '--warning': '#f59e0b',
  '--danger': '#fb7f93',
  '--tinta-painel': '#3dd7cf',
  '--tinta-instalacao': '#b1ca70',
  '--tinta-pixels': '#f0b13f',
  '--tinta-manual': '#f79ad9',
  '--tinta-automatico': '#c3afff',
  '--tinta': 'var(--tinta-painel)',
  '--tinta-texto-painel': '#7dece5',
  '--tinta-texto-instalacao': '#cbe197',
  '--tinta-texto-pixels': '#ffcd7d',
  '--tinta-texto-manual': '#ffbfe9',
  '--tinta-texto-automatico': '#d8ceff',
  '--tinta-texto': 'var(--tinta-texto-painel)',
  '--realce-interno': 'inset 0 1px 0 rgb(255 255 255 / 7%)',
  '--realce-interno-forte': 'inset 0 1px 0 rgb(255 255 255 / 12%)',
  '--veu-login':
    'linear-gradient( to bottom, color-mix(in srgb, var(--surface-0) 25%, transparent), color-mix(in srgb, var(--surface-0) 45%, transparent) calc(100% - 10rem), var(--surface-0) calc(100% - 4.5rem) )',
};

/**
 * Tokens que as duas paletas dividem: ficam só no primeiro :root, e o login
 * os herda de lá. Valem enquanto o valor for o mesmo do P0 (o grep abaixo
 * confere; se alguém mudar a sombra do console, o login muda junto e o
 * teste acusa).
 */
const COMPARTILHADOS_P0 = {
  '--sombra-cartao': '0 1px 2px rgb(0 0 0 / 35%), 0 8px 24px -12px rgb(0 0 0 / 55%)',
};

/** As medidas do P0 que o v7 muda no console e o login precisa manter. */
const MEDIDAS_P0 = {
  '--radius-control': '6px',
  '--radius-panel': '10px',
  '--radius-botao': '8px',
  '--text-pagina': 'clamp(1.5rem, 1.2rem + 1.2vw, 1.875rem)',
};

let iguais = 0;
for (const [nome, valor] of Object.entries({ ...P0, ...MEDIDAS_P0 })) {
  const achado = LOGIN.get(nome);
  if (achado === valor) iguais++;
  else ok(false, `${nome} no bloco do login`, `(esperado ${valor}; achado ${achado ?? 'ausente'})`);
}
ok(
  iguais === Object.keys(P0).length + Object.keys(MEDIDAS_P0).length,
  `os ${Object.keys(P0).length} tokens de cor e véu e as ${Object.keys(MEDIDAS_P0).length} medidas do P0 estão no bloco do login com o valor exato`,
  `(${iguais} iguais)`
);

/* O grep: tudo o que o login usa de cor precisa resolver para o mapa. */

const LUGARES_DO_LOGIN = [
  ...arquivosSob('src/components/auth'),
  ...arquivosSob('src/app/login'),
  'src/components/ui/button.tsx',
  'src/components/ui/button.module.css',
  'src/components/ui/input.tsx',
  'src/components/ui/label.tsx',
  'src/components/ui/checkbox.tsx',
  'src/components/ui/app-mark.tsx',
  'src/components/ui/icones.ts',
  'src/components/common/primitives.tsx',
].filter((f) => /\.(tsx?|css)$/.test(f));

ok(
  LUGARES_DO_LOGIN.some((f) => f.startsWith('src/components/auth/')) &&
    LUGARES_DO_LOGIN.some((f) => f.startsWith('src/app/login/')) &&
    LUGARES_DO_LOGIN.every(existe),
  'os dez lugares do login existem e foram lidos',
  `(${LUGARES_DO_LOGIN.length} arquivos)`
);

/**
 * Tira os comentários: `/* *\/` (inclusive JSDoc e `{/* *\/}` do JSX) e `//`
 * de linha. O `//` só conta como comentário no começo da linha ou depois de
 * espaço, para não cortar `https://` dentro de string.
 */
const semComentario = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1');

/** Famílias de token que carregam cor (a `--sombra-cartao` fica fora). */
const FAMILIA_DE_COR =
  /^--(surface|fg|border|papel|tinta|success|warning|danger|realce|veu|background|foreground|card|popover|primary|secondary|muted|accent|destructive|input|ring|sidebar|chart|color)(-|$)/;

/** Prefixos de utilitário que recebem cor no Tailwind v4. */
const PREFIXO_DE_COR =
  /^(bg|text|border(?:-[xytrblse])?|outline|ring(?:-offset)?|from|via|to|fill|stroke|divide|placeholder|caret|accent|decoration|shadow)-(.+)$/;

/**
 * Segue a cadeia de `var()` até o mapa do P0. Devolve a lista do que NÃO
 * chegou lá (vazia = coberto). Um literal no primeiro :root não é coberto: no
 * login ele pintaria a cor do console.
 */
function naoCobertos(nome, visto = new Set()) {
  if (nome in P0) return [];
  if (visto.has(nome)) return [`${nome} (ciclo)`];
  visto.add(nome);
  const valor = CONSOLE.get(nome);
  if (valor === undefined) return [`${nome} (não existe no :root)`];
  if (nome in COMPARTILHADOS_P0) {
    return valor === COMPARTILHADOS_P0[nome]
      ? []
      : [`${nome} (compartilhado com o login, mas mudou: ${valor})`];
  }
  const refs = [...valor.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
  if (refs.length === 0) return [`${nome} (literal no :root do console: ${valor})`];
  return refs.flatMap((r) => naoCobertos(r, visto));
}

/** Token de uma classe utilitária, pelo `@theme inline`; null se não é cor do tema. */
function tokenDaClasse(classe) {
  let c = classe.replace(/!/g, '');
  c = c.slice(c.lastIndexOf(':') + 1); // variantes: hover:, data-checked:, lg:…
  c = c.replace(/^-/, '');
  c = c.replace(/\/[^/]*$/, ''); // opacidade: /85, /[x]
  const m = c.match(PREFIXO_DE_COR);
  if (!m) return null;
  const chave = m[1] === 'shadow' ? `--shadow-${m[2]}` : `--color-${m[2]}`;
  const valor = TEMA.get(chave);
  if (!valor) return null;
  const ref = valor.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return ref ? ref[1] : `${chave} (valor não é var(): ${valor})`;
}

const usados = new Map(); // token -> arquivos
const problemas = [];
for (const arquivo of LUGARES_DO_LOGIN) {
  const fonte = semComentario(ler(arquivo));
  const tokens = new Set();

  // var(--nome) e var(--nome, reserva), inclusive dentro de colchete.
  for (const m of fonte.matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (FAMILIA_DE_COR.test(m[1])) tokens.add(m[1]);
  }
  // A forma curta do Tailwind v4: bg-(--nome).
  for (const m of fonte.matchAll(/(?:^|[^\w-])(?:bg|text|border|outline|ring|fill|stroke|from|via|to|shadow)-\((--[\w-]+)\)/g)) {
    if (FAMILIA_DE_COR.test(m[1])) tokens.add(m[1]);
  }
  // Classes: colchete vira marcador (tira os `:` de dentro), depois quebra em palavras.
  const achatado = fonte.replace(/\[[^\]\n]*\]/g, '[x]');
  for (const palavra of achatado.split(/[\s"'`{}(),;<>=]+/)) {
    if (!palavra || !/[a-z]/.test(palavra)) continue;
    const token = tokenDaClasse(palavra);
    if (!token) continue;
    if (!token.startsWith('--') || token.includes(' ')) {
      problemas.push(`${arquivo}: ${palavra} → ${token}`);
      continue;
    }
    tokens.add(token);
  }

  for (const t of tokens) {
    if (!usados.has(t)) usados.set(t, new Set());
    usados.get(t).add(arquivo);
    for (const falta of naoCobertos(t)) problemas.push(`${arquivo}: ${t} → ${falta}`);
  }
}

// Sanidade do grep: o que o plano listou em 24/09 tem de aparecer.
const ESPERADOS = [
  '--surface-0', '--surface-1', '--surface-2', '--fg-strong', '--fg-body', '--fg-muted',
  '--warning', '--danger', '--tinta-texto', '--tinta', '--border-subtle', '--border-control',
  '--papel-texto', '--realce-interno', '--veu-login',
];
const faltando = ESPERADOS.filter((t) => !usados.has(t));
ok(faltando.length === 0, 'o grep acha os tokens que o login usa hoje', faltando.length ? `(faltou: ${faltando.join(', ')})` : `(${usados.size} tokens)`);
ok(
  problemas.length === 0,
  'toda classe e todo var() de cor dos dez lugares resolve para o mapa do P0',
  problemas.length ? '\n        ' + problemas.join('\n        ') : ''
);
console.log(`        tokens usados: ${[...usados.keys()].sort().join(', ')}`);

/* ---------------- c. data-console e o themeColor do console ---------------- */

console.log('\nc. data-console na casca e themeColor do console');

const casca = ler('src/components/layout/ConsoleShell.tsx');
const linhaShell = casca.split(/\r?\n/).find((l) => l.includes('styles.shell'));
ok(!!linhaShell && linhaShell.includes('data-console'), 'a linha do `styles.shell` tem `data-console`', linhaShell ? `(${linhaShell.trim()})` : '(sem styles.shell)');

const layoutConsole = ler('src/app/(console)/layout.tsx');
ok(layoutConsole.includes("themeColor: '#07121E'"), "(console)/layout.tsx tem `themeColor: '#07121E'`");
ok(!layoutConsole.includes('data-console'), '(console)/layout.tsx não tem `data-console` (nenhum cast, nenhuma prop inventada)');

/* ---------------- d. O themeColor do login ---------------- */

console.log('\nd. O themeColor da raiz é o do login');

ok(ler('src/app/layout.tsx').includes("themeColor: '#0d0b08'"), "src/app/layout.tsx continua com `themeColor: '#0d0b08'`");

/* ---------------- d′. Os estados do botão ---------------- */

console.log('\nd′. Os quatro estados do botão, sem mexer em tamanho nem posição');

/** Regras `seletor { corpo }` de um CSS, descendo em @media/@supports e pulando @keyframes. */
function regras(css) {
  const saida = [];
  const texto = semComentarioCss(css);
  const andar = (s) => {
    let i = 0;
    while (i < s.length) {
      const abre = s.indexOf('{', i);
      if (abre < 0) break;
      const preludio = s.slice(i, abre).trim().split(/[;}]/).pop().trim();
      let prof = 1;
      let j = abre + 1;
      for (; j < s.length && prof > 0; j++) {
        if (s[j] === '{') prof++;
        else if (s[j] === '}') prof--;
      }
      const corpo = s.slice(abre + 1, j - 1);
      if (/^@(-\w+-)?keyframes\b/.test(preludio)) {
        // quadro de animação não é estado
      } else if (preludio.startsWith('@')) {
        andar(corpo);
      } else {
        saida.push({ seletor: preludio, corpo });
      }
      i = j;
    }
  };
  andar(texto);
  return saida;
}

const moduloBotao = ler('src/components/ui/button.module.css');
const regrasBotao = regras(moduloBotao);
for (const estado of [':hover', ':active', ':disabled', ':focus-visible']) {
  const comEstado = regrasBotao.filter((r) => r.seletor.includes(estado));
  ok(comEstado.length > 0, `button.module.css tem ${estado}`, `(${comEstado.length} regra(s))`);
  const mexem = comEstado.filter((r) => /(^|[\s;{])(transform|translate|margin[\w-]*|padding[\w-]*)\s*:/.test(r.corpo));
  ok(
    mexem.length === 0,
    `nenhuma regra de ${estado} tem transform, margin ou padding`,
    mexem.length ? `(${mexem.map((r) => r.seletor).join(' | ')})` : ''
  );
}

/* ---------------- e. Os 13 arquivos do design ---------------- */

console.log('\ne. Fundos e ícones copiados');

const FUNDOS = ['lateral', 'lateral@2x', 'principal'].flatMap((b) => [`${b}.webp`, `${b}.avif`]);
const ICONES = ['visao-geral', 'dominio', 'fontes', 'pixels', 'eventos', 'regras', 'configuracoes'];
for (const f of FUNDOS) {
  const rel = `public/brand/fundo/${f}`;
  const tamanho = existe(rel) ? fs.statSync(abs(rel)).size : -1;
  ok(tamanho > 0 && tamanho <= 40 * 1024, `${rel} existe e tem até 40 KB`, `(${tamanho < 0 ? 'ausente' : tamanho + ' B'})`);
}
for (const aba of ICONES) {
  const rel = `public/brand/nav/${aba}-72.png`;
  const tamanho = existe(rel) ? fs.statSync(abs(rel)).size : -1;
  ok(tamanho > 0 && tamanho <= 6 * 1024, `${rel} existe e tem até 6 KB`, `(${tamanho < 0 ? 'ausente' : tamanho + ' B'})`);
}

/* ---------------- f. Nenhum caminho de fora do repositório ---------------- */

console.log('\nf. Nenhuma referência à pasta de origem nem à máquina de quem gerou');

// Montadas por partes para este arquivo não se acusar.
const PROIBIDAS = ['Co' + 'dex', 'Users' + '\\' + 'binho'];
const citam = [];
for (const pasta of ['src', 'public', 'scripts']) {
  for (const arquivo of arquivosSob(pasta)) {
    // latin1 lê qualquer byte sem quebrar: pega também metadado em imagem.
    const bruto = fs.readFileSync(abs(arquivo), 'latin1');
    for (const p of PROIBIDAS) if (bruto.includes(p)) citam.push(`${arquivo} (${p.slice(0, 2)}…)`);
  }
}
ok(citam.length === 0, 'src/, public/ e scripts/ limpos', citam.length ? `(${citam.join(', ')})` : '');

/* ---------------- g. Os hex do console só no layout do console ---------------- */

console.log('\ng. Os hex do console fora do CSS só em (console)/layout.tsx');

const HEX_CONSOLE = /#0665EF|#07121E/i;
const comHex = arquivosSob('src')
  .filter((f) => /\.tsx?$/.test(f))
  .filter((f) => HEX_CONSOLE.test(ler(f)));
ok(
  comHex.length === 1 && comHex[0] === 'src/app/(console)/layout.tsx',
  'só `src/app/(console)/layout.tsx` tem os hex do console em .ts/.tsx',
  `(${comHex.join(', ') || 'nenhum'})`
);

/* ---------------- h. O que se pinta sobre a tinta ---------------- */

console.log('\nh. Checkbox e switch marcados pintam papel-texto sobre a tinta');

const checkbox = ler('src/components/ui/checkbox.tsx');
ok(checkbox.includes('data-checked:text-papel-texto'), 'checkbox.tsx tem `data-checked:text-papel-texto`');
ok(!checkbox.includes('data-checked:text-surface-0'), 'checkbox.tsx não tem `data-checked:text-surface-0`');
const alavanca = ler('src/components/ui/switch.tsx');
ok(alavanca.includes('data-checked:bg-papel-texto'), 'switch.tsx tem `data-checked:bg-papel-texto`');
ok(!alavanca.includes('data-checked:bg-surface-0'), 'switch.tsx não tem `data-checked:bg-surface-0`');

/* ---------------- i. O CSS passa no parse e na compilação ---------------- */

console.log('\ni. O CSS passa no parse (postcss e lightningcss) e na compilação do Tailwind');

// Os três já estão no node_modules (o Next e o Tailwind usam); resolvidos a
// partir do package.json do app, como o build faz.
const exigir = createRequire(abs('package.json'));
const postcss = exigir('postcss');
const { transform } = exigir('lightningcss');
const tailwind = exigir('@tailwindcss/postcss');

/** A mensagem de erro sem o caminho absoluto da máquina. */
const erroCss = (e) =>
  e?.name === 'CssSyntaxError'
    ? `${e.reason} (linha ${e.line}, coluna ${e.column})`
    : `${e?.message ?? e}${e?.loc ? ` (linha ${e.loc.line}, coluna ${e.loc.column})` : ''}`;

// Sintaxe do Tailwind v4 que o lightningcss não conhece e só avisa.
const AT_RULE_DO_TAILWIND = /^Unknown at rule: @(theme|custom-variant|variant|utility|apply|source|plugin|config|reference)\b/;

const folhas = arquivosSob('src').filter((f) => f.endsWith('.css')).sort();
ok(
  folhas.includes('src/app/globals.css') && folhas.some((f) => f.endsWith('.module.css')),
  'achou globals.css e os .module.css de src/',
  `(${folhas.length} arquivos)`
);

for (const rel of folhas) {
  const fonte = ler(rel);
  let erro = '';
  try {
    postcss.parse(fonte);
  } catch (e) {
    erro = erroCss(e);
  }
  ok(!erro, `postcss lê ${rel}`, erro);

  let avisos = [];
  erro = '';
  try {
    const r = transform({
      filename: path.basename(rel),
      code: Buffer.from(fonte),
      cssModules: rel.endsWith('.module.css'),
      errorRecovery: false,
    });
    avisos = r.warnings.map((w) => w.message).filter((m) => !AT_RULE_DO_TAILWIND.test(m));
  } catch (e) {
    erro = erroCss(e);
  }
  ok(!erro, `lightningcss lê ${rel} sem recuperar erro`, erro);
  ok(avisos.length === 0, `lightningcss não avisa nada fora da sintaxe do Tailwind em ${rel}`, avisos.slice(0, 3).join(' | '));
}

// A árvore do postcss tem de ver os mesmos tokens que a leitura por expressão
// regular (que os itens a e b e o gate usam) — um comentário que fecha cedo, ou
// um `:root {` citado dentro de comentário, faz as duas divergirem.
/** `--nome → valor` de uma regra; um `@supports` aninhado (a reserva que o
 *  Tailwind gera para `color-mix` com `var()`) vale por cima, como no navegador
 *  que entende `color-mix`. */
function tokensDaRegra(regra) {
  const mapa = new Map();
  for (const n of regra.nodes ?? []) {
    if (n.type === 'decl' && n.prop.startsWith('--')) mapa.set(n.prop, normal(semComentarioCss(n.value)));
  }
  for (const n of regra.nodes ?? []) {
    if (n.type === 'atrule' && n.name === 'supports') {
      n.walkDecls((d) => {
        if (d.prop.startsWith('--')) mapa.set(d.prop, normal(semComentarioCss(d.value)));
      });
    }
  }
  return mapa;
}

/** Diferenças entre o mapa esperado (expressão regular) e o visto pela árvore. */
function diferencas(esperado, visto) {
  if (!visto) return ['regra não encontrada no nível de cima'];
  const d = [];
  for (const [k, v] of esperado) if (visto.get(k) !== v) d.push(`${k}: esperado "${v}", visto "${visto.get(k) ?? '(falta)'}"`);
  for (const k of visto.keys()) if (!esperado.has(k)) d.push(`${k} só na árvore`);
  return d;
}

const SELETOR_LOGIN = ':root:not(:has([data-console]))';
/** A primeira regra `:root` e a do login no nível de cima de uma folha. */
function osDoisRoots(arvore) {
  const topo = arvore.nodes.filter((n) => n.type === 'rule');
  const console_ = topo.find((r) => r.selector.trim() === ':root');
  const login = topo.find((r) => r.selector.trim() === SELETOR_LOGIN);
  return { console_: console_ && tokensDaRegra(console_), login: login && tokensDaRegra(login) };
}

let arvoreFonte = null;
try {
  arvoreFonte = postcss.parse(CSS);
} catch {
  // já reprovado acima
}
if (arvoreFonte) {
  const { console_, login } = osDoisRoots(arvoreFonte);
  const dc = diferencas(CONSOLE, console_);
  const dl = diferencas(LOGIN, login);
  ok(dc.length === 0, `fonte: o primeiro :root da árvore tem os mesmos ${CONSOLE.size} tokens da leitura por regex`, dc.slice(0, 3).join(' | '));
  ok(dl.length === 0, `fonte: o bloco do login da árvore tem os mesmos ${LOGIN.size} tokens da leitura por regex`, dl.slice(0, 3).join(' | '));
}

// A compilação de verdade: o plugin do postcss.config.mjs sobre globals.css.
// `base` limita a busca de classes a src/ (nunca config/, logs/ nem .env*);
// nada é gravado em disco.
let compilado = '';
let erroCompilacao = '';
try {
  const r = await postcss([tailwind({ base: abs('src'), optimize: false })]).process(CSS, {
    from: abs('src/app/globals.css'),
  });
  compilado = r.css;
} catch (e) {
  erroCompilacao = erroCss(e);
}
ok(!erroCompilacao && compilado.length > 0, 'globals.css compila pelo @tailwindcss/postcss', erroCompilacao);

if (compilado) {
  let arvoreSaida = null;
  let erro = '';
  try {
    arvoreSaida = postcss.parse(compilado);
  } catch (e) {
    erro = erroCss(e);
  }
  ok(!!arvoreSaida, 'postcss lê a saída compilada', erro);
  if (arvoreSaida) {
    const { console_, login } = osDoisRoots(arvoreSaida);
    const dc = diferencas(CONSOLE, console_);
    const dl = diferencas(LOGIN, login);
    ok(dc.length === 0, `saída: o primeiro :root chega inteiro (${CONSOLE.size} tokens, mesmos valores)`, dc.slice(0, 3).join(' | '));
    ok(dl.length === 0, `saída: o bloco do login chega inteiro (${LOGIN.size} tokens, mesmos valores)`, dl.slice(0, 3).join(' | '));
  }

  // O que o build de produção faz depois (optimize): minificar com o lightningcss.
  let minificado = '';
  erro = '';
  try {
    minificado = transform({
      filename: 'globals.css',
      code: Buffer.from(compilado),
      minify: true,
      errorRecovery: false,
    }).code.toString();
  } catch (e) {
    erro = erroCss(e);
  }
  ok(!erro && minificado.length > 0, 'lightningcss minifica a saída sem recuperar erro', erro);
  ok(
    minificado.includes(`${SELETOR_LOGIN}{--surface-0:${LOGIN.get('--surface-0')}`),
    'a saída minificada ainda tem o bloco do login, com o --surface-0 do P0',
    `(${LOGIN.get('--surface-0')})`
  );
}

/* ---------------- j. V9: vazio e erro em palavra, com saída ---------------- */

console.log('\nj. V9: toda tela vazia ou quebrada diz o que houve e dá a saída');

const lerSeExiste = (rel) => (existe(rel) ? ler(rel) : '');

const naoEncontrada = lerSeExiste('src/app/(console)/e/[slug]/not-found.tsx');
ok(naoEncontrada.includes('Empresa não encontrada'), 'e/[slug]/not-found.tsx diz "Empresa não encontrada"');
ok(naoEncontrada.includes('href="/empresas"'), 'e/[slug]/not-found.tsx leva de volta a /empresas (href="/empresas")');

const paginaEmpresas = lerSeExiste('src/app/(console)/empresas/page.tsx');
ok(paginaEmpresas.includes('Nenhuma empresa ainda'), 'empresas/page.tsx tem o vazio "Nenhuma empresa ainda"');
ok(
  paginaEmpresas.includes('BotaoNovaEmpresa'),
  'o vazio de /empresas dá o botão que resolve ("Nova empresa")'
);

const visaoGeral = lerSeExiste('src/components/visao-geral/VisaoGeral.tsx');
ok(visaoGeral.includes('Nenhum evento chegou desde'), 'Visão geral sem eventos diz "Nenhum evento chegou desde …"');
ok(
  visaoGeral.includes('Nada é enviado à Meta para testar'),
  'o vazio da Visão geral avisa que nada vai à Meta para testar'
);

/* ---------------- Fim ---------------- */

console.log(falhas ? `\n  ${falhas} falha(s).\n` : '\n  Tema do console: tudo certo.\n');
process.exit(falhas ? 1 : 0);
