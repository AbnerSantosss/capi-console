#!/usr/bin/env node
/**
 * A fronteira de segredos do produto. Roda em `npm run check`.
 *
 * Nao e um lint de estilo: e a decisao irreversivel #8 — o token de acesso da Meta
 * NUNCA sai do servidor — transformada em portao automatico. Ate a FASE 4 esta regra
 * existia so como frase no blueprint (C6, §17.2.2) e como comando que alguem deveria
 * lembrar de digitar. Nao lembrava: a FASE 4 encontrou QUATRO violacoes vivas em
 * `BrandDialog.tsx`. Foram removidas. Este arquivo existe para que nao voltem.
 *
 * Sao DUAS verificacoes:
 *
 *   S1  (C6)    O campo do token nao aparece em src/components/        zero linhas
 *   S2  (SEC-2) O tipo publico da marca nao declara o campo do token   zero linhas
 *
 * S1 le LINHA, nao AST — igual ao contrast-check. Citar o nome do campo dentro de um
 * comentario reprova do mesmo jeito que usa-lo. E deliberado: um comentario e o passo
 * anterior a um campo, e o custo de reescrever a frase e menor que o custo de um token
 * vazando no bundle do navegador.
 *
 * O que NAO e verificado, de proposito:
 *  - `src/stores/useBrandStore.ts` monta o corpo do PUT com o campo do token. E o
 *    caminho de SUBIDA (formulario -> servidor), que precisa existir. A fronteira
 *    proibe a DESCIDA: o servidor devolve `MarcaPublica`, com `temToken: boolean`.
 *  - `src/lib/` e `src/app/api/` sao servidor. O token vive la.
 *
 * Uso: node scripts/segredos-check.mjs   (sai 1 se qualquer verificacao falhar)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * O nome do campo proibido, montado em pedacos.
 *
 * Sim, e feio. E necessario: se este script escrevesse o literal inteiro e alguem
 * ampliasse a area varrida para incluir `scripts/`, o portao reprovaria a si mesmo.
 * Montar em pedacos mantem o script imune a propria regra que ele aplica.
 */
const CAMPO = 'access' + 'Token';

/** Arvore varrida por S1 — a fronteira do cliente. */
const AREA_CLIENTE = 'src/components';

/** Extensoes que chegam ao navegador. */
const EXTENSOES = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

function arquivosDe(dirRel) {
  const fora = [];
  const raiz = join(RAIZ, dirRel);
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        andar(caminho);
      } else if (EXTENSOES.some((e) => nome.endsWith(e))) {
        fora.push(caminho);
      }
    }
  };
  andar(raiz);
  return fora.sort();
}

/** S1 — C6: o campo do token em qualquer arquivo de componente. */
function verificarFronteiraDoCliente() {
  const falhas = [];
  for (const caminho of arquivosDe(AREA_CLIENTE)) {
    const rel = relative(RAIZ, caminho).split(sep).join('/');
    const linhas = readFileSync(caminho, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      if (linha.includes(CAMPO)) {
        falhas.push(`${rel}:${i + 1}  ${linha.trim().slice(0, 100)}`);
      }
    });
  }
  return falhas;
}

/** S2 — SEC-2: o tipo que a API devolve nao pode declarar o campo do token. */
function verificarTipoPublico() {
  const rel = 'src/lib/config-store.ts';
  const texto = readFileSync(join(RAIZ, rel), 'utf8');
  const abre = texto.indexOf('export interface MarcaPublica');
  if (abre === -1) {
    return [
      `${rel}  ERRO: a interface MarcaPublica nao existe mais. ` +
        'Renomeou? Atualize este portao junto — sem ele a fronteira fica sem guarda.',
    ];
  }
  const fecha = texto.indexOf('}', abre);
  const corpo = texto.slice(abre, fecha);
  if (corpo.includes(CAMPO)) {
    const antes = texto.slice(0, abre + corpo.indexOf(CAMPO));
    const linha = antes.split('\n').length;
    return [
      `${rel}:${linha}  MarcaPublica declara o campo do token — ` +
        'e este tipo e exatamente o que GET /api/marcas devolve ao navegador.',
    ];
  }
  return [];
}

/* -------------------------------------------------------------------------
   Execucao
   ------------------------------------------------------------------------- */

const veredito = { S1: true, S2: true };

function rodar(id, titulo, falhas, textoOk) {
  console.log(`\n  ${id}  ${titulo}`);
  if (falhas.length === 0) {
    console.log(`    OK    ${textoOk}`);
    return;
  }
  veredito[id] = false;
  for (const f of falhas) console.log(`    FALHA ${f}`);
}

console.log('\n  Fronteira de segredos do console (decisao irreversivel #8)');

const arquivosVigiados = arquivosDe(AREA_CLIENTE).length;

rodar(
  'S1',
  `C6 — campo do token em ${AREA_CLIENTE}/`,
  verificarFronteiraDoCliente(),
  `${arquivosVigiados} arquivos de componente limpos`
);

rodar(
  'S2',
  'SEC-2 — o tipo devolvido pela API nao carrega o token',
  verificarTipoPublico(),
  'MarcaPublica expoe temToken: boolean, nunca o valor'
);

const tudoOk = Object.values(veredito).every(Boolean);

console.log('\n  Veredito');
for (const [id, ok] of Object.entries(veredito)) {
  console.log(`    ${ok ? 'OK   ' : 'FALHA'} ${id}`);
}
console.log(
  `\n  ${
    tudoOk
      ? 'O token nao atravessa a fronteira do cliente.'
      : 'FRONTEIRA ROMPIDA — o token de acesso da Meta pode estar indo para o navegador.\n' +
        '  Isto e a decisao irreversivel #8. Nao contorne o portao: corrija a origem.\n' +
        '  O caminho correto e devolver MarcaPublica (temToken: boolean) e manter o\n' +
        '  valor no servidor; o formulario envia o token de SUBIDA com outro nome de campo.'
  }\n`
);
process.exit(tudoOk ? 0 : 1);
