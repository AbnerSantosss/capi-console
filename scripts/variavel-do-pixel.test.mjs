#!/usr/bin/env node
/**
 * T-M20 — event_id sem troca à mão: a variável do GTM para a tag do Pixel.
 *
 * O que este teste garante:
 *   a. nenhum código gerado manda editar a tag por causa do event_id;
 *   b. a variável de cada evento é uma função que o GTM aceita, devolve o id
 *      de window.cvtag.eventId e não estoura quando a tag não está na página;
 *   c. o núcleo da tag não mudou de versão e ainda aceita o id de fora;
 *   d. a tela mostra a variável sem importar o gerador.
 *
 * Não abre rede, não grava arquivo e não envia nada a ninguém.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe !== '' ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (relativo) => {
  const inteiro = path.join(RAIZ, relativo);
  return fs.existsSync(inteiro) ? fs.readFileSync(inteiro, 'utf8') : '';
};

const ENDPOINT = 'https://exemplo.com.br/api/tag/coletar';
const CHAVE = 'cvt_TESTEchavepublica0001';
const miolo = (html) => html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const compila = (codigo) => {
  try {
    new Function(codigo);
    return true;
  } catch {
    return false;
  }
};

const { gerarTodasAsTags, gerarVariavelDoPixel } = await import(
  new URL('../src/lib/tag-script.ts', import.meta.url).href
);

/* ---------------- a — o código gerado ---------------- */

console.log('\n  a. O código gerado não manda editar a tag pelo event_id');
const tags = typeof gerarTodasAsTags === 'function' ? gerarTodasAsTags(ENDPOINT, CHAVE) : [];
ok(Array.isArray(tags) && tags.length > 0, 'gerarTodasAsTags devolve as tags');

const PEDE_EDICAO = ["eventId: ''", 'ID_DO_PIXEL', 'caminho inverso', 'Não edite à mão', '{{'];
for (const t of tags) {
  for (const formato of ['gtm', 'site']) {
    const html = String(t[formato] ?? '');
    const achados = PEDE_EDICAO.filter((p) => html.includes(p));
    ok(
      achados.length === 0,
      `${t.evento.origem} (${formato}): não pede troca à mão do event_id`,
      achados.join(' | '),
    );
    ok(compila(miolo(html)), `${t.evento.origem} (${formato}): o código ainda compila`);
    ok(
      html.includes('JavaScript personalizado') && html.includes('Event ID'),
      `${t.evento.origem} (${formato}): o cabeçalho ensina a variável do GTM`,
    );
  }
}

const lead = tags.find((t) => t.evento.origem === 'tag.lead');
ok(
  Boolean(lead) && ["email: ''", "telefone: ''", "nome: ''"].every((c) => lead.gtm.includes(c)),
  'a tag de Lead do GTM mantém e-mail, telefone e nome para preencher',
);

/* ---------------- b — a variável ---------------- */

console.log('\n  b. A variável do GTM de cada evento');
ok(typeof gerarVariavelDoPixel === 'function', 'tag-script.ts exporta gerarVariavelDoPixel');

const tinhaWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
const windowDeAntes = globalThis.window;
/** Roda a variável com um `window` de mentira (ou sem nenhum). */
const chamar = (fn, valorDeWindow) => {
  if (valorDeWindow === undefined) delete globalThis.window;
  else globalThis.window = valorDeWindow;
  try {
    return fn();
  } catch (e) {
    return `estourou: ${e && e.message}`;
  }
};

for (const t of tags) {
  const origem = t.evento.origem;
  const v = String(t.variavelDoPixel ?? '');

  ok(
    v.startsWith('function () {') && v.trimEnd().endsWith('}'),
    `${origem}: é uma função anônima, como o GTM exige`,
  );
  ok(
    v.includes(`window.cvtag.eventId("${origem}")`),
    `${origem}: lê o id de window.cvtag.eventId deste evento`,
  );

  const semComentario = v
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  const moderno = ['=>', 'const ', 'let ', '`'].filter((p) => semComentario.includes(p));
  ok(moderno.length === 0, `${origem}: só JavaScript antigo (ES5)`, moderno.join(' | '));
  const perigosos = ['{{', '</script'].filter((p) => v.includes(p));
  ok(perigosos.length === 0, `${origem}: sem chaves duplas e sem fim de script`, perigosos.join(' | '));

  let fn = null;
  try {
    fn = new Function('return (' + v + ');')();
  } catch {
    fn = null;
  }
  ok(typeof fn === 'function', `${origem}: o código da variável compila`);
  if (typeof fn !== 'function') continue;

  ok(chamar(fn, undefined) === undefined, `${origem}: sem a tag na página devolve vazio, sem estourar`);
  ok(chamar(fn, {}) === undefined, `${origem}: página sem window.cvtag devolve vazio`);
  ok(
    chamar(fn, { cvtag: { eventId: (o) => 'id-' + o } }) === 'id-' + origem,
    `${origem}: devolve o id que a tag usa`,
  );
  ok(
    chamar(fn, {
      cvtag: {
        eventId: () => {
          throw new Error('falha de propósito');
        },
      },
    }) === undefined,
    `${origem}: erro dentro da tag não estoura no GTM`,
  );
}
if (tinhaWindow) globalThis.window = windowDeAntes;
else delete globalThis.window;

ok(
  typeof gerarVariavelDoPixel === 'function' &&
    gerarVariavelDoPixel({ origem: 'purchase', evento: 'Purchase' }) === '',
  'evento fora da lista da tag não ganha variável',
);

const comAviso = tags
  .filter((t) => String(t.variavelDoPixel ?? '').includes('prioridade'))
  .map((t) => t.evento.origem);
const soABusca = JSON.stringify(comAviso) === JSON.stringify(['tag.search']);
ok(
  soABusca,
  'só a busca leva o aviso de prioridade',
  soABusca
    ? ''
    : `achado: ${comAviso.join(', ') || 'nenhum'} — se mudou de propósito, ajuste também o temBusca de VariavelDoPixel.tsx`,
);

/* ---------------- c — o núcleo ---------------- */

console.log('\n  c. O núcleo da tag não mudou');
const fonte = ler('src/lib/tag-script.ts');
ok(fonte.includes('const VERSAO_NUCLEO = 2;'), 'VERSAO_NUCLEO continua 2');
ok(fonte.includes('limpo(dados.eventId)'), 'o núcleo ainda aceita o id de fora (tags já instaladas)');
ok(fonte.includes('eventId: eventIdDe'), 'window.cvtag.eventId continua exposto');

/* ---------------- d — a tela ---------------- */

console.log('\n  d. A tela');
const estado = ler('src/components/instalacao/tag-estado.ts');
ok(estado.includes('variavelDoPixel?: string;'), 'TagGerada tem variavelDoPixel opcional');

const componente = ler('src/components/instalacao/VariavelDoPixel.tsx');
ok(componente !== '', 'VariavelDoPixel.tsx existe');
ok(
  !/from\s+['"][^'"]*tag-script['"]/.test(componente),
  'o componente não importa o gerador (ele fica no servidor)',
);
for (const texto of [
  'O site já tem o Pixel da Meta no GTM?',
  'JavaScript personalizado',
  'Event ID',
  'Initialization - All Pages',
  'Copiar variável do',
]) {
  ok(componente.includes(texto), `o componente diz "${texto}"`);
}
ok(
  !/\buppercase\b/.test(componente) && !componente.includes('list-decimal'),
  'sem caixa-alta e sem classe de lista que o projeto não usa',
);

const onde = ler('src/components/instalacao/OndeInstalarTag.tsx');
ok(
  /\{c\.id === 'gtm' && \(\s*<VariavelDoPixel\s+tags=\{\[pageview, viewcontent\]\}/.test(onde),
  'OndeInstalarTag mostra a variável de PageView e ViewContent só no caminho GTM',
);
ok(
  onde.includes('Initialization - All Pages'),
  'o passo do acionamento diz Initialization - All Pages para o PageView',
);

const extras = ler('src/components/instalacao/EventosExtras.tsx');
ok(
  /\{caminho === 'gtm' && \(\s*<div className="mt-3">\s*<VariavelDoPixel tags=\{\[tag\]\}/.test(extras),
  'EventosExtras mostra a variável de cada evento só no caminho GTM',
);

console.log(falhas === 0 ? '\n  Variável do Pixel: tudo certo.' : `\n  ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
