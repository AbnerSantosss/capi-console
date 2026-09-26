#!/usr/bin/env node
/**
 * Caixa de entrada que recomeça na troca de empresa (T2) — tarefa C4 do plano
 * de correções do pacote 16.
 *
 * O defeito: com a caixa de entrada aberta, trocar de empresa não zerava nada.
 * Os itens da empresa anterior ficavam na tela, o GET seguinte só mesclava por
 * cima deles, os Pixels escolhidos continuavam marcados e o SSE seguia aberto
 * na empresa anterior (ele resolve a empresa pelo cookie UMA vez, ao abrir, em
 * `src/app/api/webhook/stream/route.ts`). A venda de um cliente ficava na tela
 * de outro, a um clique de "Disparar direto".
 *
 * O que este arquivo prova, lendo o fonte (o projeto não tem jsdom nem
 * testing-library, e dependência nova está fora do pacote — decisão P8 do
 * plano):
 *
 *   A  as 3 montagens (Automático, tela inicial compacta e Painel) usam o MESMO
 *      componente, então a correção dentro dele vale para as três
 *   B  `InboxList` lê `empresaAtivaId` do store de empresa
 *   C  existe um `useEffect` com `empresaAtivaId` nas dependências que zera os
 *      itens, os ids vistos, os Pixels escolhidos e o diálogo de lote, põe a
 *      lista em "carregando", para o lote em andamento e incrementa
 *      `tentativa`
 *   D  esse efeito age só na TROCA, nunca na montagem (ref que nasce com a
 *      empresa atual)
 *   E  o incremento de `tentativa` reabre o SSE: o efeito que abre o
 *      `EventSource` tem `tentativa` nas dependências e refaz o GET
 *   F  um GET que saiu antes da troca e volta depois dela é descartado (senão
 *      mesclaria itens da empresa anterior na lista já zerada)
 *   G  nada de `router.refresh()` na caixa de entrada
 *
 * 🔴 Nenhuma rede e nenhum disco além da leitura dos fontes: este teste não
 * importa nada de `src/`, não chama `fetch` e não abre `config/` nem `logs/`.
 * Mesmo assim o `fetch` global é trocado por um que LANÇA — em especial para
 * graph.facebook.com e api.cloudflare.com —, para que um descuido futuro
 * falhe alto em vez de sair para a rede. Roda sem ACCESS_TOKEN.
 *
 * Uso: npm run test:inbox-troca-empresa
 */
import fs from 'node:fs';

/* ---------------- 0. Rede trancada ---------------- */

const fetchFalso = async (entrada) => {
  const url = typeof entrada === 'string' ? entrada : String(entrada?.url ?? entrada);
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

const ler = (relativo) => fs.readFileSync(new URL(relativo, import.meta.url), 'utf8');

/** Expressão que não casa com nada — nem com texto vazio (`/$^/` casaria). */
const NUNCA = /(?!)/;

/**
 * O fonte sem comentários de bloco (inclusive os `{/* … *\/}` do JSX) e sem as
 * linhas que são só comentário `//` — o mesmo corte de `empresa-abas.test.mjs`.
 * Os comentários do `InboxList` citam `router.refresh()` e `setItens` para
 * explicar; só o código conta.
 */
const semComentarios = (fonte) => fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const inboxBruto = ler('../src/components/integrations/InboxList.tsx');
const inbox = semComentarios(inboxBruto);

/* ---------------- A. As 3 montagens ---------------- */

console.log('\n  A. As 3 montagens usam o mesmo componente');

const importaInboxList =
  /import\s+(?:\{[^}]*\bInboxList\b[^}]*\}|InboxList)\s+from\s+['"](?:@\/components\/integrations\/InboxList|\.\/InboxList)['"]/;

for (const [rotulo, caminho, jsx] of [
  ['Automático (IntegrationsPage.tsx)', '../src/components/integrations/IntegrationsPage.tsx', /<InboxList\b/],
  ['tela inicial (event/SourceSection.tsx)', '../src/components/event/SourceSection.tsx', /<InboxList\s+compacto\b/],
  ['Painel (PainelDeEventos.tsx)', '../src/components/painel/PainelDeEventos.tsx', /<InboxList\b/],
]) {
  const fonte = semComentarios(ler(caminho));
  ok(importaInboxList.test(fonte), `${rotulo} importa InboxList de integrations/InboxList`);
  ok(jsx.test(fonte), `${rotulo} renderiza <InboxList>`);
}

/* ---------------- B. A empresa ativa ---------------- */

console.log('\n  B. A caixa de entrada sabe qual é a empresa ativa');

ok(
  /useEmpresaStore\(\s*\(\s*s\s*\)\s*=>\s*s\.empresaAtivaId\s*\)/.test(inbox),
  '🔴 InboxList lê empresaAtivaId do store de empresa'
);

/* ---------------- C/D. O efeito da troca ---------------- */

/**
 * Cada hook com array de dependências: nome do hook que abre, dependências e
 * corpo (do `useX(` até o `}, [deps])`). O hook é o ÚLTIMO `useEffect(` /
 * `useLayoutEffect(` / `useCallback(` / `useMemo(` antes do fechamento — os
 * corpos destes hooks não abrem outro hook dentro.
 */
function hooksComDependencias(fonte) {
  const achados = [];
  const re = /\}\s*,\s*\[([^\]]*)\]\s*\)/g;
  const abertura = /\b(useEffect|useLayoutEffect|useCallback|useMemo)\(/g;
  let m;
  while ((m = re.exec(fonte))) {
    let ultimo = null;
    abertura.lastIndex = 0;
    let a;
    while ((a = abertura.exec(fonte)) && a.index < m.index) ultimo = a;
    if (!ultimo) continue;
    achados.push({
      hook: ultimo[1],
      deps: m[1].split(',').map((d) => d.trim()).filter(Boolean),
      corpo: fonte.slice(ultimo.index, m.index + m[0].length),
    });
  }
  return achados;
}

const hooks = hooksComDependencias(inbox);

console.log('\n  C. Um efeito com empresaAtivaId nas dependências zera a caixa');

const daTroca = hooks.filter((h) => h.deps.includes('empresaAtivaId'));
const efeito = daTroca.find((h) => h.hook === 'useEffect');
ok(Boolean(efeito), '🔴 existe um useEffect com empresaAtivaId nas dependências', daTroca.map((h) => h.hook).join(',') || '(nenhum hook)');
const corpo = efeito?.corpo ?? '';

ok(/\bsetItens\(\s*\[\s*\]\s*\)/.test(corpo), '🔴 ele chama setItens([]) (a lista da empresa anterior sai da tela)');
ok(/\bvistos\.current\.clear\(\s*\)/.test(corpo), '🔴 ele chama vistos.current.clear() (os ids vistos são da empresa anterior)');
ok(/\bsetMarcasEscolhidas\(\s*\[\s*\]\s*\)/.test(corpo), '🔴 ele chama setMarcasEscolhidas([]) (Pixels escolhidos são da empresa anterior)');
ok(/\bsetLoteAberto\(\s*false\s*\)/.test(corpo), 'ele fecha o diálogo de lote (setLoteAberto(false))');
ok(/\bsetCarregando\(\s*true\s*\)/.test(corpo), 'ele põe a lista em "carregando" (setCarregando(true))');
ok(
  /\bsetTentativa\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\s*\+\s*1\s*\)/.test(corpo),
  '🔴 ele incrementa tentativa (setTentativa((t) => t + 1)), que reabre o SSE'
);
ok(/\bcancelarLote\.current\s*=\s*true\b/.test(corpo), 'ele para o lote em andamento (cancelarLote.current = true)');
ok(Boolean(efeito) && !/\brouter\b/.test(corpo), 'ele não usa o router');

console.log('\n  D. O efeito age só na troca, nunca na montagem');

const refDaEmpresa = inbox.match(/const\s+(\w+)\s*=\s*useRef(?:<[^>]*>)?\(\s*empresaAtivaId\s*\)/)?.[1] ?? '';
ok(Boolean(refDaEmpresa), '🔴 uma ref nasce com a empresa atual (useRef(empresaAtivaId))', refDaEmpresa || '(nenhuma)');
const guarda = refDaEmpresa
  ? new RegExp(`if\\s*\\(\\s*${refDaEmpresa}\\.current\\s*===\\s*empresaAtivaId\\s*\\)\\s*return\\b`)
  : NUNCA;
ok(guarda.test(corpo), '🔴 o efeito sai cedo quando a empresa é a mesma da ref (montagem e reexecução não zeram nada)');
const posGuarda = corpo.search(guarda);
const posZera = corpo.search(/\bsetItens\(\s*\[\s*\]\s*\)/);
ok(posGuarda !== -1 && posZera !== -1 && posGuarda < posZera, 'a guarda vem antes de qualquer setState');
ok(
  refDaEmpresa !== '' && new RegExp(`\\b${refDaEmpresa}\\.current\\s*=\\s*empresaAtivaId\\b`).test(corpo),
  'o efeito anota a empresa nova na ref'
);

/* ---------------- E. O SSE reabre ---------------- */

console.log('\n  E. O incremento de tentativa reabre o SSE e refaz o GET');

const doSse = hooks.find((h) => h.hook === 'useEffect' && h.corpo.includes("new EventSource('/api/webhook/stream')"));
ok(Boolean(doSse), 'o EventSource do SSE nasce dentro de um useEffect com dependências');
ok(Boolean(doSse?.deps.includes('tentativa')), '🔴 esse efeito tem tentativa nas dependências (fecha o canal velho e abre um novo)', doSse ? `[${doSse.deps.join(', ')}]` : '');
ok(Boolean(doSse && /\bfechar\(\s*\)/.test(doSse.corpo) && /return\s*\(\s*\)\s*=>\s*\{[\s\S]*ativo\s*=\s*false/.test(doSse.corpo)), 'a limpeza do efeito desliga o canal velho (ativo = false e fechar())');
ok(Boolean(doSse && /void\s+buscar\(\s*\)/.test(doSse.corpo)), 'o efeito do SSE refaz o GET (leitura de apoio)');

/* ---------------- F. Resposta atrasada ---------------- */

console.log('\n  F. GET da empresa anterior que volta depois da troca é descartado');

const iBuscar = inbox.search(/const\s+buscar\s*=\s*useCallback\(/);
const iAberturaBuscar = iBuscar === -1 ? -1 : inbox.indexOf('useCallback(', iBuscar);
const buscar = hooks.find((h) => h.hook === 'useCallback' && inbox.indexOf(h.corpo) === iAberturaBuscar);
const corpoBuscar = buscar?.corpo ?? '';
ok(Boolean(buscar), 'buscar é um useCallback com dependências');
const pedida = refDaEmpresa
  ? corpoBuscar.match(new RegExp(`const\\s+(\\w+)\\s*=\\s*${refDaEmpresa}\\.current`))?.[1] ?? ''
  : '';
ok(Boolean(pedida), '🔴 buscar anota para qual empresa a leitura saiu', pedida || '(nada)');
const descarte = pedida ? new RegExp(`${refDaEmpresa}\\.current\\s*!==\\s*${pedida}\\b[^;]*\\)\\s*return\\b`) : NUNCA;
const posDescarte = corpoBuscar.search(descarte);
const posMescla = corpoBuscar.search(/\bsetItens\(/);
ok(posDescarte !== -1 && posMescla !== -1 && posDescarte < posMescla, '🔴 buscar descarta a resposta antes de mesclar quando a empresa mudou');

/* ---------------- G. Sem refresh ---------------- */

console.log('\n  G. Nada de router.refresh() na caixa de entrada');

ok(!/router\.refresh\(/.test(inbox), 'InboxList não chama router.refresh()');
ok(!/\buseRouter\b/.test(inbox), 'InboxList não usa useRouter');

/* ---------------- Fim ---------------- */

if (globalThis.fetch !== fetchFalso) {
  console.log('  FALHA  alguém trocou o fetch falso no meio do teste');
  falhas++;
}

console.log(
  falhas === 0
    ? '\n  Caixa de entrada por empresa: na troca, zera itens, vistos e Pixels, para o lote, reabre o SSE e descarta resposta atrasada, nas 3 montagens.'
    : `\n  ${falhas} falha(s).`
);
process.exit(falhas === 0 ? 0 : 1);
