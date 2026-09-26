#!/usr/bin/env node
/**
 * O portao de qualidade visual do console. Roda em `npm run check`.
 *
 * Sao OITO reguas:
 *
 *   G1  Contraste de texto            WCAG 2.2 SC 1.4.3   >= 4.5:1
 *   G2  Borda de controle e de foco   WCAG 2.2 SC 1.4.11  >= 3:1
 *   G3' Separacao de SUPERFICIE       DS-2.1              borda 3:1 OU dL 0.04
 *   G4  Token de cor fora do :root    DS-0.1              zero
 *   G5  Classe da ponte shadcn em componente vigiado       zero
 *   G6  font-size fora do @theme      DS-0.4              zero
 *   G7  Literal de cor fora da lista de excecoes          zero
 *       (hexadecimal E TAMBEM rgb/rgba/hsl/hsla/oklch/oklab/lab/lch)
 *   G9  Sobra do v3 viva em src/ (token morto e o conjunto
 *       de icones antigo)                                 zero
 *
 * A numeracao pula o G8 de proposito: ela e a do `plano-redesign-visual-v4.md`,
 * e renumerar aqui quebraria a conversa entre o gate e o documento que o
 * autoriza. Quem le "G9 falhou" tem de achar G9 no plano.
 *
 * FASE 5 (v7): duas paletas. O primeiro `:root` de globals.css e a paleta do
 * console (o design do dono: azul-marinho, acao em #0665EF) e o bloco
 * `:root:not(:has([data-console]))` e a paleta do P0, que so o login le. As
 * duas sao pintadas de verdade, entao G1, G2 e G3' medem os mesmos pares nas
 * DUAS, cada uma com o seu `--surface-0`; G4 e G7 aceitam os dois blocos como
 * lugar de definicao, e so eles; e o `themeColor` e conferido em dois
 * arquivos: `src/app/layout.tsx` contra o `--surface-0` do login e
 * `src/app/(console)/layout.tsx` contra o do console. Nenhum piso mudou.
 * Entraram dois calculos novos, so na paleta do console: o fundo do cartao de
 * sucesso (`--surface-success`) e o PIOR CASO do painel translucido
 * (`--surface-painel`, um `color-mix` — composto sobre #FFFFFF e sobre
 * `--surface-0` antes de medir o texto em cima).
 *
 * Por que cada regua existe:
 *
 * G1 e G2 sao a norma, e norma nao se afrouxa. Quando um token nao alcanca a
 * razao, quem sobe e o TOKEN — nunca o piso. A unica inversao deliberada esta
 * no fim do G1: `--fg-disabled` tem de REPROVAR como conteudo. Ele existe para
 * dizer "isto nao esta disponivel"; no dia em que ele cruzar 4.5 sobre o modal
 * deixou de ser desabilitado e virou mais um cinza de texto, e a interface
 * passa a ter um estado que mente.
 *
 * G3' e a regua que mudou de PROPOSITO no v4, e a mudanca esta justificada no
 * plano. Ate o v3 a elevacao vinha obrigatoriamente da borda, entao o gate
 * exigia 3:1 de contorno em toda superficie — e o efeito colateral foi que
 * todo painel deste console virou uma caixa desenhada. A escada do v4 e feita
 * de degraus de luminosidade PERCEPTUAL medidos (0.150 -> 0.211 -> 0.264 ->
 * 0.317), e um degrau de 0.04 no OKLab e visivel sem esforco mesmo quando a
 * razao WCAG entre os dois quase-pretos fica em 1.4 — a luminancia relativa do
 * WCAG e quase cega nessa faixa (ver o cabecalho de `lib/cor.mjs`). Entao a
 * pergunta certa deixou de ser "a borda contrasta?" e passou a ser "da para
 * VER que sao duas superficies?", que se responde por borda >= 3:1 OU por
 * degrau >= 0.04. Nenhuma das duas provas foi afrouxada: o que mudou e que
 * agora sao duas, e a superficie so precisa de uma.
 *
 * G3' tambem mede `--border-subtle` com piso de 1.5:1, e esse numero NAO e um
 * 3:1 negociado para baixo: `--border-subtle` nao e contorno de coisa nenhuma,
 * e filete interno (linha de tabela, separador dentro de um painel que ja esta
 * delimitado). As linhas de uma tabela ja estao separadas por conteudo,
 * espacamento e alinhamento; o fio e reforco, e SC 1.4.11 nao se aplica a ele.
 * A justificativa esta escrita tambem em globals.css, junto do token.
 *
 * G4 fecha o furo que anulava tudo o mais: ate a FASE 1 do v3 a classe `.shell`
 * redefinia onze tokens, este script media os do `:root`, e o build passava
 * verde descrevendo cores que ninguem via. Os hex NAO sao duplicados aqui: sao
 * lidos do :root de src/app/globals.css, que e a fonte unica.
 *
 * G9 e novo e e a unica regua com data de validade. O v4 matou o azul de acao
 * (`--accent-fill`, `--accent-text`) e a ponte shadcn que o servia
 * (`bg-primary`, `text-primary`). Token morto nao da erro de build: ele
 * simplesmente nao pinta, e o elemento fica transparente ou preto sem que
 * ninguem perceba ate ver a tela. G9 existe para que a morte seja verificada e
 * nao prometida.
 *
 * A FASE 4 acrescentou ao G9 o NOME DO PACOTE de icones antigo. O caso e o
 * mesmo em especie: importar dele nao quebra build nenhum (o pacote pode voltar
 * numa instalacao transitiva a qualquer momento), mas mistura dois desenhos de
 * icone na mesma tela — que e exatamente o que o movimento M5 do plano foi
 * fechar. E, ao contrario do token morto, esse aqui SUME da tela sem avisar:
 * dois conjuntos desenham o mesmo assunto de formas parecidas o bastante para
 * ninguem notar na revisao e diferentes o bastante para a tela parecer que
 * ninguem decidiu. Todo icone entra por `@/components/ui/icones`.
 *
 * Uso: node scripts/contrast-check.mjs   (sai 1 se qualquer verificacao falhar)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { razao, sobrepor, compor, degrauL } from './lib/cor.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

/* -------------------------------------------------------------------------
   Leitura do :root — a fonte unica de cor
   ------------------------------------------------------------------------- */

const GLOBALS = 'src/app/globals.css';
const cssGlobal = ler(GLOBALS);

/** Recorta o corpo do primeiro bloco `<abertura> {...}` de globals.css. */
function corpoDoBloco(css, abertura) {
  const abre = css.indexOf(abertura);
  if (abre === -1) {
    console.error(`\n  ERRO: globals.css nao tem um bloco \`${abertura}\`.\n`);
    process.exit(1);
  }
  const i = css.indexOf('{', abre);
  let nivel = 0;
  for (let j = i; j < css.length; j++) {
    if (css[j] === '{') nivel++;
    else if (css[j] === '}') {
      nivel--;
      if (nivel === 0) return { texto: css.slice(i + 1, j), inicio: i + 1, fim: j };
    }
  }
  console.error(`\n  ERRO: bloco \`${abertura}\` de globals.css nao fecha.\n`);
  process.exit(1);
}

/* Dois blocos, duas paletas (FASE 5, v7). `ROOT` continua sendo o PRIMEIRO
   `:root {` — a paleta do console — e `ROOT_LOGIN` e o bloco que so casa
   quando a pagina nao tem `[data-console]`, isto e, o login com a paleta do
   P0. O `indexOf` de `corpoDoBloco` acha a abertura exata; o terceiro `:root {`
   de globals.css (so `accent-color`) nunca e o primeiro, entao nao confunde. */
const ROOT = corpoDoBloco(cssGlobal, ':root {');
const ROOT_LOGIN = corpoDoBloco(cssGlobal, ':root:not(:has([data-console])) {');
const TEMA_ESTATICO = corpoDoBloco(cssGlobal, '@theme static {');

/** Os blocos onde uma cor pode NASCER (G4 e G7). Qualquer outro lugar reprova. */
const BLOCOS_DE_DEFINICAO = [ROOT, ROOT_LOGIN];
const dentroDeUmBloco = (inicioDaLinha) =>
  BLOCOS_DE_DEFINICAO.some((b) => inicioDaLinha >= b.inicio && inicioDaLinha < b.fim);

const tok = (nome, bloco = ROOT) => {
  const achado = bloco.texto.match(new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!achado) {
    const onde = bloco === ROOT_LOGIN ? 'bloco :root:not(:has([data-console])) (login)' : 'primeiro :root (console)';
    console.error(
      `\n  ERRO: o token --${nome} nao existe (ou nao e hex de 6 digitos) no ` +
        `${onde} de globals.css.\n  Renomeou, apagou ou converteu para rgba()/oklch()? ` +
        'Este script so calcula contraste de cor opaca em hex —\n  ' +
        'e por isso que DS-0.2 exige hex de 6 digitos. Atualize os dois juntos.\n'
    );
    process.exit(1);
  }
  return achado[1].toUpperCase();
};

/**
 * Le uma paleta inteira de um bloco. Os nomes sao os mesmos nas duas — o que
 * muda e o valor —, e e isso que deixa o gate medir os mesmos pares nas duas
 * sem uma linha de caso especial.
 */
function paleta(bloco, rotulo) {
  const t = (nome) => tok(nome, bloco);
  const p = {
    rotulo,
    S0: t('surface-0'),
    S1: t('surface-1'),
    S2: t('surface-2'),
    S3: t('surface-3'), // dialog / popover / select / tooltip / paleta

    LINHA_SUTIL: t('border-subtle'),
    LINHA_FORTE: t('border-default'),
    LINHA_CONTROLE: t('border-control'),
    FOCO: t('border-focus'),

    FG_FORTE: t('fg-strong'),
    FG_CORPO: t('fg-body'),
    FG_APAGADO: t('fg-muted'),
    FG_DESABILITADO: t('fg-disabled'),

    /* O papel: a acao primaria. No P0 (login) e papel claro com texto quase
       preto; no console (v7) e o azul #0665EF com texto branco. Nos dois casos
       os tres estados sao medidos porque hover e active tambem carregam texto,
       e um `active` que perde contraste quebra a leitura no exato instante em
       que o dedo esta em cima do botao que gasta dinheiro. */
    PAPEL: t('papel'),
    PAPEL_HOVER: t('papel-hover'),
    PAPEL_ATIVO: t('papel-active'),
    PAPEL_TEXTO: t('papel-texto'),

    /* As cinco areas. `--tinta-*` e o degrau de FUNDO — pintura a 6–16%,
       filete, regua, icone grande, controle marcado. `--tinta-texto-*` e o
       degrau de TEXTO e do anel de foco. Sao dois degraus e nao um porque o
       que serve de fundo a 16% nao serve de letra a 13px, e vice-versa.

       As cinco sao medidas uma a uma, e nao so a do painel: o gate mede o PIOR
       caso das cinco, porque `[data-area]` troca a tinta por rota e o operador
       nao escolhe em qual area ele precisa enxergar. (No console as cinco tem
       hoje o mesmo valor; continuam medidas uma a uma para o dia em que nao
       tiverem.) */
    AREAS: ['painel', 'instalacao', 'pixels', 'manual', 'automatico'].map((nome) => ({
      nome,
      tinta: t(`tinta-${nome}`),
      texto: t(`tinta-texto-${nome}`),
    })),

    SUCESSO: t('success'),
    AVISO: t('warning'),
    ERRO: t('danger'),
  };

  /* Compostos que a interface realmente pinta. Cor com alfa nao tem contraste
     proprio: o que chega ao olho e a mistura com o que esta atras. Medir
     `--danger` contra `--surface-3` e responder uma pergunta que a tela nunca
     faz — o que a tela pinta e a caixa de erro a 10%. */
  p.PAGINA_ESCURECIDA = sobrepor('#000000', 0.6, p.S0); // overlay bg-black/60
  p.CAIXA_ERRO = sobrepor(p.ERRO, 0.1, p.S3); // callout/selo de erro
  p.CAIXA_AVISO = sobrepor(p.AVISO, 0.1, p.S3);
  /** Linha ativa de select / paleta de comandos: tinta a 15% sobre o flutuante. */
  p.selecaoDe = (area) => sobrepor(area.tinta, 0.15, p.S3);
  /** Caixa da area dentro de um painel: tinta a 16% sobre o painel. */
  p.caixaDe = (area) => sobrepor(area.tinta, 0.16, p.S1);
  return p;
}

const CONSOLE = paleta(ROOT, 'console');
const LOGIN = paleta(ROOT_LOGIN, 'login');
const PALETAS = [CONSOLE, LOGIN];

/* Os dois tokens que so a paleta do console tem (v7).

   `--surface-success` e o fundo do cartao "Valor das compras": hex opaco, a
   mistura de `--success` a 12% sobre `--surface-1` ja gravada no :root.

   `--surface-painel` e o painel TRANSLUCIDO que deixa a imagem de fundo
   aparecer: `color-mix(in srgb, var(--surface-1) N%, transparent)`. Ele nao
   tem cor propria, entao o gate nao le hex dele: le o N% e compoe o PIOR CASO
   — `surface-1` sobre #FFFFFF, o ponto mais claro que uma imagem poderia ter —
   e o caso comum, sobre `surface-0`. Se o pior caso reprovar, quem sobe e a
   opacidade do token, nunca o piso. */
const SURFACE_SUCESSO = tok('surface-success');
const PAINEL_MIX = ROOT.texto.match(
  /--surface-painel:\s*color-mix\(\s*in srgb\s*,\s*var\(--surface-1\)\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)\s*;/
);
if (!PAINEL_MIX) {
  console.error(
    '\n  ERRO: --surface-painel nao e `color-mix(in srgb, var(--surface-1) N%, transparent)` ' +
      'no primeiro :root de globals.css.\n  O gate calcula o pior caso do painel translucido ' +
      'a partir desse N; mudou a forma do token, mude este script junto.\n'
  );
  process.exit(1);
}
const PAINEL_ALFA = Number(PAINEL_MIX[1]) / 100;
const PAINEL_SOBRE_BRANCO = compor(CONSOLE.S1, '#FFFFFF', PAINEL_ALFA);
const PAINEL_SOBRE_S0 = compor(CONSOLE.S1, CONSOLE.S0, PAINEL_ALFA);

/* Cada `themeColor` contra a paleta da tela que ele colore (G7). */
const THEME_COLORS = [
  ['src/app/layout.tsx', LOGIN],
  ['src/app/(console)/layout.tsx', CONSOLE],
];

const TEXTO = 4.5; // SC 1.4.3 texto normal
const LIMITE = 3.0; // SC 1.4.11 limite de componente / texto grande
const FILETE = 1.5; // divisoria interna — "da para ver o fio", nao e WCAG
const DEGRAU = 0.04; // G3' — degrau perceptual de L no OKLab

/* -------------------------------------------------------------------------
   Varredura de arquivos
   ------------------------------------------------------------------------- */

function arquivosCss(dir = 'src') {
  const achados = [];
  const anda = (d) => {
    for (const nome of readdirSync(join(RAIZ, d))) {
      const rel = `${d}/${nome}`;
      if (statSync(join(RAIZ, rel)).isDirectory()) anda(rel);
      else if (nome.endsWith('.css')) achados.push(rel);
    }
  };
  anda(dir);
  return achados.sort();
}

const CSS_DO_PRODUTO = arquivosCss();

/** Linhas de um arquivo, ja numeradas a partir de 1. */
const linhasDe = (rel) => ler(rel).split('\n');

/* -------------------------------------------------------------------------
   G5 — a ponte shadcn nao entra em componente de produto
   -------------------------------------------------------------------------
   Os tokens-ponte (--muted, --popover, --accent, --border, --input,
   --foreground) sao declarados uma unica vez no :root e chegam ja resolvidos
   por heranca. Dentro de um componente eles ignoram a superficie em que estao
   e reintroduzem exatamente os pares que este script mede.

   A lista e uma EXCLUSAO, nao uma enumeracao. Antes ela nomeava oito arquivos
   "que flutuam": o efeito pratico era que todo componente NOVO nascia fora da
   guarda, e foi por esse furo que passaram os quatro primitivos stock (tabs,
   checkbox, accordion, label) e as classes que button, input, textarea e
   separator ainda carregavam apesar de §13.7 os dar por curados. Hoje todo
   `src/components/**` e vigiado, e sair da guarda exige entrar na lista de
   excecoes abaixo — o que e uma decisao visivel, e nao um esquecimento
   (DS-6.1).

   Era duas excecoes; desde a FASE 3b e UMA so — os decorativos do Magic UI
   sairam do repositorio e levaram junto a dispensa que tinham.              */

/* 1. Os DECORATIVOS — uma lista que agora esta VAZIA, e ficou assim de
      proposito. Eram os quatro componentes do Magic UI (dot-pattern,
      grid-pattern, animated-grid-pattern, border-beam): malhas e feixes de luz
      que nao carregavam texto nem estado, entao nao havia par de contraste a
      medir neles. A FASE 3b apagou os quatro do repositorio — eles eram a
      assinatura de template mais literal que o produto tinha (§8 do plano), e
      um ornamento que precisa de dispensa do gate para existir e, por
      definicao, um ornamento que o gate nao consegue defender.

      A lista fica aqui, vazia, em vez de sumir: e o lugar onde a proxima
      excecao decorativa teria de ser escrita, e escrever uma e uma decisao
      visivel, nao um esquecimento (DS-6.1). */
const DECORATIVOS = [];

/* 2. `src/components/auth/**`. A tela de login esta fora do escopo de
      qualquer redesenho desta temporada: e a DECISAO DE PRODUTO IRREVERSIVEL
      #13, nao uma divida pendente. Ela tem paleta propria e 14 hexadecimais
      proprios — e por isso que parece de outro sistema —, e o papel da guarda
      aqui e impedir que esse vocabulario VAZE para o resto do produto, nao
      consertar a tela. Nao tire esta linha daqui achando que e esquecimento:
      tirar a excecao sem redesenhar a tela deixa o gate vermelho de proposito,
      e reprovar o que ninguem tem autorizacao para mudar nao e guarda, e
      ruido.                                                                */
const FORA_DA_GUARDA = [...DECORATIVOS, 'src/components/auth/'];

/** Todo componente de produto — `.tsx` e tambem `.ts`, porque string de
 *  classe e hexadecimal literal aparecem em arquivo de apoio (rotulo.ts,
 *  hue.ts, useDisparo.ts) tanto quanto em JSX. */
function arquivosDeComponente(dir = 'src/components') {
  const achados = [];
  const anda = (d) => {
    for (const nome of readdirSync(join(RAIZ, d))) {
      const rel = `${d}/${nome}`;
      if (statSync(join(RAIZ, rel)).isDirectory()) anda(rel);
      else if (/\.tsx?$/.test(nome)) achados.push(rel);
    }
  };
  anda(dir);
  return achados
    .filter((rel) => !FORA_DA_GUARDA.some((prefixo) => rel.startsWith(prefixo)))
    .sort();
}

const ARQUIVOS_VIGIADOS = arquivosDeComponente();

const CLASSES_PROIBIDAS = [
  ['bg-muted', /\bbg-muted\b/, 'bg-surface-2'],
  ['text-muted-foreground', /\btext-muted-foreground\b/, 'text-fg-muted'],
  ['bg-popover', /\bbg-popover\b/, 'bg-surface-3'],
  ['text-popover-foreground', /\btext-popover-foreground\b/, 'text-fg-strong'],
  ['text-foreground', /\btext-foreground\b/, 'text-fg-body / text-fg-strong'],
  ['ring-foreground', /\bring-foreground\b/, 'border border-line-control'],
  ['bg-background', /\bbg-background\b/, 'bg-surface-0'],
  ['bg-accent', /\bbg-accent(?![-\w])/, 'bg-surface-2 ou bg-tinta/15'],
  ['text-accent-foreground', /\btext-accent-foreground\b/, 'text-fg-strong'],
  ['bg-border', /\bbg-border\b/, 'bg-line-strong'],
  ['border-input', /\bborder-input\b/, 'border-line-control'],
  ['-ring (ponte)', /\b(?:border|outline|ring)-ring\b/, 'ring-tinta-texto'],
  ['destructive', /\b(?:bg|text|border|ring)-destructive\b/, 'danger'],
  ['fg-disabled em texto', /\btext-fg-disabled\b/, 'text-fg-muted'],
];

/* -------------------------------------------------------------------------
   G4 — token de cor fora do :root
   -------------------------------------------------------------------------
   Os namespaces que so podem NASCER no :root de globals.css. Repare no que
   NAO esta aqui, porque e a decisao de desenho do v4 inteira: os apelidos
   `--tinta` e `--tinta-texto`, sem sufixo de area. Eles existem para ser
   reapontados fora do :root — e isso que os blocos `[data-area='...']` fazem,
   e e assim que uma tela do Painel fica teal e uma de Pixels fica ouro sem que
   nenhum componente saiba em que area esta.

   O que continua trancado e a DEFINICAO das cinco tintas (`--tinta-painel`,
   `--tinta-texto-pixels`, ...): essas sao valor, e valor mora num lugar so.
   ------------------------------------------------------------------------- */

const TOKENS_DE_COR = [
  /--(surface|border|fg)-[a-z0-9-]+\s*:/,
  /--papel(-[a-z0-9-]+)?\s*:/,
  /--tinta-texto-[a-z0-9-]+\s*:/,
  /--tinta-(painel|instalacao|pixels|manual|automatico)\s*:/,
];

// Excecao unica, nomeada e auditada (DS-1.5): o Guia identifica topico por
// matiz, e matiz ali E a funcao. `--hue` nao pertence a nenhum namespace
// acima, entao nao casa com nenhuma das regex — esta nota existe para que
// ninguem "conserte" isso achando que e esquecimento.

function verificarTokensForaDoRoot() {
  const problemas = [];
  for (const rel of CSS_DO_PRODUTO) {
    const linhas = linhasDe(rel);
    let deslocamento = 0;
    linhas.forEach((linha, i) => {
      const inicioDaLinha = deslocamento;
      deslocamento += linha.length + 1;
      if (!TOKENS_DE_COR.some((re) => re.test(linha))) return;
      // Os dois blocos de definicao (FASE 5): o primeiro :root (console) e o
      // :root:not(:has([data-console])) (login). Fora deles, reprova.
      const dentroDoRoot = rel === GLOBALS && dentroDeUmBloco(inicioDaLinha);
      if (dentroDoRoot) return;
      problemas.push([
        `${rel}:${i + 1}`,
        linha.trim().slice(0, 56),
        'mova o valor para o :root de globals.css',
      ]);
    });
  }
  return problemas;
}

/* -------------------------------------------------------------------------
   G6 — font-size fora do @theme
   ------------------------------------------------------------------------- */

/* Divida de FASE 2 (§6.6.2, passo 3 — "corrigir por categoria: tokens,
   primitivos, paginas"). Estes dois arquivos ainda escrevem font-size a mao,
   inclusive abaixo do piso de 12px de DS-4.9:
     guide.module.css    27 declaracoes, 9 delas em 11px
     console.module.css   3 declaracoes, 1 delas em 11px (.eyebrow)
   A FASE 1 nao os converte porque isso muda o tamanho de titulo e de capa de
   topico, que e redesenho de pagina e nao consolidacao de token. Tire o
   arquivo desta lista assim que ele usar var(--text-*). */
const CSS_COM_TIPOGRAFIA_PENDENTE = [
  'src/components/guide/guide.module.css',
  'src/components/layout/console.module.css',
];

const FONT_SIZE_CSS = /(^|[;{\s])font-size\s*:/;
// text-[13px], text-[0.8rem] — e tambem text-sm/text-xs/text-2xl da escala
// generica do Tailwind, que convive com a escala nomeada e nao deveria.
// `text-display` NAO casa: ele e o setimo degrau da escala NOMEADA, nao um
// tamanho avulso. Ver a checagem do bloco @theme static logo abaixo.
const FONT_SIZE_CLASSE =
  /\btext-\[[^\]]*(px|rem|em|pt|%|vw)[^\]]*\]|\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/;
const FONT_SIZE_INLINE = /\bfontSize\b/;

function verificarFontSize() {
  const problemas = [];

  /* O setimo degrau tem de EXISTIR, e existir no lugar certo. `--text-display`
     e o unico tamanho fluido da escala (clamp de 40 a 56px) e a volta
     deliberada do degrau grande que o v3 tinha matado. Se alguem o apagar ou
     o mover para fora do @theme static, a classe `text-display` some sem
     aviso: Tailwind simplesmente nao gera o utilitario, e o numero do
     `Destaque` volta silenciosamente ao tamanho de titulo comum. */
  if (!/--text-display\s*:/.test(TEMA_ESTATICO.texto)) {
    problemas.push([
      GLOBALS,
      '--text-display ausente do @theme static',
      'devolva o setimo degrau da escala',
    ]);
  }

  for (const rel of CSS_DO_PRODUTO) {
    if (CSS_COM_TIPOGRAFIA_PENDENTE.includes(rel)) continue;
    linhasDe(rel).forEach((linha, i) => {
      if (!FONT_SIZE_CSS.test(linha)) return;
      // A unica declaracao legitima do produto: a raiz que converte rem em px
      // e a porta de entrada da densidade (DS-4.10).
      if (linha.includes('--ui-scale-text')) return;
      problemas.push([
        `${rel}:${i + 1}`,
        linha.trim().slice(0, 56),
        'use var(--text-*) da escala nomeada',
      ]);
    });
  }

  for (const rel of ARQUIVOS_VIGIADOS) {
    let linhas;
    try {
      linhas = linhasDe(rel);
    } catch {
      continue; // a ausencia do arquivo ja e reportada por G5
    }
    linhas.forEach((linha, i) => {
      if (FONT_SIZE_CLASSE.test(linha)) {
        problemas.push([
          `${rel}:${i + 1}`,
          (linha.match(FONT_SIZE_CLASSE) || [''])[0],
          'use text-caption/label/body/title/heading/data/display',
        ]);
      }
      if (FONT_SIZE_INLINE.test(linha)) {
        problemas.push([
          `${rel}:${i + 1}`,
          'style fontSize',
          'use uma classe da escala nomeada',
        ]);
      }
    });
  }

  return problemas;
}

/* -------------------------------------------------------------------------
   G7 — literal de cor
   ------------------------------------------------------------------------- */

/* Marca de terceiro e ornamento sem papel semantico ficam de fora: a cor da
   Meta, do Pix e do WhatsApp E a identidade deles, nao uma escolha nossa.
   `login/` e `auth/` ficam de fora porque a tela de entrada esta fora do
   escopo de redesenho (decisao irreversivel #13) — o que nao a absolve: ela
   tem 14 hexadecimais proprios, e e por isso que parece de outro sistema. */
const SEM_HEX = [
  'src/components/ui/brand-icons.tsx',
  'src/components/ui/app-mark.tsx',
  'src/components/auth/',
  'src/app/login/',
];

const HEX_LITERAL = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/;

/* FASE 3b — o furo que o G7 tinha desde que nasceu.
   ------------------------------------------------
   Ate aqui esta regua so cacava `#`. Mas CSS tem meia duzia de outras formas
   de escrever a mesma cor, e o navy do v3 sobreviveu a varredura de
   hexadecimais da FASE 1 escondido em `rgb()` — 24 literais espalhados por
   guide.module.css e console.module.css, incluindo o proprio azul de acao
   (0 100 224) que o v4 deu por morto. Uma regra que so conhece uma notacao nao
   e uma regra: e um convite a escrever a cor proibida na outra.

   Agora reprovam tambem `rgb`, `rgba`, `hsl`, `hsla`, `oklch`, `oklab`, `lab`
   e `lch`. As tres ultimas nem aparecem no produto, e e de proposito que
   entrem: a regua existe para o dia em que alguem tentar.

   A EXCECAO DO BRANCO E DO PRETO PUROS — por que ela nao afrouxa nada
   ------------------------------------------------------------------
   `rgb(255 255 255 / N%)` e `rgb(0 0 0 / N%)` continuam passando, e so eles.
   O motivo e que branco e preto puros NAO TEM MATIZ: nao ha decisao de cor a
   centralizar num token, ha decisao de LUZ. Sao os dois unicos valores que o
   sistema usa como material fisico e nao como cor — o realce interno de uma
   superficie (`--realce-interno`, uma aresta de luz de 7%) e a sombra que ela
   projeta (`--sombra-cartao`). Escrever isso como token de cor seria pior: o
   token diria "esta e a cor da sombra" quando o que existe e "a sombra e a
   ausencia de luz a 35%", e a primeira pessoa a trocar o valor do token
   pintaria sombra colorida no produto inteiro.

   Qualquer outro componente reprova, inclusive os quase-pretos e os
   quase-brancos: `rgb(18 21 26 / 97%)` e exatamente o tipo de valor que esta
   excecao NAO cobre — ele tem matiz (e azulado), e foi assim que o navy
   atravessou a FASE 1. E a excecao e so para `rgb`/`rgba`: `hsl(0 0% 0%)` e
   `oklch(0 0 0)` tambem sao preto, mas notacao que existe PARA expressar matiz
   nao tem por que ser usada onde nao ha matiz nenhum. */
const COR_FUNCIONAL = /\b(?:oklch|oklab|rgba?|hsla?|lab|lch)\([^()]*\d[^()]*\)/g;
const NEUTRO_PURO =
  /^(?:rgba?)\(\s*(?:255[\s,]+255[\s,]+255|0[\s,]+0[\s,]+0)\s*(?:[/,]\s*[\d.]+%?\s*)?\)$/;

function verificarHexLiteral() {
  const problemas = [];
  const alvos = [...CSS_DO_PRODUTO, ...ARQUIVOS_VIGIADOS];

  for (const rel of alvos) {
    if (SEM_HEX.some((p) => rel.startsWith(p))) continue;
    let linhas;
    try {
      linhas = linhasDe(rel);
    } catch {
      continue;
    }
    let deslocamento = 0;
    linhas.forEach((linha, i) => {
      const inicioDaLinha = deslocamento;
      deslocamento += linha.length + 1;

      // Os dois blocos de definicao de globals.css (o primeiro :root, do
      // console, e o do login) sao o unico lugar do produto onde um literal de
      // cor e a definicao, e nao uma copia.
      const naRaiz = rel === GLOBALS && dentroDeUmBloco(inicioDaLinha);
      if (naRaiz) return;
      // DS-1.5: os seis matizes do Guia. Excecao nomeada e auditada.
      if (/--hue\s*:/.test(linha)) return;

      if (HEX_LITERAL.test(linha)) {
        problemas.push([
          `${rel}:${i + 1}`,
          (linha.match(HEX_LITERAL) || [''])[0],
          'use um token de globals.css',
        ]);
      }

      for (const achado of linha.match(COR_FUNCIONAL) ?? []) {
        if (NEUTRO_PURO.test(achado.replace(/\s+/g, ' '))) continue;
        problemas.push([
          `${rel}:${i + 1}`,
          achado,
          'use um token de globals.css (so branco e preto puros passam)',
        ]);
      }
    });
  }

  // themeColor e metadado: nao aceita var(). Entao em vez de dispensa-lo do
  // G7, conferimos que ele repete exatamente --surface-0 — e a cor da barra
  // do navegador, e ela emendar com o fundo da aplicacao e o ponto. Desde a
  // FASE 5 sao dois: a raiz vale para o login (paleta do P0) e o layout do
  // console a substitui nas rotas do console (Next junta o `viewport` do
  // segmento raiz ate o mais interno e troca as chaves repetidas).
  for (const [arquivo, p] of THEME_COLORS) {
    let conteudo;
    try {
      conteudo = ler(arquivo);
    } catch {
      problemas.push([arquivo, '(arquivo nao encontrado)', `exporte themeColor '${p.S0}'`]);
      continue;
    }
    const achado = conteudo.match(/themeColor:\s*'(#[0-9a-fA-F]{6})'/);
    if (!achado) {
      problemas.push([arquivo, 'themeColor ausente', `use '${p.S0}' (--surface-0 do ${p.rotulo})`]);
    } else if (achado[1].toUpperCase() !== p.S0) {
      problemas.push([
        arquivo,
        `themeColor ${achado[1]} != --surface-0 do ${p.rotulo} ${p.S0}`,
        `use '${p.S0}'`,
      ]);
    }
  }

  return problemas;
}

/* -------------------------------------------------------------------------
   G5 (execucao)
   ------------------------------------------------------------------------- */

function verificarClasses() {
  const problemas = [];
  for (const arquivo of ARQUIVOS_VIGIADOS) {
    let conteudo;
    try {
      conteudo = ler(arquivo);
    } catch {
      problemas.push([arquivo, '(arquivo nao encontrado)', '']);
      continue;
    }
    conteudo.split('\n').forEach((linha, i) => {
      for (const [nome, padrao, troca] of CLASSES_PROIBIDAS) {
        if (padrao.test(linha)) {
          problemas.push([`${arquivo}:${i + 1}`, nome, troca]);
        }
      }
    });
  }
  return problemas;
}

/* -------------------------------------------------------------------------
   G9 — sobra do v3 viva em src/
   -------------------------------------------------------------------------
   Cinco nomes que o v4 enterrou, e o que os substituiu:

     accent-text   -> tinta-texto   (link, aba ativa, icone ativo, valor em
                                     destaque, anel de foco, barra de selecao)
     accent-fill   -> tinta         (fundo a 6–16%, filete, regua, preenchimento
                                     de controle marcado, barra de progresso)
     bg-primary    -> bg-papel      (a acao primaria e o papel claro)
     text-primary  -> text-papel-texto, ou text-fg-strong quando era so enfase
     lucide-react  -> @/components/ui/icones   (o barril do Phosphor)

   Os quatro primeiros sao COR: nome de token que o v4 apagou do `:root`. O
   quinto e o conjunto de icones antigo, entrou na lista com a FASE 4 e esta
   aqui pelo mesmo motivo — some da tela sem dar erro. Token morto nao pinta;
   import do conjunto velho pinta, e ate bonito, so que com outro desenho ao
   lado do desenho novo. Nenhum dos dois quebra o build, e por isso nenhum dos
   dois e pego por `tsc`: quem pega e este gate.

   O barril existe para que sobre um caminho unico. Qualquer import direto do
   pacote antigo reabre a porta que a FASE 4 fechou, inclusive se ele voltar
   como dependencia transitiva de outra coisa — o `package.json` limpo nao e
   garantia, a ausencia em `src/` e.

   A busca e feita aqui dentro, lendo os arquivos, e nao por `grep` externo: o
   repositorio roda em Windows e um gate que depende de um binario que pode nao
   existir e um gate que as vezes nao roda — o que e pior do que nao ter gate,
   porque da a impressao de que rodou.

   Esta regua tem data de validade. Quando `accent-*` e o pacote antigo nao
   existirem mais em nenhum branch nem na memoria de ninguem, ela pode sair — e
   nao antes.
   ------------------------------------------------------------------------- */

const TOKENS_MORTOS = [
  'accent-fill',
  'accent-text',
  'bg-primary',
  'text-primary',
  'lucide-react',
];

const SUBSTITUTO = {
  'accent-fill': 'bg-tinta (ou bg-tinta/16 quando era pintura)',
  'accent-text': 'tinta-texto',
  'bg-primary': 'bg-papel',
  'text-primary': 'text-papel-texto ou text-fg-strong',
  'lucide-react': "import { ... } from '@/components/ui/icones'",
};

/** Todo arquivo de `src/` que pode carregar uma classe ou um nome de token. */
function arquivosDeFonte(dir = 'src') {
  const achados = [];
  const anda = (d) => {
    for (const nome of readdirSync(join(RAIZ, d))) {
      const rel = `${d}/${nome}`;
      if (statSync(join(RAIZ, rel)).isDirectory()) anda(rel);
      else if (/\.(tsx?|css|mjs|js|jsx)$/.test(nome)) achados.push(rel);
    }
  };
  anda(dir);
  return achados.sort();
}

const ARQUIVOS_DE_FONTE = arquivosDeFonte();

function verificarTokensMortos() {
  const problemas = [];
  for (const rel of ARQUIVOS_DE_FONTE) {
    linhasDe(rel).forEach((linha, i) => {
      for (const morto of TOKENS_MORTOS) {
        if (linha.includes(morto)) {
          problemas.push([`${rel}:${i + 1}`, morto, SUBSTITUTO[morto]]);
        }
      }
    });
  }
  return problemas;
}

/* -------------------------------------------------------------------------
   Pares medidos — G1 e G2
   ------------------------------------------------------------------------- */

/**
 * Os pares de G1, G2 e G3' de UMA paleta (FASE 5). Os mesmos pares valem
 * para as duas — o console e o login pintam os mesmos componentes com
 * valores diferentes —, entao a lista e escrita uma vez e aplicada a cada
 * paleta; so os tokens que existem apenas no console (`--surface-success` e o
 * painel translucido) entram a parte, em `paresSoDoConsole`.
 */
function paresDe(p) {
  const {
    S0,
    S1,
    S2,
    S3,
    LINHA_CONTROLE,
    FOCO,
    FG_FORTE,
    FG_CORPO,
    FG_APAGADO,
    PAPEL,
    PAPEL_HOVER,
    PAPEL_ATIVO,
    PAPEL_TEXTO,
    AREAS,
    SUCESSO,
    AVISO,
    ERRO,
    PAGINA_ESCURECIDA,
    CAIXA_ERRO,
    CAIXA_AVISO,
    selecaoDe,
    caixaDe,
  } = p;

  /** Uma linha por area, com o nome da area na frente. */
  const porArea = (rotulo, frente, fundo, alvo) =>
    AREAS.map((a) => [`${rotulo} · ${a.nome}`, frente(a), fundo(a), alvo]);

  const G1 = [
    [
      'Base — texto sobre as superficies da pagina',
      [
        ['texto forte sobre app', FG_FORTE, S0, TEXTO],
        ['texto forte sobre painel', FG_FORTE, S1, TEXTO],
        ['texto forte sobre input', FG_FORTE, S2, TEXTO],
        ['texto corpo sobre app', FG_CORPO, S0, TEXTO],
        ['texto corpo sobre painel', FG_CORPO, S1, TEXTO],
        ['texto corpo sobre input', FG_CORPO, S2, TEXTO],
        ['helper sobre app', FG_APAGADO, S0, TEXTO],
        ['helper sobre painel', FG_APAGADO, S1, TEXTO],
        ['helper sobre input', FG_APAGADO, S2, TEXTO],
        ['sucesso sobre painel', SUCESSO, S1, TEXTO],
        ['aviso sobre painel', AVISO, S1, TEXTO],
        ['erro sobre painel', ERRO, S1, TEXTO],
        ['erro sobre input', ERRO, S2, TEXTO],
      ],
    ],
    [
      // O que o operador le em cada area. Cinco linhas por superficie porque a
      // tinta troca por rota e ninguem escolhe em que area precisa enxergar.
      'Tinta da area — texto sobre painel',
      porArea(
        'tinta-texto sobre painel',
        (a) => a.texto,
        () => S1,
        TEXTO
      ),
    ],
    [
      'Tinta da area — texto sobre input',
      porArea(
        'tinta-texto sobre input',
        (a) => a.texto,
        () => S2,
        TEXTO
      ),
    ],
    [
      'Tinta da area — texto sobre a camada flutuante',
      porArea(
        'tinta-texto sobre modal',
        (a) => a.texto,
        () => S3,
        TEXTO
      ),
    ],
    [
      // A acao primaria. No login (P0) e papel claro com letra quase preta; no
      // console (v7) e o azul #0665EF com letra branca. Os tres estados carregam
      // texto, entao os tres sao medidos — um `active` que perde contraste
      // quebra a leitura no instante do clique. Nao ha par com a TINTA como
      // letra: #0665EF como texto sobre o escuro daria 3.69.
      'Papel — a acao primaria (fundo e texto do botao principal)',
      [
        ['texto sobre o papel', PAPEL_TEXTO, PAPEL, TEXTO],
        ['texto sobre o papel em hover', PAPEL_TEXTO, PAPEL_HOVER, TEXTO],
        ['texto sobre o papel pressionado', PAPEL_TEXTO, PAPEL_ATIVO, TEXTO],
      ],
    ],
    [
      'Camada flutuante — texto sobre a superficie de modal/popover',
      [
        ['titulo sobre modal', FG_FORTE, S3, TEXTO],
        ['texto corpo sobre modal', FG_CORPO, S3, TEXTO],
        ['descricao/helper sobre modal', FG_APAGADO, S3, TEXTO],
        ['sucesso sobre modal', SUCESSO, S3, TEXTO],
        ['aviso sobre modal', AVISO, S3, TEXTO],
        ['erro sobre modal', ERRO, S3, TEXTO],
      ],
    ],
    [
      // Caixas empilhadas: cartao, input e rodape de acoes sao mais escuros que
      // o modal. O fill nao delimita (1.13); quem delimita e a borda de controle
      // medida no G2.
      'Dentro do modal — caixas empilhadas sobre a superficie flutuante',
      [
        ['texto forte sobre cartao no modal', FG_FORTE, S2, TEXTO],
        ['texto corpo sobre cartao no modal', FG_CORPO, S2, TEXTO],
        ['helper sobre rodape do modal', FG_APAGADO, S2, TEXTO],
        ['erro sobre caixa de erro no modal', ERRO, CAIXA_ERRO, TEXTO],
        ['aviso sobre caixa de aviso no modal', AVISO, CAIXA_AVISO, TEXTO],
      ],
    ],
    [
      // A pintura da area. `bg-tinta/15` na linha ativa do select e da paleta,
      // `bg-tinta/16` na caixa de destaque dentro de um painel. Nao se mede a
      // tinta contra o fundo: mede-se o que sobra depois da mistura.
      'Pintura da area — texto sobre a tinta diluida',
      [
        ...porArea('forte sobre linha ativa', () => FG_FORTE, selecaoDe, TEXTO),
        ...porArea('tinta-texto sobre linha ativa', (a) => a.texto, selecaoDe, TEXTO),
        ...porArea('tinta-texto sobre caixa da area', (a) => a.texto, caixaDe, TEXTO),
      ],
    ],
    [
      // A tinta CHEIA so aparece em controle marcado (checkbox, switch, pastilha
      // de etapa), e o que se pinta sobre ela e `--papel-texto` — "o que se
      // escreve sobre a acao": o glifo do checkbox e o polegar do switch. A
      // tinta pode ser CLARA (P0, L 0.80: o papel-texto e quase preto) ou ESCURA
      // (console, #0665EF: o papel-texto e branco), e por isso o par e medido
      // nas duas paletas, com o mesmo piso de texto. Ate o v6 o glifo era
      // `surface-0`, que servia a tinta clara e daria 3.69 sobre o azul do
      // console — o estado sumiria dentro do proprio controle.
      'Tinta cheia — o glifo do controle marcado inverte',
      porArea(
        'papel-texto sobre a tinta',
        () => PAPEL_TEXTO,
        (a) => a.tinta,
        TEXTO
      ),
    ],
  ];

  const G2 = [
    [
      'Limites de componente (SC 1.4.11) — a borda de controle',
      [
        ['borda de controle sobre app', LINHA_CONTROLE, S0, LIMITE],
        ['borda de controle sobre painel', LINHA_CONTROLE, S1, LIMITE],
        ['borda de controle sobre input', LINHA_CONTROLE, S2, LIMITE],
        ['borda de controle sobre modal', LINHA_CONTROLE, S3, LIMITE],
        // Borda externa do modal contra a pagina ja escurecida pelo overlay.
        ['borda do modal sobre pagina escurecida', LINHA_CONTROLE, PAGINA_ESCURECIDA, LIMITE],
        ['regua do rodape sobre rodape do modal', LINHA_CONTROLE, S2, LIMITE],
      ],
    ],
    [
      // O anel NEUTRO serve a casca que fica fora de qualquer `data-area`:
      // cabecalho e login. Dentro de uma area o anel vira a tinta — o grupo
      // seguinte.
      'Anel de foco neutro — casca fora de qualquer area',
      [
        ['anel neutro sobre painel', FOCO, S1, LIMITE],
        ['anel neutro sobre input', FOCO, S2, LIMITE],
        ['anel neutro sobre modal', FOCO, S3, LIMITE],
      ],
    ],
    [
      // A regra `[data-area] :focus-visible` troca a cor do anel por rota. Se
      // uma das cinco tintas nao alcancar 3:1 sobre uma das superficies, existe
      // uma tela em que o foco do teclado fica invisivel — e foi exatamente esse
      // o risco 7.5 do plano. As quinze combinacoes sao medidas por isso.
      'Anel de foco por area — as cinco tintas sobre as tres superficies',
      [
        ...porArea(
          'anel sobre painel',
          (a) => a.texto,
          () => S1,
          LIMITE
        ),
        ...porArea(
          'anel sobre input',
          (a) => a.texto,
          () => S2,
          LIMITE
        ),
        ...porArea(
          'anel sobre modal',
          (a) => a.texto,
          () => S3,
          LIMITE
        ),
      ],
    ],
    [
      // A barra de 2px da linha ativa e o que cumpre 1.4.11 no select e na
      // paleta: nenhum preenchimento escuro chega a 3:1 sobre o flutuante, entao
      // quem delimita e a barra — inclusive contra o proprio fill que ela
      // acompanha.
      'Barra da linha ativa — o que delimita quando o fill nao delimita',
      [
        ...porArea(
          'barra sobre modal',
          (a) => a.texto,
          () => S3,
          LIMITE
        ),
        ...porArea('barra sobre o proprio fill', (a) => a.texto, selecaoDe, LIMITE),
      ],
    ],
  ];

  /* -------------------------------------------------------------------------
     G3' — separacao de superficie: borda OU degrau
     ------------------------------------------------------------------------- */

  const SEPARACOES = [
    ['painel dentro do app', S1, S0],
    ['input dentro do painel', S2, S1],
    ['flutuante dentro do input', S3, S2],
    ['input/cartao dentro do app', S2, S0],
  ];

  return { G1, G2, SEPARACOES };
}

/**
 * O que so a paleta do console tem (v7). O cartao "Valor das compras" pinta
 * texto forte, texto de corpo e o proprio verde sobre `--surface-success`.
 */
function paresSoDoConsole(p) {
  return [
    [
      'Cartao de sucesso — texto sobre --surface-success (v7)',
      [
        ['texto forte sobre cartao de sucesso', p.FG_FORTE, SURFACE_SUCESSO, TEXTO],
        ['texto corpo sobre cartao de sucesso', p.FG_CORPO, SURFACE_SUCESSO, TEXTO],
        ['sucesso sobre cartao de sucesso', p.SUCESSO, SURFACE_SUCESSO, TEXTO],
      ],
    ],
  ];
}

const PARES = new Map(PALETAS.map((p) => [p, paresDe(p)]));
PARES.get(CONSOLE).G1.push(...paresSoDoConsole(CONSOLE));

/* -------------------------------------------------------------------------
   Saida
   ------------------------------------------------------------------------- */

const veredito = {};
const largura = Math.max(
  ...[...PARES.values()].flatMap(({ G1, G2, SEPARACOES }) => [
    ...[...G1, ...G2].flatMap(([, casos]) => casos.map(([n]) => n.length)),
    ...SEPARACOES.map(([n]) => n.length),
  ]),
  'filete sobre painel translucido'.length
);

function rodarPares(id, titulo, blocos) {
  let ok = true;
  console.log(`\n  ${id} — ${titulo}`);
  for (const [subtitulo, casos] of blocos) {
    console.log(`    ${subtitulo}`);
    for (const [nome, fg, bg, alvo] of casos) {
      const r = razao(fg, bg);
      const passou = r >= alvo;
      if (!passou) ok = false;
      console.log(
        `    ${passou ? 'OK   ' : 'FALHA'} ${nome.padEnd(largura)}  ${r
          .toFixed(2)
          .padStart(5)}:1  (min ${alvo.toFixed(1)})`
      );
    }
  }
  veredito[id] = veredito[id] !== false && ok;
  return ok;
}

function rodarLista(id, titulo, problemas, resumoOk) {
  console.log(`\n  ${id} — ${titulo}`);
  if (problemas.length === 0) {
    console.log(`    OK    ${resumoOk}`);
    veredito[id] = true;
    return true;
  }
  for (const [onde, o_que, troca] of problemas) {
    console.log(`    FALHA ${onde}  ${o_que}${troca ? ` — ${troca}` : ''}`);
  }
  veredito[id] = false;
  return false;
}

console.log('\n  Portao visual — Meta CAPI Console');
for (const p of PALETAS) {
  const bloco = p === LOGIN ? ':root:not(:has([data-console]))' : 'primeiro :root';
  console.log(`\n  paleta do ${p.rotulo} (${bloco})`);
  console.log(`  superficies  app ${p.S0}  painel ${p.S1}  elevado ${p.S2}  flutuante ${p.S3}`);
  console.log(
    `  bordas       sutil ${p.LINHA_SUTIL}  padrao ${p.LINHA_FORTE}  controle ${p.LINHA_CONTROLE}  foco ${p.FOCO}`
  );
  console.log(`  papel        ${p.PAPEL} com texto ${p.PAPEL_TEXTO}  (a acao primaria)`);
  console.log(`  tintas       ${p.AREAS.map((a) => `${a.nome} ${a.tinta}`).join('  ')}`);
}
console.log(`\n  fonte unica  ${GLOBALS} (2 blocos)  —  ${CSS_DO_PRODUTO.length} arquivos CSS auditados`);

/** Acrescenta a paleta ao subtitulo de cada grupo: "(console)" / "(login)". */
const rotular = (blocos, p) => blocos.map(([sub, casos]) => [`${sub} (${p.rotulo})`, casos]);

for (const p of PALETAS) {
  rodarPares('G1', `Contraste de texto (SC 1.4.3) — paleta do ${p.rotulo}`, rotular(PARES.get(p).G1, p));

  // --fg-disabled so pode existir enquanto ornamento. Se um dia ele cruzar 4.5
  // sobre o modal, deixou de ser "desabilitado" e virou mais um cinza de texto.
  // Esta e a UNICA linha do gate em que passar e falhar.
  const r = razao(p.FG_DESABILITADO, p.S3);
  const disabledOk = r < TEXTO;
  if (!disabledOk) veredito.G1 = false;
  console.log(
    `    ${disabledOk ? 'OK   ' : 'FALHA'} fg-disabled sobre o modal (${p.rotulo}) ${r.toFixed(
      2
    )}:1 — ornamento, nunca conteudo`
  );

  if (p === CONSOLE) medirPainelTranslucido();
}

/* O painel translucido (v7, so no console). Duas linhas, cada uma com o hex
   composto e as tres razoes: o pior caso (sobre #FFFFFF) fica VISIVEL no log
   para ninguem "arredondar" a opacidade do token sem ver o efeito. */
function medirPainelTranslucido() {
  console.log(
    `    Painel translucido — --surface-painel = surface-1 a ${Math.round(
      PAINEL_ALFA * 100
    )}% (console)`
  );
  let painelOk = true;
  for (const [nome, composto] of [
    ['sobre #FFFFFF', PAINEL_SOBRE_BRANCO],
    ['sobre surface-0', PAINEL_SOBRE_S0],
  ]) {
    const medidas = [
      ['fg-strong', CONSOLE.FG_FORTE],
      ['fg-body', CONSOLE.FG_CORPO],
      ['fg-muted', CONSOLE.FG_APAGADO],
    ].map(([rotulo, cor]) => [rotulo, razao(cor, composto)]);
    const passou = medidas.every(([, r]) => r >= TEXTO);
    if (!passou) painelOk = false;
    console.log(
      `    ${passou ? 'OK   ' : 'FALHA'} ${`painel ${nome}`.padEnd(largura)}  = ${composto}  ` +
        medidas.map(([rotulo, r]) => `${rotulo} ${r.toFixed(2)}:1`).join('  ') +
        `  (min ${TEXTO.toFixed(1)})`
    );
  }
  if (!painelOk) veredito.G1 = false;
}

for (const p of PALETAS) {
  rodarPares(
    'G2',
    `Contraste de borda de controle e de foco (SC 1.4.11) — paleta do ${p.rotulo}`,
    rotular(PARES.get(p).G2, p)
  );
}

/* G3' — cada superficie precisa de UMA das duas provas, nas duas paletas. */
let g3Ok = true;
for (const p of PALETAS) {
  console.log(
    `\n  G3' — Separacao de superficie (borda >= 3:1 OU degrau de L >= 0.04) — paleta do ${p.rotulo}`
  );
  console.log('    A escada e feita de degraus medidos, e nao de bordas desenhadas');
  for (const [nome, dentro, fora] of PARES.get(p).SEPARACOES) {
    const dL = degrauL(dentro, fora);
    const borda = razao(p.LINHA_FORTE, fora);
    const porDegrau = dL >= DEGRAU;
    const porBorda = borda >= LIMITE;
    const passou = porDegrau || porBorda;
    if (!passou) g3Ok = false;
    const prova = porDegrau ? 'degrau' : porBorda ? 'borda' : 'NENHUMA';
    console.log(
      `    ${passou ? 'OK   ' : 'FALHA'} ${nome.padEnd(largura)}  dL ${dL.toFixed(
        3
      )}  borda ${borda.toFixed(2)}:1  — passa por ${prova}`
    );
  }

  /* O filete interno. Piso proprio (1.5), e o comentario do cabecalho explica
     por que isso nao e um 3:1 negociado para baixo. No console o filete
     tambem e medido contra o painel translucido composto sobre surface-0 —
     e a borda que os paineis sobre a imagem de fundo desenham. */
  console.log('    Filete interno — divisoria dentro de superficie ja delimitada');
  const filetes = [
    ['filete sobre o app', p.S0],
    ['filete sobre painel', p.S1],
  ];
  if (p === CONSOLE) filetes.push(['filete sobre painel translucido', PAINEL_SOBRE_S0]);
  for (const [nome, fundo] of filetes) {
    const r = razao(p.LINHA_SUTIL, fundo);
    const passou = r >= FILETE;
    if (!passou) g3Ok = false;
    console.log(
      `    ${passou ? 'OK   ' : 'FALHA'} ${nome.padEnd(largura)}  ${r
        .toFixed(2)
        .padStart(5)}:1  (min ${FILETE.toFixed(1)})`
    );
  }

  // Ordem: sutil < forte < controle. Se alguem inverter a escala, os
  // comentarios de globals.css passam a mentir e a regra "limite usa
  // --border-control" perde o sentido.
  const escalaOk =
    razao(p.LINHA_CONTROLE, p.S3) > razao(p.LINHA_FORTE, p.S3) &&
    razao(p.LINHA_FORTE, p.S3) > razao(p.LINHA_SUTIL, p.S3);
  if (!escalaOk) g3Ok = false;
  console.log(
    `    ${escalaOk ? 'OK   ' : 'FALHA'} escala sutil ${razao(p.LINHA_SUTIL, p.S3).toFixed(2)}` +
      ` < padrao ${razao(p.LINHA_FORTE, p.S3).toFixed(2)}` +
      ` < controle ${razao(p.LINHA_CONTROLE, p.S3).toFixed(2)} (sobre o modal)`
  );
}
veredito["G3'"] = g3Ok;

rodarLista(
  'G4',
  'Token de cor definido fora dos dois blocos de definicao (DS-0.1)',
  verificarTokensForaDoRoot(),
  'nenhuma redefinicao de --surface-*/--border-*/--fg-*/--papel*/--tinta-texto-* ' +
    `nos ${CSS_DO_PRODUTO.length} arquivos CSS fora do primeiro :root (console) e do ` +
    ':root:not(:has([data-console])) (login) — os apelidos --tinta/--tinta-texto ' +
    'trocam por area, de proposito'
);

rodarLista(
  'G5',
  'Classe da ponte shadcn em componente de produto',
  verificarClasses(),
  `${ARQUIVOS_VIGIADOS.length} componentes vigiados limpos (${CLASSES_PROIBIDAS.length} classes proibidas)` +
    ` — lista por EXCLUSAO: so ${FORA_DA_GUARDA.length} excecoes`
);

rodarLista(
  'G6',
  'font-size fora do @theme (DS-0.4)',
  verificarFontSize(),
  `escala nomeada respeitada, --text-display no @theme static — ` +
    `${CSS_COM_TIPOGRAFIA_PENDENTE.length} arquivos ainda isentos (divida de FASE 2)`
);

rodarLista(
  'G7',
  'Literal de cor fora dos dois blocos de definicao (hex, rgb, hsl, oklch...)',
  verificarHexLiteral(),
  `nenhum literal cromatico solto — so branco e preto puros em rgb(); ` +
    THEME_COLORS.map(
      ([arquivo, p]) => `${arquivo} themeColor == --surface-0 do ${p.rotulo} (${p.S0})`
    ).join('; ')
);

rodarLista(
  'G9',
  'Sobra do v3 (accent-fill, accent-text, bg-primary, text-primary, lucide-react)',
  verificarTokensMortos(),
  `nem o azul de acao nem o conjunto de icones antigo aparecem em nenhum dos ` +
    `${ARQUIVOS_DE_FONTE.length} arquivos de src/`
);

const tudoOk = Object.values(veredito).every(Boolean);

console.log('\n  Veredito');
for (const [id, ok] of Object.entries(veredito)) {
  console.log(`    ${ok ? 'OK   ' : 'FALHA'} ${id}`);
}
console.log(
  `\n  ${
    tudoOk
      ? 'As oito verificacoes passam.'
      : 'Ha verificacao reprovada acima — nao prossiga sem corrigir.'
  }\n`
);
process.exit(tudoOk ? 0 : 1);
