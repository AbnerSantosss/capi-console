#!/usr/bin/env node
/**
 * A aba de instalar a tag e o webhook tem um nome só na tela: "Instalação"
 * (T-M17, plano v8). O endereço continua `/fontes`.
 *
 * Só LÊ os fontes. Nenhuma rede, nenhuma escrita.
 *
 *   a  a aba do endereço `fontes` se chama "Instalação", e o título da página
 *      também;
 *   b  fora de comentário, nenhum `.ts`/`.tsx` de `src/` escreve "Fontes" como
 *      nome de aba ("Fontes de dados" é um menu da Meta e pode);
 *   c  o vazio da Fila diz onde fica o "Colar JSON";
 *   d  a dica do verificador de vocabulário não manda escrever o nome antigo.
 *
 * Uso: npm run test:nome-da-aba
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (relativo) => fs.readFileSync(path.join(RAIZ, ...relativo.split('/')), 'utf8');
/** Sem comentários de bloco e sem as linhas que são só `//`. */
const semComentarios = (fonte) => fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** O texto do JSX quebra linha no meio da frase; na tela vira um espaço só. */
const junto = (s) => s.replace(/\s+/g, ' ');

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  a. O nome da aba');
const abas = ler('src/lib/abas-empresa.ts');
ok(
  /\{\s*segmento:\s*'fontes',\s*rotulo:\s*'Instalação'/.test(abas),
  "a1: a aba do endereço 'fontes' se chama \"Instalação\""
);
const pagina = ler('src/app/(console)/e/[slug]/fontes/page.tsx');
ok(/const TITULO = 'Instalação';/.test(pagina), 'a2: o título da página é "Instalação"');
ok(!pagina.includes('A aba se chama Fontes'), 'a3: o comentário da página não diz mais que a aba se chama Fontes');

console.log('\n  b. Nenhuma tela escreve "Fontes" como nome de aba');
const NOME_ANTIGO = /(?<![\p{L}\p{N}_])Fontes(?![\p{L}\p{N}_])(?! de dados)/u;
const comNomeAntigo = [];
let lidos = 0;
const andar = (pasta) => {
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) andar(caminho);
    else if (/\.(ts|tsx)$/.test(item.name)) {
      lidos++;
      if (NOME_ANTIGO.test(semComentarios(fs.readFileSync(caminho, 'utf8')))) {
        comNomeAntigo.push(path.relative(RAIZ, caminho).replace(/\\/g, '/'));
      }
    }
  }
};
andar(path.join(RAIZ, 'src'));
ok(lidos > 50, 'b1: achou os fontes de src/', `${lidos} arquivos`);
ok(comNomeAntigo.length === 0, 'b2: nenhum arquivo escreve "Fontes" fora de comentário', comNomeAntigo.join(', '));

console.log('\n  c. O vazio da Fila diz onde fica o "Colar JSON"');
const fila = junto(semComentarios(ler('src/components/integrations/InboxList.tsx')));
ok(
  !/ou use\{' '\} <strong>Colar JSON<\/strong>\./.test(fila),
  'c1: a frase antiga ("ou use Colar JSON.") saiu'
);
ok(
  fila.includes('use <strong>Colar JSON</strong>, no Envio manual da aba Eventos.'),
  'c2: a frase nova diz onde fica o "Colar JSON"'
);
ok(fila.includes('Ligue o webhook na aba Instalação.'), 'c3: a frase continua mandando ligar o webhook na aba Instalação');

console.log('\n  d. A dica do verificador de vocabulário');
const vocabulario = ler('scripts/vocabulario-check.mjs');
ok(vocabulario.includes("usar: 'Instalação / Regras'"), 'd1: a dica de "Integrações" aponta para Instalação / Regras');

console.log(falhas === 0 ? '\n  Nome da aba Instalação: um só.' : `\n  ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
