#!/usr/bin/env node
/**
 * As outras abas da empresa — tarefa V7 do plano v7 (Fontes, Pixels, Eventos,
 * Regras, Configurações).
 *
 * O que este arquivo prova, lendo o fonte (o projeto não tem jsdom nem
 * testing-library; o roteiro de clique do dono confere o comportamento no
 * navegador):
 *
 *   a  o painel do Repasse saiu da `IntegrationsPage` para `Repasse.tsx`: a
 *      página importa e monta `<Repasse` (pelo NOME do componente — um grep
 *      pelo texto "Repasse" passaria vazio, porque a V6 já trocou a palavra),
 *      leva `id="repasse"`, e o ramo `retornos` só renderiza `<Repasse …/>`,
 *      sem nenhum `fetch(`/`pedir(` dali até o fim do arquivo. Os símbolos
 *      do painel antigo (`ROTULO_EVENTO`, "Repasse para outros sistemas",
 *      "Histórico do repasse", a `<table>`) moram agora só em `Repasse.tsx`,
 *      que só desenha.
 *   b  `RulesSection.tsx` diz "Só sai sozinho quando as duas estão ligadas" e
 *      continua falando do `regrasRascunho` (C5), que mora na
 *      `IntegrationsPage` como estado próprio.
 *   c  `CardDePixel.tsx` diz "Ligado" e "Desligado" junto do `Switch`, e o
 *      `ui/switch.tsx` escreve a palavra do estado ao lado do controle.
 *   d  `FormularioDeEmpresa.tsx` não tem `moeda`, `paisTelefone` nem
 *      `nomeDoProduto` (campos que a `Empresa` não tem).
 *   e  `InstalacaoPage.tsx` segue mandando `empresaId` no corpo de cada PUT
 *      (C2), e `scripts/empresa-abas.test.mjs` passa.
 *   f  `SeletorDeVista.tsx` tem as 4 vistas na ordem Resumo, Compras, Fila,
 *      Envio manual, e a página de Eventos o monta em todas as vistas.
 *   g  o cartão "Disparo manual" de `ExplicacaoDoDisparo.tsx` não leva mais a
 *      `href: '/'` (a Visão geral): leva a `eventos?vista=manual`, com o slug
 *      que a aba Regras passa.
 *
 * 🔴 Nenhuma rede e nenhuma escrita: este teste só LÊ fontes de `src/` e roda
 * o `empresa-abas.test.mjs` num processo filho (que tem o próprio espião). O
 * `fetch` global é trocado por um que LANÇA — em especial para
 * graph.facebook.com e api.cloudflare.com —, para que um descuido futuro
 * falhe alto em vez de sair para a rede. Roda sem ACCESS_TOKEN e não abre
 * `config/` nem `logs/`.
 *
 * Uso: npm run test:abas
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------------- 0. Rede trancada ---------------- */

const tentativas = [];
const fetchFalso = async (entrada) => {
  const url = typeof entrada === 'string' ? entrada : String(entrada?.url ?? entrada);
  tentativas.push(url);
  if (/graph\.facebook\.com|api\.cloudflare\.com/i.test(url)) {
    throw new Error(`🔴 teste tentou falar com ${new URL(url).host} — proibido`);
  }
  throw new Error(`teste estático não chama rede (tentou ${url.slice(0, 80)})`);
};
globalThis.fetch = fetchFalso;
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** O fonte cru, ou '' se o arquivo não existe. */
const lerCru = (relativo) => {
  try {
    return fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  } catch {
    return '';
  }
};

/**
 * O fonte sem comentários de bloco (inclusive os `{/* … *\/}` do JSX, que
 * sobram como `{}`) e sem as linhas que são só comentário `//` — o mesmo corte
 * de `regras-rascunho.test.mjs`. Os comentários citam os nomes antigos para
 * explicar a mudança; só o código conta.
 */
const semComentarios = (fonte) =>
  fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\}/g, '');

const ler = (relativo) => semComentarios(lerCru(relativo));

/** Do caractere de abertura em `inicio` até o que o fecha, contando pares. */
function bloco(fonte, inicio, abre, fecha) {
  if (inicio < 0 || fonte[inicio] !== abre) return '';
  let fundo = 0;
  for (let i = inicio; i < fonte.length; i++) {
    if (fonte[i] === abre) fundo++;
    else if (fonte[i] === fecha && --fundo === 0) return fonte.slice(inicio, i + 1);
  }
  return '';
}

/**
 * Uma chamada `fetch(`/`pedir(`, inclusive com tipo genérico
 * (`pedir<{ integracoes: Integracoes }>(`).
 */
const CHAMADA_DE_REDE = /(?<![\w.])(fetch|pedir)(?:<[^()]*?>)?\(/;

/**
 * Os argumentos (entre parênteses) de cada chamada `nome(` ou `nome<Tipo>(` —
 * `nome` inteiro, não prefixo.
 */
function argumentosDasChamadas(fonte, nome) {
  const re = new RegExp(`(?<![\\w.])${nome}(?:<[^()]*?>)?\\(`, 'g');
  const lista = [];
  let m;
  while ((m = re.exec(fonte))) lista.push(bloco(fonte, m.index + m[0].length - 1, '(', ')'));
  return lista;
}

/** O elemento JSX `<Nome …/>` inteiro, do `<` ao `/>`. */
const elementoJsx = (fonte, nome) => fonte.match(new RegExp(`<${nome}\\b[\\s\\S]*?\\/>`))?.[0] ?? '';

const pagina = ler('src/components/integrations/IntegrationsPage.tsx');
const repasse = ler('src/components/integrations/Repasse.tsx');
const secaoRegras = ler('src/components/integrations/RulesSection.tsx');
const secaoRegrasCru = lerCru('src/components/integrations/RulesSection.tsx');
const cartaoPixel = ler('src/components/pixels/CardDePixel.tsx');
const interruptor = ler('src/components/ui/switch.tsx');
const formularioCru = lerCru('src/components/empresa/FormularioDeEmpresa.tsx');
const instalacao = ler('src/components/instalacao/InstalacaoPage.tsx');
const seletor = ler('src/components/eventos/SeletorDeVista.tsx');
const paginaEventos = ler('src/app/(console)/e/[slug]/eventos/page.tsx');
const explicacao = ler('src/components/common/ExplicacaoDoDisparo.tsx');
const paginaRegras = ler('src/app/(console)/e/[slug]/regras/page.tsx');

/* ---------------- a. Repasse extraído ---------------- */

console.log('\n  a. O painel do Repasse mora em Repasse.tsx');

ok(fs.existsSync(path.join(RAIZ, 'src/components/integrations/Repasse.tsx')), '🔴 a1: Repasse.tsx existe');
ok(
  /import\s*\{[^}]*\bRepasse\b[^}]*\}\s*from\s*'\.\/Repasse'/.test(pagina),
  '🔴 a2: IntegrationsPage importa o componente Repasse de ./Repasse'
);
const elementoRepasse = elementoJsx(pagina, 'Repasse');
ok(elementoRepasse.length > 0, '🔴 a3: IntegrationsPage monta <Repasse …/>');
ok(/\bid="repasse"/.test(elementoRepasse), '🔴 a4: o <Repasse> leva id="repasse" (a âncora da aba)');

const aberturaRetornos = pagina.search(/<TabsContent\b[^>]*\bvalue="retornos"/);
ok(aberturaRetornos >= 0, 'a5: o ramo da aba `retornos` existe (a chave interna fica)');
const doRamoAoFim = aberturaRetornos >= 0 ? pagina.slice(aberturaRetornos) : '';
ok(
  doRamoAoFim.length > 0 && !CHAMADA_DE_REDE.test(doRamoAoFim),
  '🔴 a6: da abertura do ramo `retornos` até o fim do arquivo não sobrou fetch( nem pedir('
);
const fimDoRamo = doRamoAoFim.indexOf('</TabsContent>');
const miolo = fimDoRamo >= 0 ? doRamoAoFim.slice(doRamoAoFim.indexOf('>') + 1, fimDoRamo) : '';
ok(
  fimDoRamo >= 0 && miolo.replace(elementoJsx(miolo, 'Repasse'), '').trim() === '' && /<Repasse\b/.test(miolo),
  '🔴 a7: o ramo `retornos` só renderiza <Repasse …/>',
  miolo.replace(elementoJsx(miolo, 'Repasse'), '').trim().slice(0, 80)
);
for (const [simbolo, re] of [
  ['ROTULO_EVENTO', /\bROTULO_EVENTO\b/],
  ['"Repasse para outros sistemas"', /Repasse para outros sistemas/],
  ['"Histórico do repasse"', /Histórico do repasse/],
  ['<table', /<table\b/],
]) {
  ok(!re.test(pagina) && re.test(repasse), `a8: ${simbolo} saiu da IntegrationsPage e está em Repasse.tsx`);
}
ok(!CHAMADA_DE_REDE.test(repasse), '🔴 a9: Repasse.tsx só desenha — nenhum fetch( nem pedir(');

/* ---------------- b. Regras: as duas chaves ---------------- */

console.log('\n  b. Regras dizem que são duas chaves; o rascunho (C5) fica');

ok(
  /Só sai sozinho quando as duas estão ligadas/.test(secaoRegras),
  '🔴 b1: RulesSection diz "Só sai sozinho quando as duas estão ligadas"'
);
ok(/\bregrasRascunho\b/.test(secaoRegrasCru), 'b2: RulesSection continua falando do regrasRascunho (C5)');
ok(
  /const\s*\[\s*regrasRascunho\s*,\s*setRegrasRascunho\s*\]\s*=\s*useState\b/.test(pagina),
  '🔴 b3: o regrasRascunho segue como estado próprio na IntegrationsPage (C5)'
);
ok(
  /Ligado/.test(secaoRegras) && /Desligado/.test(secaoRegras),
  'b4: a regra mostra o estado do Pixel em palavra (Ligado / Desligado)'
);

/* ---------------- c. Pixel: o estado em palavra ---------------- */

console.log('\n  c. O Pixel diz Ligado / Desligado junto do Switch');

const inicioSwitch = cartaoPixel.search(/<Switch\b/);
ok(inicioSwitch >= 0, 'c1: CardDePixel monta o <Switch>');
const fimSwitch = inicioSwitch >= 0 ? cartaoPixel.slice(inicioSwitch).search(/\n\s*\/>/) : -1;
const trechoSwitch =
  inicioSwitch >= 0
    ? cartaoPixel.slice(inicioSwitch, fimSwitch >= 0 ? inicioSwitch + fimSwitch : inicioSwitch + 4000)
    : '';
ok(
  /\bLigado\b/.test(trechoSwitch) && /\bDesligado\b/.test(trechoSwitch),
  '🔴 c2: CardDePixel tem "Ligado" e "Desligado" no próprio <Switch> (rodapé)'
);
ok(
  /'Ligado'/.test(interruptor) && /'Desligado'/.test(interruptor),
  'c3: ui/switch.tsx escreve "Ligado"/"Desligado" ao lado do controle (estado com cor E texto)'
);

/* ---------------- d. Configurações: só campos que existem ---------------- */

console.log('\n  d. O formulário da empresa só tem campos da Empresa');

ok(formularioCru.length > 0, 'd1: FormularioDeEmpresa.tsx existe');
for (const campo of ['moeda', 'paisTelefone', 'nomeDoProduto']) {
  ok(!new RegExp(`\\b${campo}\\b`, 'i').test(formularioCru), `🔴 d2: FormularioDeEmpresa não tem \`${campo}\``);
}

/* ---------------- e. Fontes: empresaId nos PUTs (C2) ---------------- */

console.log('\n  e. Fontes mandam empresaId em cada PUT (C2)');

const puts = argumentosDasChamadas(instalacao, 'pedir').filter((a) => /method:\s*'PUT'/.test(a));
ok(puts.length >= 2, 'e1: InstalacaoPage tem os PUTs de sempre', `${puts.length} PUT(s)`);
ok(
  puts.length > 0 && puts.every((a) => /body:\s*JSON\.stringify\(\{[\s\S]*\bempresaId\b[\s\S]*\}\)/.test(a)),
  '🔴 e2: todo PUT da InstalacaoPage leva empresaId no corpo'
);

const ambienteDoFilho = { ...process.env };
delete ambienteDoFilho.ACCESS_TOKEN;
delete ambienteDoFilho.PIXEL_ID;
const filho = spawnSync(
  process.execPath,
  [
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    '--import',
    './scripts/_resolver-ts.mjs',
    'scripts/empresa-abas.test.mjs',
  ],
  { cwd: RAIZ, env: ambienteDoFilho, encoding: 'utf8', timeout: 120_000 }
);
ok(
  filho.status === 0,
  '🔴 e3: scripts/empresa-abas.test.mjs passa',
  filho.status === 0 ? '' : `saída ${filho.status}: ${(filho.stdout + filho.stderr).split('\n').filter((l) => /FALHA|Error/.test(l)).slice(0, 5).join(' | ')}`
);

/* ---------------- f. Eventos: as 4 vistas ---------------- */

console.log('\n  f. Eventos têm o seletor das 4 vistas');

const ordem = ['Resumo', 'Compras', 'Fila', 'Envio manual'].map((rotulo) =>
  seletor.search(new RegExp(`rotulo:\\s*'${rotulo}'`))
);
ok(
  ordem.every((i) => i >= 0) && ordem.every((i, n) => n === 0 || i > ordem[n - 1]),
  '🔴 f1: SeletorDeVista tem as 4 vistas na ordem Resumo, Compras, Fila, Envio manual',
  JSON.stringify(ordem)
);
const valores = ['resumo', 'compras', 'fila', 'manual'].map((v) => seletor.search(new RegExp(`valor:\\s*'${v}'`)));
ok(
  valores.every((i, n) => i >= 0 && i < ordem[n] && (n === 0 || i > ordem[n - 1])),
  'f2: cada vista escreve o ?vista= que a página lê (resumo, compras, fila, manual)'
);
ok(/<TabsList\b[^>]*variant="line"/.test(seletor), 'f3: o seletor é um <TabsList variant="line">');
ok(/render=\{\s*<Link\b/.test(seletor), 'f4: cada vista é um link de verdade (render={<Link/>})');
ok(
  /import\s*\{[^}]*\bSeletorDeVista\b[^}]*\}\s*from\s*'@\/components\/eventos\/SeletorDeVista'/.test(paginaEventos) &&
    /<SeletorDeVista\b/.test(paginaEventos),
  '🔴 f5: a página de Eventos monta o SeletorDeVista'
);
const chamadas = argumentosDasChamadas(paginaEventos, 'comSeletor');
const ativas = chamadas.map((a) => a.match(/^\(\s*('(\w+)'|null)/)?.[1] ?? '?');
ok(
  ['manual', 'compras', 'fila', 'resumo'].every((v) => ativas.includes(`'${v}'`)) && ativas.includes('null'),
  'f6: o seletor aparece em todas as vistas (e em "quem mandou este evento", sem nenhuma marcada)',
  ativas.join(', ')
);
ok(
  (paginaEventos.match(/key=\{empresaId\}/g) ?? []).length >= 5,
  'f7: cada vista segue remontando por empresa (key={empresaId}, C2)'
);

/* ---------------- g. O cartão "Disparo manual" leva ao formulário ---------------- */

console.log('\n  g. "Disparo manual" leva ao envio manual da empresa');

ok(!/href:\s*['"]\/['"]/.test(explicacao), "🔴 g1: ExplicacaoDoDisparo não tem mais href: '/'");
ok(/eventos\?vista=manual/.test(explicacao), '🔴 g2: o destino do cartão manual contém eventos?vista=manual');
const elementosExplicacao = paginaRegras.match(/<ExplicacaoDoDisparo\b[^>]*\/>/g) ?? [];
ok(
  elementosExplicacao.length > 0 && elementosExplicacao.every((e) => /\bslug=\{/.test(e)),
  'g3: a aba Regras passa o slug da empresa ao ExplicacaoDoDisparo',
  `${elementosExplicacao.length} uso(s)`
);

/* ---------------- Fim ---------------- */

if (globalThis.fetch !== fetchFalso) {
  console.log('  FALHA  alguém trocou o fetch falso no meio do teste');
  falhas++;
}
ok(tentativas.length === 0, 'nenhuma chamada de rede', tentativas.join(', '));

console.log(
  falhas === 0
    ? '\n  Abas da empresa: Repasse extraído, as duas chaves ditas em palavra, formulário só com campos reais, empresaId nos PUTs e as 4 vistas de Eventos.'
    : `\n  ${falhas} falha(s).`
);
process.exit(falhas === 0 ? 0 : 1);
