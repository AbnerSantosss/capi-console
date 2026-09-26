#!/usr/bin/env node
/**
 * Regras relidas na hora de ligar o automático (T3) — tarefa C6 do plano de
 * correções do pacote 16.
 *
 * O defeito: o store de regras de `src/hooks/useEstadoAutomatico.ts` lia
 * `GET /api/integracoes` UMA vez por sessão de navegação
 * (`if (get().carregando || get().carregado) return;`). O diálogo "Ligar o
 * disparo automático" de /pixels montava a frase "Hoje nenhuma regra está no
 * modo automático, então nada será enviado ainda" com essa leitura velha: o
 * operador criava uma regra automática em Automático, voltava a /pixels, e o
 * diálogo seguia dizendo que nada sairia — no exato clique que liga o envio de
 * conversão real. Trocar de empresa também não relia: as regras da empresa
 * anterior ficavam no store e contavam para os Pixels da nova.
 *
 * O que este arquivo prova:
 *
 *   A  (dinâmica) `carregar()` usa o cache (uma leitura); `recarregar()`
 *      ignora o cache e traz o que o servidor tem AGORA
 *   B  (dinâmica) `recarregar()` respeita a leitura em voo: não abre uma
 *      segunda e só termina quando ela termina
 *   C  (dinâmica) leitura que falha deixa as regras em `null` ("não sei"),
 *      nunca as velhas — e `recarregar()` não rejeita
 *   D  (dinâmica) trocar de empresa zera as regras e relê já com o
 *      `X-Empresa-Id` da empresa nova; resposta da empresa anterior que chega
 *      depois da troca é jogada fora; outras mudanças do store de empresa
 *      (rascunho, mesma empresa) não relêem
 *   E  (estática) `PixelsPanel`: abrir a confirmação de ligar chama
 *      `recarregar`; enquanto confere, o diálogo diz "Conferindo as regras…"
 *      em vez de afirmar "nenhuma regra", e o botão de ligar espera; trocar
 *      de empresa fecha as confirmações abertas (o Pixel delas é da empresa
 *      anterior)
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/: ele responde só a LEITURA de `/api/integracoes` (e, por
 * segurança, `/api/empresas` e `/api/marcas`) com dados de mentira, recusa
 * qualquer escrita e LANÇA para qualquer outro endereço — inclusive
 * graph.facebook.com e api.cloudflare.com. Sem ACCESS_TOKEN e sem PIXEL_ID.
 * Nada é gravado em disco: `localStorage` e `document.cookie` são objetos em
 * memória, e nenhum módulo de `config/` ou `logs/` é carregado.
 *
 * Roda SEM `--conditions=react-server`: o hook e os stores são código de
 * navegador (importam React e zustand), como `test:empresa-abas`.
 *
 * Uso: npm run test:estado-automatico
 */
import fs from 'node:fs';

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

const regra = (id, eventoMeta, marcas, modo = 'auto', ativo = true) => ({
  id,
  eventoOrigem: `origem_${id}`,
  eventoMeta,
  marcas,
  modo,
  ativo,
});

/**
 * O que o "servidor" tem gravado, por empresa. Mutável: é assim que o teste
 * simula o operador salvando regras em outra tela.
 */
const servidor = {
  emp_a: [regra('a1', 'Purchase', ['px_a']), regra('a2', 'Lead', ['px_a'], 'fila')],
  emp_b: [regra('b1', 'Purchase', ['px_b']), regra('b2', 'Subscribe', ['px_b'])],
  emp_c: [regra('c1', 'Lead', ['px_c'])],
};

/** URL, método e header de empresa de cada tentativa. Nada de corpo. */
const chamadas = [];
/** Portão da PRÓXIMA leitura de `/api/integracoes` (casos B e D). */
let portaoProxima = null;
/** A próxima leitura de `/api/integracoes` responde 500 (caso C). */
let falharProxima = false;

const fetchFalso = async (entrada, init) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  const metodo = String(init?.method ?? 'GET').toUpperCase();
  let empresa = null;
  try {
    empresa = new Headers(init?.headers).get('X-Empresa-Id');
  } catch {
    /* header ilegível: fica null */
  }
  chamadas.push({ url, metodo, empresa });
  if (/graph\.facebook\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Meta');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Cloudflare');
  if (metodo !== 'GET') throw new Error(`teste só aceita leitura (tentou ${metodo} ${url})`);
  const json = (dados, status = 200) =>
    new Response(JSON.stringify(dados), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  if (url === '/api/integracoes') {
    // A resposta é o que estava gravado NA HORA do pedido, como num servidor
    // de verdade: mexer em `servidor` depois não muda uma leitura em voo.
    const regras = structuredClone(servidor[empresa] ?? []);
    const falhar = falharProxima;
    falharProxima = false;
    const portao = portaoProxima;
    portaoProxima = null;
    if (portao) await portao;
    if (falhar) return json({ erro: 'falha simulada pelo teste' }, 500);
    return json({ integracoes: { regras } });
  }
  if (url === '/api/empresas') return json({ empresas: [], ativa: empresa ?? 'default' });
  if (url === '/api/marcas') return json({ marcas: [] });
  throw new Error(`rede bloqueada pelo teste: ${url}`);
};
globalThis.fetch = fetchFalso;
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

/** Segura a próxima leitura de regras até o teste soltar. */
function segurarProxima() {
  let soltar;
  portaoProxima = new Promise((r) => {
    soltar = r;
  });
  return soltar;
}

/* ---------------- 1. Navegador de mentira: window, localStorage, document ---------------- */

const armazenamento = new Map();
const localStorageFalso = {
  getItem: (k) => (armazenamento.has(k) ? armazenamento.get(k) : null),
  setItem: (k, v) => {
    armazenamento.set(k, String(v));
  },
  removeItem: (k) => {
    armazenamento.delete(k);
  },
  clear: () => armazenamento.clear(),
  key: (i) => [...armazenamento.keys()][i] ?? null,
  get length() {
    return armazenamento.size;
  },
};
// A aba abriu na empresa A: é o que o `persist` do store de empresa teria gravado.
armazenamento.set('capi_empresa_ativa_v1', JSON.stringify({ state: { empresaAtivaId: 'emp_a' }, version: 0 }));

const janela = new EventTarget();
janela.location = { protocol: 'http:', pathname: '/pixels', origin: 'http://localhost:3333' };
janela.localStorage = localStorageFalso;

const cookiesEscritos = [];
globalThis.window = janela;
globalThis.document = {
  set cookie(valor) {
    cookiesEscritos.push(String(valor));
  },
  get cookie() {
    return cookiesEscritos.at(-1) ?? '';
  },
};
globalThis.localStorage = localStorageFalso;

/* ---------------- 2. Imports de src/, depois da rede trancada ---------------- */

const modHook = await import(new URL('../src/hooks/useEstadoAutomatico.ts', import.meta.url).href);
const { useEmpresaStore } = await import(new URL('../src/stores/useEmpresaStore.ts', import.meta.url).href);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

if (globalThis.fetch !== fetchFalso) {
  console.log('  FALHA  algum import trocou o fetch falso; o teste para aqui');
  process.exit(1);
}

/** Espera as promessas soltas (`void carregar()`) terminarem. */
const assentar = () => new Promise((r) => setTimeout(r, 30));
/** Só as leituras de regras. */
const leituras = () => chamadas.filter((c) => c.url === '/api/integracoes');
/** Os ids das regras no store, ou `null` quando ele diz "não sei". */
const ids = (regras) => (Array.isArray(regras) ? regras.map((r) => r.id).join(',') : regras);

/* ---------------- A. Cache e recarregar ---------------- */

console.log('\n  A. carregar() usa o cache; recarregar() lê de novo');

const api = modHook.regrasDeRoteamento;
const temApi =
  api !== null &&
  typeof api === 'object' &&
  typeof api.carregar === 'function' &&
  typeof api.recarregar === 'function' &&
  typeof api.agora === 'function';
ok(temApi, '🔴 A1: o hook expõe carregar, recarregar e agora (regrasDeRoteamento)');
ok(typeof modHook.useRecarregarRegras === 'function', '🔴 A2: o hook exporta useRecarregarRegras() para as telas');
ok(leituras().length === 0, 'A3: importar o hook não lê nada sozinho', `(${leituras().length} leitura(s))`);

if (!temApi) {
  console.log('\n  (sem recarregar() não há como seguir com B, C e D: contam como falha)');
  falhas += 4;
} else {
  await api.carregar();
  ok(ids(api.agora().regras) === 'a1,a2', 'A4: a primeira leitura traz as regras da empresa A', `(${ids(api.agora().regras)})`);
  ok(leituras().length === 1 && leituras()[0].empresa === 'emp_a', 'A5: uma leitura, com X-Empresa-Id da empresa A');
  ok(api.agora().regrasAuto === 1, 'A6: regrasAuto conta só as regras ativas em auto', `(${api.agora().regrasAuto})`);

  // O operador salva uma regra automática nova em Automático (outra tela).
  servidor.emp_a = [regra('a1', 'Purchase', ['px_a']), regra('a3', 'Lead', ['px_a'])];
  await api.carregar();
  ok(ids(api.agora().regras) === 'a1,a2', 'A7: carregar() de novo NÃO relê (é o cache de sessão)', `(${ids(api.agora().regras)})`);
  ok(leituras().length === 1, 'A8: nenhuma leitura nova no carregar() com cache');

  await api.recarregar();
  ok(ids(api.agora().regras) === 'a1,a3', '🔴 A9: recarregar() traz o que o servidor tem agora', `(${ids(api.agora().regras)})`);
  ok(leituras().length === 2 && leituras()[1].empresa === 'emp_a', 'A10: recarregar() fez uma leitura, com X-Empresa-Id da empresa A');
  ok(api.agora().regrasAuto === 2, 'A11: regrasAuto acompanha a releitura (o selo do cabeçalho também)', `(${api.agora().regrasAuto})`);
  ok(api.agora().carregado && !api.agora().carregando, 'A12: depois de recarregar, carregado e não carregando');

  /* ---------------- B. Leitura em voo ---------------- */

  console.log('\n  B. recarregar() respeita a leitura em voo');

  servidor.emp_a = [regra('a4', 'Purchase', ['px_a'])];
  const soltarB = segurarProxima();
  const antesB = leituras().length;
  let p1Terminou = false;
  let p2Terminou = false;
  const p1 = api.recarregar().then(() => {
    p1Terminou = true;
  });
  ok(api.agora().carregando, 'B1: com a leitura em voo, o store diz carregando');
  const p2 = api.recarregar().then(() => {
    p2Terminou = true;
  });
  await assentar();
  ok(leituras().length === antesB + 1, '🔴 B2: um segundo recarregar() com leitura em voo não abre outra', `(${leituras().length - antesB} leitura(s))`);
  ok(!p1Terminou && !p2Terminou, '🔴 B3: nenhum dos dois termina antes de a leitura voltar (quem espera, espera dado novo)');
  soltarB();
  await Promise.all([p1, p2]);
  ok(ids(api.agora().regras) === 'a4', 'B4: quando a leitura volta, os dois veem as regras novas', `(${ids(api.agora().regras)})`);
  ok(!api.agora().carregando, 'B5: e o carregando desliga');

  /* ---------------- C. Falha ---------------- */

  console.log('\n  C. leitura que falha deixa "não sei", nunca as regras velhas');

  falharProxima = true;
  let rejeitou = false;
  try {
    await api.recarregar();
  } catch {
    rejeitou = true;
  }
  ok(!rejeitou, 'C1: recarregar() não rejeita quando o servidor falha (quem chama só espera)');
  ok(api.agora().regras === null, '🔴 C2: na falha, regras = null ("não sei"), não as da leitura anterior', `(${ids(api.agora().regras)})`);
  ok(api.agora().carregado && !api.agora().carregando, 'C3: e a leitura conta como feita (o menu não fica girando)');
  await api.recarregar();
  ok(ids(api.agora().regras) === 'a4', 'C4: a próxima releitura que dá certo volta a dizer as regras', `(${ids(api.agora().regras)})`);

  /* ---------------- D. Troca de empresa ---------------- */

  console.log('\n  D. trocar de empresa zera e relê as regras');

  const antesD1 = leituras().length;
  useEmpresaStore.setState({ empresaAtivaId: 'emp_b' });
  ok(api.agora().regras === null, '🔴 D1: na hora da troca, as regras da empresa anterior saem do store', `(${ids(api.agora().regras)})`);
  ok(api.agora().regrasAuto === 0 && !api.agora().carregado, 'D2: regrasAuto zera e carregado volta a falso (o selo não mostra número velho)');
  await assentar();
  const novasD1 = leituras().slice(antesD1);
  ok(novasD1.length === 1 && novasD1[0].empresa === 'emp_b', '🔴 D3: a troca relê sozinha, com X-Empresa-Id da empresa nova', `(${JSON.stringify(novasD1.map((c) => c.empresa))})`);
  ok(ids(api.agora().regras) === 'b1,b2' && api.agora().regrasAuto === 2, 'D4: o store passa a ter as regras da empresa nova', `(${ids(api.agora().regras)})`);

  const antesD5 = leituras().length;
  useEmpresaStore.getState().marcarRascunho(true);
  useEmpresaStore.getState().marcarRascunho(false);
  useEmpresaStore.setState({ empresaAtivaId: 'emp_b' });
  await assentar();
  ok(leituras().length === antesD5, 'D5: rascunho e "trocar" para a mesma empresa não relêem', `(${leituras().length - antesD5} leitura(s))`);
  ok(ids(api.agora().regras) === 'b1,b2', 'D6: e as regras continuam lá');

  // Resposta da empresa anterior chegando DEPOIS da troca.
  const soltarD = segurarProxima();
  const antesD7 = leituras().length;
  useEmpresaStore.setState({ empresaAtivaId: 'emp_a' });
  ok(api.agora().carregando, 'D7: a leitura da empresa A está em voo');
  useEmpresaStore.setState({ empresaAtivaId: 'emp_c' });
  await assentar();
  const novasD7 = leituras().slice(antesD7);
  ok(
    novasD7.length === 2 && novasD7[0].empresa === 'emp_a' && novasD7[1].empresa === 'emp_c',
    '🔴 D8: a segunda troca não espera a leitura velha: abre a da empresa C',
    `(${JSON.stringify(novasD7.map((c) => c.empresa))})`
  );
  ok(ids(api.agora().regras) === 'c1' && !api.agora().carregando, 'D9: o store mostra as regras da empresa C', `(${ids(api.agora().regras)})`);
  soltarD();
  await assentar();
  ok(ids(api.agora().regras) === 'c1', '🔴 D10: a resposta da empresa A, que chegou depois, é jogada fora', `(${ids(api.agora().regras)})`);
  ok(!api.agora().carregando && api.agora().carregado, 'D11: e não mexe no carregando/carregado da empresa C');

  const antesD12 = leituras().length;
  await api.recarregar();
  const novasD12 = leituras().slice(antesD12);
  ok(novasD12.length === 1 && novasD12[0].empresa === 'emp_c', 'D12: recarregar() depois da troca lê a empresa atual', `(${JSON.stringify(novasD12.map((c) => c.empresa))})`);
}

ok(
  leituras().every((c) => c.metodo === 'GET'),
  'D13: o store só LÊ regras (nenhum PUT/POST em /api/integracoes)'
);
ok(
  chamadas.every((c) => !/graph\.facebook\.com|api\.cloudflare\.com/i.test(c.url)),
  'D14: nenhuma chamada a graph.facebook.com nem a api.cloudflare.com'
);

/* ---------------- E. PixelsPanel ---------------- */

console.log('\n  E. a confirmação de ligar relê as regras ao abrir (estático)');

const painel = fs.readFileSync(new URL('../src/components/pixels/PixelsPanel.tsx', import.meta.url), 'utf8');

/**
 * O corpo `{ … }` da primeira função `const nome = (…) => {` ou
 * `function nome(…) {` do arquivo. Casa chaves; ignora as que estão em
 * string simples. Devolve '' quando não acha.
 */
function corpoDaFuncao(texto, nome) {
  const re = new RegExp(`(?:const\\s+${nome}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)[^=]*=>\\s*|function\\s+${nome}\\s*\\([^)]*\\)[^{]*)\\{`);
  const m = re.exec(texto);
  if (!m) return '';
  let i = m.index + m[0].length;
  let nivel = 1;
  let aspas = null;
  for (; i < texto.length && nivel > 0; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '\\') i++;
      else if (c === aspas) aspas = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') aspas = c;
    else if (c === '{') nivel++;
    else if (c === '}') nivel--;
  }
  return texto.slice(m.index, i);
}

ok(
  /import\s*\{[^}]*\buseRecarregarRegras\b[^}]*\}\s*from\s*'@\/hooks\/useEstadoAutomatico'/.test(painel),
  '🔴 E1: PixelsPanel importa useRecarregarRegras do hook'
);

// Quem abre a confirmação de ligar é quem faz `setALigar(marca)`.
const abreLigar = [...painel.matchAll(/const\s+(\w+)\s*=\s*(?:async\s*)?\(/g)]
  .map((m) => corpoDaFuncao(painel, m[1]))
  .find((corpo) => /\bsetALigar\(\s*marca\s*\)/.test(corpo));
ok(Boolean(abreLigar), 'E2: existe a função que abre a confirmação de ligar (setALigar(marca))');
ok(
  Boolean(abreLigar) && /\brecarregar\w*\(/.test(abreLigar) && /\bsetConferindo\(\s*true\s*\)/.test(abreLigar),
  '🔴 E3: abrir a confirmação de ligar chama recarregar e marca "conferindo" no mesmo clique'
);
ok(
  Boolean(abreLigar) && /\bsetConferindo\(\s*false\s*\)/.test(abreLigar),
  'E4: "conferindo" desliga quando a releitura termina'
);

// A frase do diálogo: o primeiro ramo da cadeia é "conferindo".
const cadeia = painel.slice(painel.indexOf('let oQueVaiAcontecer'));
const primeiroIf = /if\s*\(([^)]*)\)/.exec(cadeia);
ok(
  primeiroIf !== null && /\bconferindo\b/.test(primeiroIf[1]),
  '🔴 E5: enquanto confere, a frase NÃO chega a "nenhuma regra" (o primeiro ramo é conferindo)',
  primeiroIf ? `(if (${primeiroIf[1].trim()}))` : ''
);
ok(/Conferindo as regras…/.test(painel), '🔴 E6: o diálogo diz "Conferindo as regras…"');

// O `<AlertDialogAction>` do diálogo de LIGAR: o último que abre antes da
// chamada `aplicarAuto(aLigar, true)` (o primeiro do arquivo é o de apagar).
const posLigar = painel.search(/aplicarAuto\(aLigar,\s*true\)/);
const inicioAcao = posLigar >= 0 ? painel.lastIndexOf('<AlertDialogAction', posLigar) : -1;
const fimAcao = posLigar >= 0 ? painel.indexOf('</AlertDialogAction>', posLigar) : -1;
const acaoLigar = inicioAcao >= 0 && fimAcao >= 0 ? painel.slice(inicioAcao, fimAcao) : '';
ok(
  /disabled=\{[^}]*\bconferindo\b[^}]*\}/.test(acaoLigar),
  '🔴 E7: o botão de ligar espera a leitura (disabled enquanto conferindo)'
);
const cliqueLigar = /onClick=\{\(\)\s*=>\s*\{([\s\S]*?)\}\}/.exec(acaoLigar)?.[1] ?? '';
ok(
  /\bconferindo\b/.test(cliqueLigar),
  'E8: e o clique também confere (Enter no botão desabilitado não liga)'
);

ok(
  /useEmpresaStore\(\s*\(s\)\s*=>\s*s\.empresaAtivaId\s*\)/.test(painel),
  'E9: o painel acompanha a empresa ativa'
);
const efeitoTroca = [...painel.matchAll(/React\.useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[([^\]]*)\]\);/g)].find((m) =>
  /\bempresaAtivaId\b/.test(m[1])
)?.[0] ?? '';
ok(
  /\bsetALigar\(\s*null\s*\)/.test(efeitoTroca) && /\bsetAApagar\(\s*null\s*\)/.test(efeitoTroca),
  '🔴 E10: trocar de empresa fecha as confirmações abertas (o Pixel delas é da empresa anterior)'
);

/* ---------------- Fim ---------------- */

if (globalThis.fetch !== fetchFalso) {
  console.log('  FALHA  alguém trocou o fetch falso no meio do teste');
  falhas++;
}

console.log(
  falhas === 0
    ? '\n  Regras do automático: recarregar() ignora o cache, a troca de empresa relê, e a confirmação de ligar confere antes de afirmar.'
    : `\n  ${falhas} falha(s).`
);
process.exit(falhas === 0 ? 0 : 1);
