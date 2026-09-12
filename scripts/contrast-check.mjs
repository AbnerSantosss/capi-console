#!/usr/bin/env node
/**
 * Verifica os pares de cor do design system contra a WCAG 2.2.
 *   §1.4.3  texto normal        >= 4.5:1
 *   §1.4.11 limite de componente / texto grande >= 3:1
 *
 * Cobre tambem o que vinha sendo ignorado e por onde o contraste voltava a
 * quebrar: as camadas que FLUTUAM por cima da pagina (dialog, popover, select,
 * tooltip, paleta de comandos), o empilhamento de superficie dentro de um
 * modal, as bordas e as cores com alfa, que precisam ser compostas contra o
 * fundo antes de medir.
 *
 * Os hex NAO sao duplicados aqui: sao lidos de src/app/globals.css. Mudar um
 * token la refaz as contas aqui — de proposito.
 *
 * Uso: node scripts/contrast-check.mjs
 * Sai com codigo 1 se qualquer par reprovar ou se alguma camada flutuante
 * voltar a usar classe da ponte shadcn.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/* -------------------------------------------------------------------------
   Tokens lidos de globals.css
   ------------------------------------------------------------------------- */

const cssGlobal = readFileSync(join(RAIZ, 'src/app/globals.css'), 'utf8');

const tok = (nome) => {
  const achado = cssGlobal.match(
    new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})\\s*;`)
  );
  if (!achado) {
    console.error(
      `\n  ERRO: o token --${nome} nao existe (ou nao e hex) em globals.css.` +
        '\n  Renomeou ou apagou um token? Atualize este script junto.\n'
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

/* -------------------------------------------------------------------------
   Pares
   ------------------------------------------------------------------------- */

const TEXTO = 4.5; // §1.4.3 texto normal
const LIMITE = 3.0; // §1.4.11 limite de componente / texto grande

const grupos = [
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
  [
    'Limites de componente (§1.4.11) — o que separa uma camada da outra',
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

/* -------------------------------------------------------------------------
   Guarda de classes: quem flutua nao usa a ponte shadcn
   -------------------------------------------------------------------------
   Os tokens-ponte (--muted, --popover, --accent, --border, --input,
   --foreground) sao declarados uma unica vez no :root e chegam ja resolvidos
   por heranca. Dentro de uma camada flutuante eles ignoram a superficie em que
   estao e reintroduzem exatamente os pares que este script mede. Por isso sao
   proibidos por nome nos componentes abaixo.
   --fg-disabled entra na lista porque reprova como conteudo em qualquer
   superficie (3.40 sobre o modal) e vinha sendo usado como placeholder.       */

const ARQUIVOS_FLUTUANTES = [
  'src/components/ui/dialog.tsx',
  'src/components/ui/tooltip.tsx',
  'src/components/ui/select.tsx',
  'src/components/ui/badge.tsx',
  'src/components/common/CommandPalette.tsx',
  'src/components/brand/BrandDialog.tsx',
  'src/components/settings/SettingsDialog.tsx',
  'src/components/dispatch/ConfirmDialog.tsx',
];

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

function verificarClasses() {
  const problemas = [];
  for (const arquivo of ARQUIVOS_FLUTUANTES) {
    let conteudo;
    try {
      conteudo = readFileSync(join(RAIZ, arquivo), 'utf8');
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
   Saida
   ------------------------------------------------------------------------- */

let tudoOk = true;

console.log('\n  Contraste — Meta CAPI Console');
console.log(
  `  superficies  app ${S0}  painel ${S1}  elevado ${S2}  flutuante ${S3}`
);
console.log(`  compostos    pagina escurecida ${PAGINA_ESCURECIDA}  selecao ${SELECAO}`);

const largura = Math.max(
  ...grupos.flatMap(([, casos]) => casos.map(([n]) => n.length))
);

for (const [titulo, casos] of grupos) {
  console.log(`\n  ${titulo}`);
  for (const [nome, fg, bg, alvo] of casos) {
    const r = razao(fg, bg);
    const passou = r >= alvo;
    if (!passou) tudoOk = false;
    console.log(
      `  ${passou ? 'OK   ' : 'FALHA'} ${nome.padEnd(largura)}  ${r
        .toFixed(2)
        .padStart(5)}:1  (min ${alvo.toFixed(1)})`
    );
  }
}

// Ordem: sutil < forte < controle. Se alguem inverter a escala, os comentarios
// de globals.css passam a mentir e a regra "limite usa --border-control" perde
// o sentido.
console.log('\n  Escala de bordas');
const escalaOk =
  razao(LINHA_CONTROLE, S3) > razao(LINHA_FORTE, S3) &&
  razao(LINHA_FORTE, S3) > razao(LINHA_SUTIL, S3);
if (!escalaOk) tudoOk = false;
console.log(
  `  ${escalaOk ? 'OK   ' : 'FALHA'} sutil ${razao(LINHA_SUTIL, S3).toFixed(2)}` +
    ` < forte ${razao(LINHA_FORTE, S3).toFixed(2)}` +
    ` < controle ${razao(LINHA_CONTROLE, S3).toFixed(2)} (sobre o modal)`
);

// --fg-disabled so pode existir enquanto ornamento. Se um dia ele cruzar 4.5
// sobre o modal, deixou de ser "desabilitado" e virou mais um cinza de texto.
const disabledOk = razao(FG_DESABILITADO, S3) < TEXTO;
if (!disabledOk) tudoOk = false;
console.log(
  `  ${disabledOk ? 'OK   ' : 'FALHA'} fg-disabled sobre o modal ${razao(
    FG_DESABILITADO,
    S3
  ).toFixed(2)}:1 — ornamento, nunca conteudo`
);

console.log('\n  Camadas flutuantes sem classe da ponte shadcn');
const problemas = verificarClasses();
if (problemas.length === 0) {
  console.log(
    `  OK    ${ARQUIVOS_FLUTUANTES.length} arquivos limpos ` +
      `(${CLASSES_PROIBIDAS.length} classes proibidas)`
  );
} else {
  tudoOk = false;
  for (const [onde, nome, troca] of problemas) {
    console.log(`  FALHA ${onde}  usa \`${nome}\` — troque por \`${troca}\``);
  }
}

console.log(
  `\n  ${
    tudoOk
      ? 'Todos os pares passam.'
      : 'Ha pares reprovados acima — nao prossiga sem corrigir.'
  }\n`
);
process.exit(tudoOk ? 0 : 1);
