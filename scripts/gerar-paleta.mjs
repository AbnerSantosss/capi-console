#!/usr/bin/env node
/**
 * Gerador da paleta "Mesa de operação" (plano v4, FASE 1).
 *
 * A paleta é ESCRITA em OKLCH e EMITIDA em hex de 6 dígitos, porque são duas
 * exigências diferentes e as duas valem:
 *   - pensar em OKLCH mantém a família coerente (mesma luminosidade
 *     perceptual entre matizes = mesmo peso na tela, mesmo contraste);
 *   - `globals.css` guarda hex de 6 dígitos porque DS-0.2 exige, e DS-0.2
 *     exige porque `contrast-check.mjs` só sabe medir cor opaca em hex.
 *
 * Este script NÃO escreve em globals.css. Ele imprime a tabela para conferir e
 * colar, e já roda contra os candidatos as mesmas medidas que o gate vai rodar
 * depois — a ideia é descobrir que um token não alcança a razão aqui, em dois
 * segundos, e não no fim da fase.
 *
 * Uso:  node scripts/gerar-paleta.mjs
 *       node scripts/gerar-paleta.mjs --hue 250   (variante fria, risco 7.1)
 */

import { hexDeOklch, oklch, razao, degrauL, sobrepor } from './lib/cor.mjs';

/* -------------------------------------------------------------------------
   Parâmetros
   ------------------------------------------------------------------------- */

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : Number(process.argv[i + 1]);
};

/** Matiz do NEUTRO. 75 = grafite quente (a direção aprovada). 250 = grafite
 *  frio, a saída de emergência do risco 7.1 do plano: troca a temperatura sem
 *  mexer em mais nada. O que não muda em variante nenhuma é o croma <= 0.01 —
 *  foi o croma ~0.03 do navy que fazia o "cinza" do produto ser azul. */
const HUE = arg('hue', 75);
const CROMA_NEUTRO = arg('croma', 0.007);

/** Uma luminosidade só para as cinco tintas, e outra só para os cinco textos
 *  de tinta. É o achado central da pesquisa de OKLCH: matizes na MESMA
 *  luminosidade têm o mesmo peso na tela e o mesmo contraste contra o fundo,
 *  então a área troca de cor sem trocar de hierarquia. */
const L_TINTA = 0.8;
const L_TINTA_TEXTO = 0.875;

const c = (L, C = CROMA_NEUTRO, H = HUE) => ({ L, C, H });

/**
 * Maior croma que ainda EXISTE em sRGB naquela luminosidade e matiz.
 *
 * Sem isto, pedir um violeta vivo a L 0.80 devolve um hex que não é a cor
 * pedida: os canais estouram, a conversão apara nos limites, e o resultado é
 * uma cor de matiz e luminosidade diferentes — silenciosamente. Como a
 * família inteira é definida por L constante (é o que faz as cinco áreas
 * terem o mesmo peso), deixar um matiz escapar da gama quebra justamente a
 * propriedade que se quis garantir. Então o croma cede, e o L nunca.
 */
function cromaNaGama(L, C, H) {
  if (hexDeOklch({ L, C, H }).dentroDaGama) return C;
  let baixo = 0;
  let alto = C;
  for (let i = 0; i < 24; i++) {
    const meio = (baixo + alto) / 2;
    if (hexDeOklch({ L, C: meio, H }).dentroDaGama) baixo = meio;
    else alto = meio;
  }
  return baixo;
}

/* -------------------------------------------------------------------------
   A paleta
   ------------------------------------------------------------------------- */

const ESPEC = {
  '--- Superfícies (a escada que separa por LUZ, não por linha) ---': null,
  'surface-0': c(0.15, 0.006),
  'surface-1': c(0.212),
  'surface-2': c(0.258),
  'surface-3': c(0.31, 0.008),

  '--- Bordas ---': null,
  // Filete INTERNO. Sob G3′ não precisa mais fingir que é contorno de
  // superfície: linha de tabela e separador dentro de painel são decoração de
  // leitura, e quem separa duas linhas de dado é o conteúdo, o alinhamento e o
  // espaço — não a régua. Ela só precisa ser VISÍVEL.
  'border-subtle': c(0.355, 0.006),
  // Contorno OPCIONAL de superfície: sobrou para barra, tabela e o que
  // realmente pede moldura. Cartão não usa mais.
  'border-default': c(0.445),
  // Limite de COMPONENTE. Este continua sendo WCAG SC 1.4.11, >= 3:1 contra as
  // quatro superfícies — input, select, botão secundário, borda de modal.
  'border-control': c(0.582, 0.008),
  // Anel de foco NEUTRO: vale onde não há área (cabeçalho, login). Dentro de
  // <main data-area> o anel passa a ser --tinta-texto (ver §3.1 do plano).
  'border-focus': c(0.82, 0.01),

  '--- Texto ---': null,
  'fg-strong': c(0.955, 0.004),
  'fg-body': c(0.845, 0.006),
  'fg-muted': c(0.695, 0.008),
  // Ornamento, nunca conteúdo: tem de REPROVAR 4.5:1 contra o modal.
  'fg-disabled': c(0.55),

  '--- Papel (a ação, no lugar do azul de fábrica) ---': null,
  papel: c(0.945, 0.008, 80),
  'papel-hover': c(0.985, 0.004, 80),
  'papel-active': c(0.885, 0.01, 80),
  'papel-texto': c(0.19, 0.01),
};

/** Status e tintas. Status ficam em hex fixo — são vocabulário, não paleta:
 *  verde/âmbar/vermelho são lidos culturalmente e não se redesenham. */
const STATUS = {
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#fb7f93',
};

/** As cinco áreas. `fill` entra em fundo 12–16%, ícone e linha; `texto` é o
 *  que passa a carregar link, aba ativa, foco e valor em destaque — o lugar
 *  que era do azul fixo. Instalação sai do azul-céu: era a única tinta que
 *  repetia a cor de ação, e era ela que fazia "instalar" parecer "agir". */
const AREAS = [
  ['painel', 190, 0.125, 'teal — o dado que chegou'],
  ['instalacao', 122, 0.12, 'musgo — as portas de entrada'],
  // Fica no ouro, a 8° do âmbar de `--warning`, e isso é uma DECISÃO, não um
  // descuido: é a situação que já existe hoje (`--tinta-pixels` é literalmente
  // `#f59e0b`), e mudá-la só trocaria esta vizinhança por outra — o círculo
  // não tem cinco fendas livres depois de reservar verde, âmbar e rosa para
  // estado. O que separa os dois é medido logo abaixo: o texto de tinta de
  // Pixels fica >= 0.05 de L acima do aviso, o preenchimento de área nunca
  // passa de 16%, e aviso sempre traz ícone e palavra (SC 1.4.1).
  ['pixels', 78, 0.145, 'ouro — para onde o evento vai'],
  // Saiu do coral (18°) para o rosa-magenta: no coral, `--tinta-manual` e
  // `--danger` eram a MESMA cor a 7° de distância — e `/manual` é justamente a
  // tela onde aparece a confirmação destrutiva. A tinta da área não pode ser
  // indistinguível do aviso de que algo vai dar errado.
  ['manual', 340, 0.135, 'rosa — ação humana'],
  ['automatico', 295, 0.14, 'violeta — regras rodando sozinhas'],
];

/* -------------------------------------------------------------------------
   Emissão
   ------------------------------------------------------------------------- */

const HEX = {};
const aparados = [];

const emitir = (nome, espec) => {
  const C = cromaNaGama(espec.L, espec.C, espec.H);
  if (C < espec.C - 0.0005) aparados.push(`${nome} ${espec.C.toFixed(3)}→${C.toFixed(3)}`);
  HEX[nome] = hexDeOklch({ ...espec, C }).hex;
  return HEX[nome];
};

console.log(`\n  Paleta "Mesa de operação" — matiz do neutro ${HUE}, croma ${CROMA_NEUTRO}`);
console.log('  ' + '-'.repeat(74));
console.log(`  ${'token'.padEnd(18)} ${'oklch(L C H)'.padEnd(26)} hex`);

for (const [nome, espec] of Object.entries(ESPEC)) {
  if (espec === null) {
    console.log(`\n  ${nome}`);
    continue;
  }
  const hex = emitir(nome, espec);
  const desc = `${espec.L.toFixed(3)} ${espec.C.toFixed(3)} ${espec.H}`;
  console.log(`  --${nome.padEnd(16)} oklch(${desc})`.padEnd(46) + `  ${hex.toLowerCase()}`);
}

console.log('\n  --- Tintas por área ---');
for (const [area, H, C, desc] of AREAS) {
  const fill = emitir(`tinta-${area}`, { L: L_TINTA, C, H });
  const texto = emitir(`tinta-texto-${area}`, { L: L_TINTA_TEXTO, C: C * 0.82, H });
  console.log(
    `  --tinta-${area.padEnd(11)} ${fill.toLowerCase()}   --tinta-texto-${area.padEnd(11)} ${texto.toLowerCase()}   ${desc}`
  );
}

console.log('\n  --- Status (hex fixo: vocabulário, não paleta) ---');
for (const [nome, hex] of Object.entries(STATUS)) {
  HEX[nome] = hex.toUpperCase();
  const o = oklch(hex);
  console.log(
    `  --${nome.padEnd(16)} ${hex}   L ${o.L.toFixed(3)}  C ${o.C.toFixed(3)}  H ${o.H.toFixed(0)}`
  );
}

if (aparados.length) {
  console.log(
    `\n  croma aparado na gama sRGB (L e matiz preservados): ${aparados.join(' · ')}`
  );
}

/* -------------------------------------------------------------------------
   As mesmas medidas que o gate vai rodar
   ------------------------------------------------------------------------- */

const T = 4.5;
const L3 = 3.0;
let falhas = 0;

const linha = (ok, rotulo, valor, alvo) => {
  if (!ok) falhas++;
  console.log(
    `    ${ok ? 'OK   ' : 'FALHA'} ${rotulo.padEnd(46)} ${valor.padStart(6)}  ${alvo}`
  );
};

const mede = (rotulo, a, b, alvo = T) =>
  linha(razao(a, b) >= alvo, rotulo, razao(a, b).toFixed(2) + ':1', `(min ${alvo.toFixed(1)})`);

const S = [HEX['surface-0'], HEX['surface-1'], HEX['surface-2'], HEX['surface-3']];

console.log('\n  G1 — contraste de texto (SC 1.4.3, >= 4.5:1)');
['fg-strong', 'fg-body', 'fg-muted'].forEach((t) =>
  S.forEach((s, i) => mede(`${t} sobre surface-${i}`, HEX[t], s))
);
mede('papel-texto sobre papel', HEX['papel-texto'], HEX.papel);
mede('papel-texto sobre papel-hover', HEX['papel-texto'], HEX['papel-hover']);
mede('papel-texto sobre papel-active', HEX['papel-texto'], HEX['papel-active']);
['success', 'warning', 'danger'].forEach((t) =>
  [1, 2, 3].forEach((i) => mede(`${t} sobre surface-${i}`, HEX[t], S[i]))
);
for (const [area] of AREAS) {
  [1, 2, 3].forEach((i) =>
    mede(`tinta-texto-${area} sobre surface-${i}`, HEX[`tinta-texto-${area}`], S[i])
  );
}
// Caixas compostas que a interface realmente pinta.
[['danger', 'erro'], ['warning', 'aviso']].forEach(([t, nome]) =>
  mede(`${t} sobre caixa de ${nome} (10% no modal)`, HEX[t], sobrepor(HEX[t], 0.1, S[3]))
);

const orn = razao(HEX['fg-disabled'], S[3]);
linha(orn < T, 'fg-disabled sobre surface-3 (tem de REPROVAR)', orn.toFixed(2) + ':1', '(max 4.5)');

console.log('\n  G2 — limite de componente e foco (SC 1.4.11, >= 3:1)');
S.forEach((s, i) => mede(`border-control sobre surface-${i}`, HEX['border-control'], s, L3));
mede('border-control sobre página escurecida', HEX['border-control'], sobrepor('#000000', 0.6, S[0]), L3);
[1, 2, 3].forEach((i) => mede(`border-focus (neutro) sobre surface-${i}`, HEX['border-focus'], S[i], L3));
for (const [area] of AREAS) {
  [1, 2, 3].forEach((i) =>
    mede(`foco tinta-texto-${area} sobre surface-${i}`, HEX[`tinta-texto-${area}`], S[i], L3)
  );
}

console.log("\n  G3′ — separação de superfície (borda >= 3:1 OU degrau OKLCH >= 0.04)");
const pares = [
  ['surface-1 dentro de surface-0', 'surface-0', 'surface-1'],
  ['surface-2 dentro de surface-1', 'surface-1', 'surface-2'],
  ['surface-3 dentro de surface-2', 'surface-2', 'surface-3'],
  ['surface-2 dentro de surface-0', 'surface-0', 'surface-2'],
];
for (const [rotulo, a, b] of pares) {
  const d = degrauL(HEX[a], HEX[b]);
  linha(d >= 0.04, rotulo, d.toFixed(3), '(min 0.040 de L)');
}
const vis = razao(HEX['border-subtle'], HEX['surface-1']);
linha(vis >= 1.5, 'border-subtle visível sobre surface-1', vis.toFixed(2) + ':1', '(min 1.5, filete)');

console.log('\n  Separação de matiz — as cinco tintas mais os três status');
const familia = [
  ...AREAS.map(([a, H]) => [`tinta-${a}`, H]),
  ...Object.keys(STATUS).map((s) => [s, oklch(STATUS[s]).H]),
];
for (let i = 0; i < familia.length; i++) {
  for (let j = i + 1; j < familia.length; j++) {
    const d = Math.min(
      Math.abs(familia[i][1] - familia[j][1]),
      360 - Math.abs(familia[i][1] - familia[j][1])
    );
    if (d < 32) {
      console.log(
        `    aviso  ${familia[i][0]} e ${familia[j][0]} a ${d.toFixed(0)}° — ` +
          'só convivem porque status sempre traz ícone + palavra (SC 1.4.1)'
      );
    }
  }
}
const dLPixelsAviso = Math.abs(oklch(HEX['tinta-texto-pixels']).L - oklch(HEX.warning).L);
linha(
  dLPixelsAviso >= 0.05,
  'tinta-texto-pixels distinta de warning (risco 7.2)',
  dLPixelsAviso.toFixed(3),
  '(min 0.050 de L)'
);

console.log(
  `\n  ${falhas === 0 ? 'Todos os candidatos passam.' : `${falhas} candidato(s) reprovado(s) — ajuste o L antes de escrever em globals.css.`}\n`
);
process.exit(falhas === 0 ? 0 : 1);
