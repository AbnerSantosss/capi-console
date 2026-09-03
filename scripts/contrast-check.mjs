#!/usr/bin/env node
/**
 * Verifica os pares de cor do design system contra a WCAG 2.2.
 *   §1.4.3  texto normal >= 4.5:1
 *   §1.4.11 componentes de interface >= 3:1
 *
 * Uso: node scripts/contrast-check.mjs
 * Sai com codigo 1 se qualquer par reprovar.
 */

const luminancia = (hex) => {
  const canais = hex
    .replace('#', '')
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
};

const razao = (a, b) => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
};

const S0 = '#0A0E14';
const S1 = '#11161F';
const S2 = '#171E29';
const S3 = '#1F2836';

const casos = [
  ['texto forte sobre painel', '#F4F7FB', S1, 4.5],
  ['texto corpo sobre app', '#C9D4E3', S0, 4.5],
  ['texto corpo sobre painel', '#C9D4E3', S1, 4.5],
  ['texto corpo sobre input', '#C9D4E3', S2, 4.5],
  ['texto corpo sobre dialog', '#C9D4E3', S3, 4.5],
  ['helper sobre painel', '#93A1B5', S1, 4.5],
  ['helper sobre dialog', '#93A1B5', S3, 4.5],
  ['borda de controle sobre painel', '#5C6D85', S1, 3.0],
  ['borda de controle sobre input', '#5C6D85', S2, 3.0],
  ['anel de foco sobre painel', '#4DA6FF', S1, 3.0],
  ['branco sobre botao primario', '#FFFFFF', '#0064E0', 4.5],
  ['branco sobre primario hover', '#FFFFFF', '#0B6FE8', 4.5],
  ['branco sobre primario active', '#FFFFFF', '#0057C4', 4.5],
  ['acento texto sobre painel', '#4DA6FF', S1, 4.5],
  ['sucesso sobre painel', '#34D399', S1, 4.5],
  ['aviso sobre painel', '#FBBF24', S1, 4.5],
  ['erro sobre painel', '#FB7185', S1, 4.5],
  ['erro sobre input', '#FB7185', S2, 4.5],
];

let tudoOk = true;
const largura = Math.max(...casos.map(([n]) => n.length));

console.log('\n  Contraste — Meta CAPI Console\n');
for (const [nome, fg, bg, alvo] of casos) {
  const r = razao(fg, bg);
  const passou = r >= alvo;
  if (!passou) tudoOk = false;
  console.log(
    `  ${passou ? 'OK   ' : 'FALHA'} ${nome.padEnd(largura)}  ${r
      .toFixed(2)
      .padStart(5)}:1  (min ${alvo})`
  );
}

console.log(
  `\n  ${tudoOk ? 'Todos os pares passam.' : 'Ha pares reprovados acima.'}\n`
);
process.exit(tudoOk ? 0 : 1);
