/**
 * Aritmética de cor compartilhada pelo gate visual e pelo gerador de paleta.
 *
 * Duas famílias de função, e elas respondem perguntas diferentes:
 *
 *   luminancia/razao  — WCAG 2.2. Responde "dá para LER?". É o que G1/G2
 *                       medem, e é a norma; não se negocia.
 *   oklch/degrauL     — OKLab (Björn Ottosson, 2020). Responde "dá para VER
 *                       que são duas superfícies?". É o que G3′ mede.
 *
 * Por que duas e não uma: a luminância relativa do WCAG é quase cega a
 * diferença entre dois quase-pretos — #0e0d0b e #1a1815 dão razão 1.47, que
 * "reprova" em qualquer limiar, e ainda assim o olho vê o degrau sem esforço.
 * A luminosidade perceptual do OKLab vê: 0.150 → 0.212. Medir separação de
 * superfície com a régua do texto foi o que obrigou o produto a desenhar uma
 * borda em volta de tudo (o "traço minimalista" do diagnóstico de 14/09).
 *
 * Sem dependência externa de propósito: são duas matrizes e uma raiz cúbica,
 * e o gate não pode depender de `node_modules` para reprovar um build.
 */

/* -------------------------------------------------------------------------
   sRGB
   ------------------------------------------------------------------------- */

/** '#1a1815' → [26, 24, 21] */
export function canais(hex) {
  const limpo = hex.replace('#', '');
  const cheio =
    limpo.length === 3
      ? limpo
          .split('')
          .map((c) => c + c)
          .join('')
      : limpo;
  return cheio.match(/../g).map((x) => parseInt(x, 16));
}

/** [26, 24, 21] → '#1A1815' */
export function hexDe([r, g, b]) {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
      .toUpperCase()
  );
}

const paraLinear = (v) =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

const paraGama = (v) =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

/* -------------------------------------------------------------------------
   WCAG 2.2 — contraste
   ------------------------------------------------------------------------- */

/**
 * Luminância relativa (WCAG 2.x). O expoente de linearização aqui é 0.03928,
 * e não 0.04045 como em `paraLinear`: é o valor que a norma escreve. A
 * diferença entre os dois é de um centésimo de nível num único canal e nunca
 * muda um veredito, mas o gate mede a NORMA, então a norma é o que está aqui.
 */
export function luminancia(hex) {
  const c = canais(hex)
    .map((x) => x / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Razão de contraste WCAG entre duas cores OPACAS. Sempre >= 1. */
export function razao(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * Cor com alfa não tem contraste próprio: o que chega ao olho é a mistura com
 * o que está atrás. `bg-danger/10` e `ring-foreground/10` passavam despercebidos
 * justamente porque ninguém compunha antes de medir.
 */
export function sobrepor(frente, alfa, fundo) {
  const f = canais(frente);
  const t = canais(fundo);
  return hexDe(f.map((v, i) => v * alfa + t[i] * (1 - alfa)));
}

/**
 * A mesma mistura, na ordem em que se lê um `color-mix` de CSS:
 * `color-mix(in srgb, <frente> <alfa>, transparent)` pintado sobre `<fundo>`.
 * Existe para o pior caso de `--surface-painel` (v7): o painel translúcido
 * não tem cor própria, só a que sobra depois de compor com o que está atrás,
 * e o gate compõe sobre o ponto mais claro possível (#FFFFFF) e sobre o
 * `--surface-0` antes de medir texto em cima. `alfa` vai de 0 a 1.
 */
export function compor(frente, fundo, alfa) {
  return sobrepor(frente, alfa, fundo);
}

/* -------------------------------------------------------------------------
   OKLab / OKLCH
   ------------------------------------------------------------------------- */

/** '#1a1815' → { L, C, H } com L em 0..1, C em 0..~0.4 e H em graus. */
export function oklch(hex) {
  const [r, g, b] = canais(hex)
    .map((x) => x / 255)
    .map(paraLinear);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const H = (Math.atan2(B, A) * 180) / Math.PI;
  return {
    L,
    C: Math.sqrt(A * A + B * B),
    H: H < 0 ? H + 360 : H,
  };
}

/**
 * { L, C, H } → hex sRGB. Devolve tambem `dentroDaGama`: false quando a cor
 * pedida nao existe em sRGB e teve de ser aparada nos limites do canal — o
 * gerador avisa em vez de emitir um hex que nao e a cor que se pediu.
 */
export function hexDeOklch({ L, C, H }) {
  const rad = (H * Math.PI) / 180;
  const A = C * Math.cos(rad);
  const B = C * Math.sin(rad);

  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;

  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  const dentroDaGama = lin.every((v) => v >= -0.0005 && v <= 1.0005);
  return { hex: hexDe(lin.map((v) => paraGama(Math.min(1, Math.max(0, v))) * 255)), dentroDaGama };
}

/**
 * Degrau de luminosidade PERCEPTUAL entre duas cores. É a régua do G3′: uma
 * superfície se separa da que a contém por borda >= 3:1 OU por este degrau.
 */
export function degrauL(a, b) {
  return Math.abs(oklch(a).L - oklch(b).L);
}
