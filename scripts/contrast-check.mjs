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
 *   G7  Hexadecimal literal fora da lista de excecoes     zero
 *   G9  Token morto do v3 vivo em src/                    zero
 *
 * A numeracao pula o G8 de proposito: ela e a do `plano-redesign-visual-v4.md`,
 * e renumerar aqui quebraria a conversa entre o gate e o documento que o
 * autoriza. Quem le "G9 falhou" tem de achar G9 no plano.
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
 * Uso: node scripts/contrast-check.mjs   (sai 1 se qualquer verificacao falhar)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { razao, sobrepor, degrauL } from './lib/cor.mjs';

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

const ROOT = corpoDoBloco(cssGlobal, ':root {');
const TEMA_ESTATICO = corpoDoBloco(cssGlobal, '@theme static {');

const tok = (nome) => {
  const achado = ROOT.texto.match(new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!achado) {
    console.error(
      `\n  ERRO: o token --${nome} nao existe (ou nao e hex de 6 digitos) no ` +
        ':root de globals.css.\n  Renomeou, apagou ou converteu para rgba()/oklch()? ' +
        'Este script so calcula contraste de cor opaca em hex —\n  ' +
        'e por isso que DS-0.2 exige hex de 6 digitos. Atualize os dois juntos.\n'
    );
    process.exit(1);
  }
  return achado[1].toUpperCase();
};

const S0 = tok('surface-0');
const S1 = tok('surface-1');
const S2 = tok('surface-2');
const S3 = tok('surface-3'); // dialog / popover / select / tooltip / paleta

const LINHA_SUTIL = tok('border-subtle');
const LINHA_FORTE = tok('border-default');
const LINHA_CONTROLE = tok('border-control');
const FOCO = tok('border-focus');

const FG_FORTE = tok('fg-strong');
const FG_CORPO = tok('fg-body');
const FG_APAGADO = tok('fg-muted');
const FG_DESABILITADO = tok('fg-disabled');

/* O papel: a acao primaria do v4. Fundo claro, texto quase preto — o elemento
   de maior luminosidade da tela, que e o que o olho acha primeiro sem precisar
   de matiz nenhum. Os tres estados sao medidos porque hover e active tambem
   carregam texto, e um `active` que escurece demais quebra a leitura no exato
   instante em que o dedo esta em cima do botao que gasta dinheiro. */
const PAPEL = tok('papel');
const PAPEL_HOVER = tok('papel-hover');
const PAPEL_ATIVO = tok('papel-active');
const PAPEL_TEXTO = tok('papel-texto');

/* As cinco areas. `--tinta-*` (L 0.80) e o degrau de FUNDO — pintura a 6–16%,
   filete, regua, icone grande, controle marcado. `--tinta-texto-*` (L 0.875) e
   o degrau de TEXTO e do anel de foco. Sao dois degraus e nao um porque o que
   serve de fundo a 16% nao serve de letra a 13px, e vice-versa.

   As cinco sao medidas uma a uma, e nao so a do painel: o gate mede o PIOR
   caso das cinco, porque `[data-area]` troca a tinta por rota e o operador nao
   escolhe em qual area ele precisa enxergar. */
const AREAS = ['painel', 'instalacao', 'pixels', 'manual', 'automatico'].map((nome) => ({
  nome,
  tinta: tok(`tinta-${nome}`),
  texto: tok(`tinta-texto-${nome}`),
}));

const SUCESSO = tok('success');
const AVISO = tok('warning');
const ERRO = tok('danger');

/* -------------------------------------------------------------------------
   Compostos que a interface realmente pinta
   -------------------------------------------------------------------------
   Cor com alfa nao tem contraste proprio: o que chega ao olho e a mistura com
   o que esta atras. Medir `--danger` contra `--surface-3` e responder uma
   pergunta que a tela nunca faz — o que a tela pinta e a caixa de erro a 10%.
   ------------------------------------------------------------------------- */

const PAGINA_ESCURECIDA = sobrepor('#000000', 0.6, S0); // overlay bg-black/60
const CAIXA_ERRO = sobrepor(ERRO, 0.1, S3); // callout/selo de erro
const CAIXA_AVISO = sobrepor(AVISO, 0.1, S3);

/** Linha ativa de select / paleta de comandos: tinta a 15% sobre o flutuante. */
const selecaoDe = (area) => sobrepor(area.tinta, 0.15, S3);
/** Caixa da area dentro de um painel: tinta a 16% sobre o painel. */
const caixaDe = (area) => sobrepor(area.tinta, 0.16, S1);

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

   Sao duas excecoes, e so duas.                                            */

// 1. Os DECORATIVOS. Malhas e feixes de luz: nao carregam texto nem estado,
//    entao nao ha par de contraste a medir neles.
const DECORATIVOS = [
  'src/components/ui/dot-pattern.tsx',
  'src/components/ui/grid-pattern.tsx',
  'src/components/ui/animated-grid-pattern.tsx',
  'src/components/ui/border-beam.tsx',
];

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
      const dentroDoRoot =
        rel === GLOBALS && inicioDaLinha >= ROOT.inicio && inicioDaLinha < ROOT.fim;
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
   G7 — hexadecimal literal
   ------------------------------------------------------------------------- */

/* Marca de terceiro e ornamento sem papel semantico ficam de fora: a cor da
   Meta, do Pix e do WhatsApp E a identidade deles, nao uma escolha nossa.
   `login/` e `auth/` ficam de fora porque a tela de entrada esta fora do
   escopo de redesenho (decisao irreversivel #13) — o que nao a absolve: ela
   tem 14 hexadecimais proprios, e e por isso que parece de outro sistema. */
const SEM_HEX = [
  'src/components/ui/brand-icons.tsx',
  'src/components/ui/app-mark.tsx',
  'src/components/ui/border-beam.tsx',
  'src/components/magicui/',
  'src/components/auth/',
  'src/app/login/',
];

const HEX_LITERAL = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/;

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
      if (!HEX_LITERAL.test(linha)) return;
      // O :root de globals.css e o unico lugar do produto onde um hex e a
      // definicao, e nao uma copia.
      if (rel === GLOBALS && inicioDaLinha >= ROOT.inicio && inicioDaLinha < ROOT.fim)
        return;
      // DS-1.5: os seis matizes do Guia. Excecao nomeada e auditada.
      if (/--hue\s*:/.test(linha)) return;
      problemas.push([
        `${rel}:${i + 1}`,
        (linha.match(HEX_LITERAL) || [''])[0],
        'use um token de globals.css',
      ]);
    });
  }

  // themeColor e metadado: nao aceita var(). Entao em vez de dispensa-lo do
  // G7, conferimos que ele repete exatamente --surface-0 — e a cor da barra
  // do navegador, e ela emendar com o fundo da aplicacao e o ponto.
  const layout = ler('src/app/layout.tsx');
  const achado = layout.match(/themeColor:\s*'(#[0-9a-fA-F]{6})'/);
  if (!achado) {
    problemas.push(['src/app/layout.tsx', 'themeColor ausente', `use '${S0.toLowerCase()}'`]);
  } else if (achado[1].toUpperCase() !== S0) {
    problemas.push([
      'src/app/layout.tsx',
      `themeColor ${achado[1]} != --surface-0 ${S0}`,
      `use '${S0.toLowerCase()}'`,
    ]);
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
   G9 — token morto do v3 vivo em src/
   -------------------------------------------------------------------------
   Quatro nomes que o v4 enterrou, e o que os substituiu:

     accent-text   -> tinta-texto   (link, aba ativa, icone ativo, valor em
                                     destaque, anel de foco, barra de selecao)
     accent-fill   -> tinta         (fundo a 6–16%, filete, regua, preenchimento
                                     de controle marcado, barra de progresso)
     bg-primary    -> bg-papel      (a acao primaria e o papel claro)
     text-primary  -> text-papel-texto, ou text-fg-strong quando era so enfase

   A busca e feita aqui dentro, lendo os arquivos, e nao por `grep` externo: o
   repositorio roda em Windows e um gate que depende de um binario que pode nao
   existir e um gate que as vezes nao roda — o que e pior do que nao ter gate,
   porque da a impressao de que rodou.

   Esta regua tem data de validade. Quando `accent-*` nao existir mais em
   nenhum branch nem na memoria de ninguem, ela pode sair — e nao antes.
   ------------------------------------------------------------------------- */

const TOKENS_MORTOS = ['accent-fill', 'accent-text', 'bg-primary', 'text-primary'];

const SUBSTITUTO = {
  'accent-fill': 'bg-tinta (ou bg-tinta/16 quando era pintura)',
  'accent-text': 'tinta-texto',
  'bg-primary': 'bg-papel',
  'text-primary': 'text-papel-texto ou text-fg-strong',
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
    // A acao primaria do v4 e uma inversao: papel claro, letra quase preta.
    // Os tres estados carregam texto, entao os tres sao medidos — um `active`
    // que escurece demais quebra a leitura no instante do clique.
    'Papel — a acao primaria (fundo claro, texto escuro)',
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
    // de etapa) — e ela e clara, L 0.80. Por isso o glifo inverte para
    // `surface-0` em vez de continuar branco: branco sobre a tinta daria ~1.7
    // e o estado sumiria dentro do proprio controle.
    'Tinta cheia — o glifo do controle marcado inverte',
    porArea(
      'surface-0 sobre a tinta',
      () => S0,
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

/* -------------------------------------------------------------------------
   Saida
   ------------------------------------------------------------------------- */

const veredito = {};
const largura = Math.max(
  ...[...G1, ...G2].flatMap(([, casos]) => casos.map(([n]) => n.length)),
  ...SEPARACOES.map(([n]) => n.length)
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
console.log(`  superficies  app ${S0}  painel ${S1}  elevado ${S2}  flutuante ${S3}`);
console.log(`  bordas       sutil ${LINHA_SUTIL}  padrao ${LINHA_FORTE}  controle ${LINHA_CONTROLE}`);
console.log(`  papel        ${PAPEL} com texto ${PAPEL_TEXTO}  (a acao primaria)`);
console.log(`  tintas       ${AREAS.map((a) => `${a.nome} ${a.tinta}`).join('  ')}`);
console.log(`  fonte unica  ${GLOBALS} :root  —  ${CSS_DO_PRODUTO.length} arquivos CSS auditados`);

rodarPares('G1', 'Contraste de texto (SC 1.4.3)', G1);

// --fg-disabled so pode existir enquanto ornamento. Se um dia ele cruzar 4.5
// sobre o modal, deixou de ser "desabilitado" e virou mais um cinza de texto.
// Esta e a UNICA linha do gate em que passar e falhar.
const disabledOk = razao(FG_DESABILITADO, S3) < TEXTO;
if (!disabledOk) veredito.G1 = false;
console.log(
  `    ${disabledOk ? 'OK   ' : 'FALHA'} fg-disabled sobre o modal ${razao(
    FG_DESABILITADO,
    S3
  ).toFixed(2)}:1 — ornamento, nunca conteudo`
);

rodarPares('G2', 'Contraste de borda de controle e de foco (SC 1.4.11)', G2);

/* G3' — cada superficie precisa de UMA das duas provas. */
console.log("\n  G3' — Separacao de superficie (borda >= 3:1 OU degrau de L >= 0.04)");
console.log('    A escada do v4 e feita de degraus medidos, e nao de bordas desenhadas');
let g3Ok = true;
for (const [nome, dentro, fora] of SEPARACOES) {
  const dL = degrauL(dentro, fora);
  const borda = razao(LINHA_FORTE, fora);
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

/* O filete interno. Piso proprio (1.5), e o comentario acima explica por que
   isso nao e um 3:1 negociado para baixo. */
console.log('    Filete interno — divisoria dentro de superficie ja delimitada');
for (const [nome, fundo] of [
  ['filete sobre o app', S0],
  ['filete sobre painel', S1],
]) {
  const r = razao(LINHA_SUTIL, fundo);
  const passou = r >= FILETE;
  if (!passou) g3Ok = false;
  console.log(
    `    ${passou ? 'OK   ' : 'FALHA'} ${nome.padEnd(largura)}  ${r
      .toFixed(2)
      .padStart(5)}:1  (min ${FILETE.toFixed(1)})`
  );
}

// Ordem: sutil < forte < controle. Se alguem inverter a escala, os comentarios
// de globals.css passam a mentir e a regra "limite usa --border-control" perde
// o sentido.
const escalaOk =
  razao(LINHA_CONTROLE, S3) > razao(LINHA_FORTE, S3) &&
  razao(LINHA_FORTE, S3) > razao(LINHA_SUTIL, S3);
if (!escalaOk) g3Ok = false;
console.log(
  `    ${escalaOk ? 'OK   ' : 'FALHA'} escala sutil ${razao(LINHA_SUTIL, S3).toFixed(2)}` +
    ` < padrao ${razao(LINHA_FORTE, S3).toFixed(2)}` +
    ` < controle ${razao(LINHA_CONTROLE, S3).toFixed(2)} (sobre o modal)`
);
veredito["G3'"] = g3Ok;

rodarLista(
  'G4',
  'Token de cor definido fora do :root (DS-0.1)',
  verificarTokensForaDoRoot(),
  'nenhuma redefinicao de --surface-*/--border-*/--fg-*/--papel*/--tinta-texto-* ' +
    `nos ${CSS_DO_PRODUTO.length} arquivos CSS (os apelidos --tinta/--tinta-texto ` +
    'trocam por area, de proposito)'
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
  'Hexadecimal literal fora do :root',
  verificarHexLiteral(),
  `nenhum hex solto; themeColor == --surface-0 (${S0})`
);

rodarLista(
  'G9',
  'Token morto do v3 (accent-fill, accent-text, bg-primary, text-primary)',
  verificarTokensMortos(),
  `o azul de acao nao existe mais em nenhum dos ${ARQUIVOS_DE_FONTE.length} arquivos de src/`
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
