#!/usr/bin/env node
/**
 * O portao de qualidade visual do console. Roda em `npm run check`.
 *
 * Sao SETE verificacoes (§6.6.1 do blueprint):
 *
 *   G1  Contraste de texto            WCAG 2.2 SC 1.4.3   >= 4.5:1
 *   G2  Borda de controle e de foco   WCAG 2.2 SC 1.4.11  >= 3:1
 *   G3  Borda de SUPERFICIE           DS-2.1 / DS-0.3     >= 3:1
 *   G4  Token de cor fora do :root    DS-0.1              zero
 *   G5  Classe da ponte shadcn em componente vigiado       zero
 *   G6  font-size fora do @theme      DS-0.4              zero
 *   G7  Hexadecimal literal fora da lista de excecoes     zero
 *
 * G3 e uma extensao deliberada do SC 1.4.11: a norma exige 3:1 do limite de
 * COMPONENTE e nada diz do contorno de superficie. Aqui a elevacao vem da
 * borda (globals.css), entao uma borda de cartao invisivel nao e ornamento
 * mal resolvido — e a elevacao inteira deixando de existir.
 *
 * G4 fecha o furo que anulava tudo o mais: ate a FASE 1 a classe `.shell`
 * redefinia onze tokens, este script media os do `:root`, e o build passava
 * verde descrevendo cores que ninguem via. Os hex NAO sao duplicados aqui:
 * sao lidos do :root de src/app/globals.css, que agora e a fonte unica.
 *
 * Uso: node scripts/contrast-check.mjs   (sai 1 se qualquer verificacao falhar)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

/* -------------------------------------------------------------------------
   Leitura do :root — a fonte unica de cor
   ------------------------------------------------------------------------- */

const GLOBALS = 'src/app/globals.css';
const cssGlobal = ler(GLOBALS);

/** Recorta o corpo do primeiro bloco `:root {...}` de globals.css. */
function corpoRoot(css) {
  const abre = css.indexOf(':root {');
  if (abre === -1) {
    console.error('\n  ERRO: globals.css nao tem um bloco `:root {`.\n');
    process.exit(1);
  }
  let i = css.indexOf('{', abre);
  let nivel = 0;
  for (let j = i; j < css.length; j++) {
    if (css[j] === '{') nivel++;
    else if (css[j] === '}') {
      nivel--;
      if (nivel === 0) return { texto: css.slice(i + 1, j), inicio: i + 1, fim: j };
    }
  }
  console.error('\n  ERRO: bloco `:root` de globals.css nao fecha.\n');
  process.exit(1);
}

const ROOT = corpoRoot(cssGlobal);

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

const ACENTO_FUNDO = tok('accent-fill');
const ACENTO_FUNDO_HOVER = tok('accent-fill-hover');
const ACENTO_FUNDO_ATIVO = tok('accent-fill-active');
const ACENTO_TEXTO = tok('accent-text');

const SUCESSO = tok('success');
const AVISO = tok('warning');
const ERRO = tok('danger');

const BRANCO = '#FFFFFF';

/* -------------------------------------------------------------------------
   Calculo
   ------------------------------------------------------------------------- */

const canais = (hex) =>
  hex
    .replace('#', '')
    .match(/../g)
    .map((x) => parseInt(x, 16));

const luminancia = (hex) => {
  const c = canais(hex)
    .map((x) => x / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

const razao = (a, b) => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
};

/**
 * Cor com alfa nao tem contraste proprio: o que chega ao olho e a mistura com
 * o que esta atras. `bg-muted/50` e `ring-foreground/10` passavam despercebidos
 * justamente porque ninguem compunha antes de medir.
 */
const sobrepor = (frente, alfa, fundo) => {
  const f = canais(frente);
  const t = canais(fundo);
  return (
    '#' +
    f
      .map((v, i) =>
        Math.round(v * alfa + t[i] * (1 - alfa))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
      .toUpperCase()
  );
};

/* Compostos que a interface realmente pinta. */
const PAGINA_ESCURECIDA = sobrepor('#000000', 0.6, S0); // overlay bg-black/60
const SELECAO = sobrepor(ACENTO_TEXTO, 0.15, S3); // linha ativa do select/paleta
const CARTAO_ATIVO = sobrepor(ACENTO_TEXTO, 0.1, S3); // cartao selecionado
const CAIXA_ERRO = sobrepor(ERRO, 0.1, S3); // callout/selo de erro
const CAIXA_AVISO = sobrepor(AVISO, 0.1, S3);

const TEXTO = 4.5; // SC 1.4.3 texto normal
const LIMITE = 3.0; // SC 1.4.11 limite de componente / texto grande

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

   A lista e uma EXCLUSAO, nao uma enumeracao. Ate a FASE 2 ela se chamava
   ARQUIVOS_FLUTUANTES e nomeava oito arquivos "que flutuam": o efeito pratico
   era que todo componente NOVO nascia fora da guarda, e foi por esse furo que
   passaram os quatro primitivos stock (tabs, checkbox, accordion, label) e as
   classes que button, input, textarea e separator ainda carregavam apesar de
   §13.7 os dar por curados. A FASE 3 inverteu: todo `src/components/**` e
   vigiado, e sair da guarda exige entrar na lista de excecoes abaixo — o que
   e uma decisao visivel, e nao um esquecimento (DS-6.1).

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
  ['bg-accent', /\bbg-accent(?![-\w])/, 'bg-surface-2 ou bg-accent-text/15'],
  ['text-accent-foreground', /\btext-accent-foreground\b/, 'text-fg-strong'],
  ['bg-border', /\bbg-border\b/, 'bg-line-strong'],
  ['border-input', /\bborder-input\b/, 'border-line-control'],
  ['-ring (ponte)', /\b(?:border|outline|ring)-ring\b/, 'accent-text'],
  ['destructive', /\b(?:bg|text|border|ring)-destructive\b/, 'danger'],
  ['fg-disabled em texto', /\btext-fg-disabled\b/, 'text-fg-muted'],
];

/* -------------------------------------------------------------------------
   G4 — token de cor fora do :root
   ------------------------------------------------------------------------- */

// Os quatro namespaces que so podem nascer no :root de globals.css.
const TOKEN_DE_COR = /--(surface|border|fg|accent)-[a-z0-9-]+\s*:/;

// Excecao unica, nomeada e auditada (DS-1.5): o Guia identifica topico por
// matiz, e matiz ali E a funcao. `--hue` nao pertence a nenhum dos quatro
// namespaces, entao nao casa com a regex acima — esta nota existe para que
// ninguem "conserte" isso achando que e esquecimento.

function verificarTokensForaDoRoot() {
  const problemas = [];
  for (const rel of CSS_DO_PRODUTO) {
    const linhas = linhasDe(rel);
    let deslocamento = 0;
    linhas.forEach((linha, i) => {
      const inicioDaLinha = deslocamento;
      deslocamento += linha.length + 1;
      if (!TOKEN_DE_COR.test(linha)) return;
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
const FONT_SIZE_CLASSE =
  /\btext-\[[^\]]*(px|rem|em|pt|%|vw)[^\]]*\]|\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/;
const FONT_SIZE_INLINE = /\bfontSize\b/;

function verificarFontSize() {
  const problemas = [];

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
          'use text-caption/label/body/title/heading/data',
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
   Pares medidos — G1, G2, G3
   ------------------------------------------------------------------------- */

const G1 = [
  [
    'Base — texto sobre as superficies da pagina',
    [
      ['texto forte sobre painel', FG_FORTE, S1, TEXTO],
      ['texto corpo sobre app', FG_CORPO, S0, TEXTO],
      ['texto corpo sobre painel', FG_CORPO, S1, TEXTO],
      ['texto corpo sobre input', FG_CORPO, S2, TEXTO],
      ['helper sobre painel', FG_APAGADO, S1, TEXTO],
      ['helper sobre input', FG_APAGADO, S2, TEXTO],
      ['acento texto sobre painel', ACENTO_TEXTO, S1, TEXTO],
      ['sucesso sobre painel', SUCESSO, S1, TEXTO],
      ['aviso sobre painel', AVISO, S1, TEXTO],
      ['erro sobre painel', ERRO, S1, TEXTO],
      ['erro sobre input', ERRO, S2, TEXTO],
      ['branco sobre botao primario', BRANCO, ACENTO_FUNDO, TEXTO],
      ['branco sobre primario hover', BRANCO, ACENTO_FUNDO_HOVER, TEXTO],
      ['branco sobre primario active', BRANCO, ACENTO_FUNDO_ATIVO, TEXTO],
    ],
  ],
  [
    'Camada flutuante — texto sobre a superficie de modal/popover',
    [
      ['titulo sobre modal', FG_FORTE, S3, TEXTO],
      ['texto corpo sobre modal', FG_CORPO, S3, TEXTO],
      ['descricao/helper sobre modal', FG_APAGADO, S3, TEXTO],
      ['placeholder sobre modal', FG_APAGADO, S3, TEXTO],
      ['link/acento sobre modal', ACENTO_TEXTO, S3, TEXTO],
      ['sucesso sobre modal', SUCESSO, S3, TEXTO],
      ['aviso sobre modal', AVISO, S3, TEXTO],
      ['erro sobre modal', ERRO, S3, TEXTO],
      ['texto de item de select/tooltip', FG_CORPO, S3, TEXTO],
    ],
  ],
  [
    'Dentro do modal — caixas empilhadas sobre a superficie flutuante',
    [
      // Cartao, input, rodape de acoes: fill mais escuro que o modal. O fill
      // nao delimita (1.13); quem delimita e a borda de controle logo abaixo.
      ['texto forte sobre cartao no modal', FG_FORTE, S2, TEXTO],
      ['texto corpo sobre cartao no modal', FG_CORPO, S2, TEXTO],
      ['helper sobre rodape do modal', FG_APAGADO, S2, TEXTO],
      ['texto forte sobre linha selecionada', FG_FORTE, SELECAO, TEXTO],
      ['texto corpo sobre linha selecionada', FG_CORPO, SELECAO, TEXTO],
      ['acento sobre cartao ativo', ACENTO_TEXTO, CARTAO_ATIVO, TEXTO],
      ['erro sobre caixa de erro no modal', ERRO, CAIXA_ERRO, TEXTO],
      ['aviso sobre caixa de aviso no modal', AVISO, CAIXA_AVISO, TEXTO],
    ],
  ],
];

const G2 = [
  [
    'Limites de componente (SC 1.4.11) — controle e foco',
    [
      ['borda de controle sobre app', LINHA_CONTROLE, S0, LIMITE],
      ['borda de controle sobre painel', LINHA_CONTROLE, S1, LIMITE],
      ['borda de controle sobre input', LINHA_CONTROLE, S2, LIMITE],
      ['borda de controle sobre modal', LINHA_CONTROLE, S3, LIMITE],
      // Borda externa do modal contra a pagina ja escurecida pelo overlay.
      ['borda do modal sobre pagina escurecida', LINHA_CONTROLE, PAGINA_ESCURECIDA, LIMITE],
      ['regua do rodape sobre rodape do modal', LINHA_CONTROLE, S2, LIMITE],
      ['barra da linha selecionada', ACENTO_TEXTO, S3, LIMITE],
      ['barra selecionada sobre o proprio fill', ACENTO_TEXTO, SELECAO, LIMITE],
      ['borda do cartao ativo sobre modal', ACENTO_TEXTO, S3, LIMITE],
      ['anel de foco sobre painel', FOCO, S1, LIMITE],
      ['anel de foco sobre modal', FOCO, S3, LIMITE],
      ['anel de foco sobre input', FOCO, S2, LIMITE],
    ],
  ],
];

const G3 = [
  [
    'Contorno de superficie (DS-2.1) — a elevacao vem da borda',
    [
      ['contorno de cartao sobre o app', LINHA_FORTE, S0, LIMITE],
      ['contorno de cartao sobre painel', LINHA_FORTE, S1, LIMITE],
      ['contorno de cartao sobre input', LINHA_FORTE, S2, LIMITE],
      ['divisoria interna sobre o app', LINHA_SUTIL, S0, LIMITE],
      ['divisoria interna sobre painel', LINHA_SUTIL, S1, LIMITE],
    ],
  ],
];

/* -------------------------------------------------------------------------
   Saida
   ------------------------------------------------------------------------- */

const veredito = {};
const largura = Math.max(
  ...[...G1, ...G2, ...G3].flatMap(([, casos]) => casos.map(([n]) => n.length))
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
  veredito[id] = ok;
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
console.log(`  compostos    pagina escurecida ${PAGINA_ESCURECIDA}  selecao ${SELECAO}`);
console.log(`  fonte unica  ${GLOBALS} :root  —  ${CSS_DO_PRODUTO.length} arquivos CSS auditados`);

rodarPares('G1', 'Contraste de texto (SC 1.4.3)', G1);

// --fg-disabled so pode existir enquanto ornamento. Se um dia ele cruzar 4.5
// sobre o modal, deixou de ser "desabilitado" e virou mais um cinza de texto.
const disabledOk = razao(FG_DESABILITADO, S3) < TEXTO;
if (!disabledOk) veredito.G1 = false;
console.log(
  `    ${disabledOk ? 'OK   ' : 'FALHA'} fg-disabled sobre o modal ${razao(
    FG_DESABILITADO,
    S3
  ).toFixed(2)}:1 — ornamento, nunca conteudo`
);

rodarPares('G2', 'Contraste de borda de controle e de foco (SC 1.4.11)', G2);
rodarPares('G3', 'Contraste de borda de superficie (DS-2.1, extensao do SC 1.4.11)', G3);

// Ordem: sutil < forte < controle. Se alguem inverter a escala, os comentarios
// de globals.css passam a mentir e a regra "limite usa --border-control" perde
// o sentido.
const escalaOk =
  razao(LINHA_CONTROLE, S3) > razao(LINHA_FORTE, S3) &&
  razao(LINHA_FORTE, S3) > razao(LINHA_SUTIL, S3);
if (!escalaOk) veredito.G3 = false;
console.log(
  `    ${escalaOk ? 'OK   ' : 'FALHA'} escala sutil ${razao(LINHA_SUTIL, S3).toFixed(2)}` +
    ` < padrao ${razao(LINHA_FORTE, S3).toFixed(2)}` +
    ` < controle ${razao(LINHA_CONTROLE, S3).toFixed(2)} (sobre o modal)`
);

rodarLista(
  'G4',
  'Token de cor definido fora do :root (DS-0.1)',
  verificarTokensForaDoRoot(),
  `nenhuma redefinicao de --surface-*/--border-*/--fg-*/--accent-* nos ${CSS_DO_PRODUTO.length} arquivos CSS`
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
  `escala nomeada respeitada — ${CSS_COM_TIPOGRAFIA_PENDENTE.length} arquivos ainda isentos (divida de FASE 2)`
);

rodarLista(
  'G7',
  'Hexadecimal literal fora do :root',
  verificarHexLiteral(),
  `nenhum hex solto; themeColor == --surface-0 (${S0})`
);

const tudoOk = Object.values(veredito).every(Boolean);

console.log('\n  Veredito');
for (const [id, ok] of Object.entries(veredito)) {
  console.log(`    ${ok ? 'OK   ' : 'FALHA'} ${id}`);
}
console.log(
  `\n  ${
    tudoOk
      ? 'As sete verificacoes passam.'
      : 'Ha verificacao reprovada acima — nao prossiga sem corrigir.'
  }\n`
);
process.exit(tudoOk ? 0 : 1);
