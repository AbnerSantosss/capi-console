#!/usr/bin/env node
/**
 * Telas que recomeçam por empresa (T1) e abas que se avisam (T6) — tarefa C2
 * do plano de correções do pacote 16.
 *
 * O defeito, no ar: `router.refresh()` relê a página de servidor mas NÃO
 * remonta o componente cliente, então o `useState(inicial...)` de Instalação e
 * de Automático continuava com os dados da empresa anterior depois da troca, e
 * o "Salvar" mandava esses dados para a empresa nova. Com duas abas era pior:
 * a aba 1 trocava a empresa e a aba 2 nem ficava sabendo.
 *
 * O que este arquivo prova:
 *
 *   A  (dinâmica) o store de empresa ouve o evento `storage` da chave do
 *      `persist`, no formato que o `persist` grava
 *      (`{"state":{"empresaAtivaId":"…"},"version":0}`), troca a empresa,
 *      reescreve o cookie, relê os Pixels e dispara `capi:empresa-trocada-fora`;
 *      ignora o eco da própria aba (R5), outra chave, JSON quebrado e formato
 *      errado; relê a lista quando a empresa nova ainda não está nela;
 *      com eventos ATRASADOS na fila (aba congelada que acorda), adota o valor
 *      gravado AGORA e nunca regrava um valor velho — regravar é o que fazia
 *      duas abas trocarem B↔C sem parar (revisão da C2, ressalva 1); uma
 *      leitura da lista que já estava em voo não reconduz para a padrão a
 *      empresa que outra aba acabou de criar (ressalva 5); com o store já na
 *      empresa da outra aba, o `pedir` manda o `X-Empresa-Id` explícito da
 *      tela, e não o do store (rodada 2, bloqueante 1)
 *   B  (dinâmica) `rascunhoSujo` + `marcarRascunho(sujo)` existem, mudam e NÃO
 *      vão para o `localStorage`
 *   C  (estática) as duas páginas de servidor passam `key={empresaId}` e
 *      `empresaId={empresaId}`; todo PUT das duas telas leva `empresaId` no
 *      corpo; TODA escrita de configuração de Instalação (PUT no corpo, POST
 *      de segredo e de chave da tag no header `X-Empresa-Id`) diz a empresa da
 *      tela (revisão da C2, bloqueante 1); TODO pedido das duas telas a
 *      `/api/integracoes` e `/api/relay`, LEITURA incluída, diz a empresa da
 *      tela — o `carregar()` relia pela empresa do store, que já tinha ido
 *      para a da outra aba, e punha os dados dela numa tela de `key` antiga
 *      (revisão da C2, rodada 2, bloqueante 1); as duas telas chamam
 *      `marcarRascunho`; o seletor ouve `capi:empresa-trocada-fora`, consulta
 *      `rascunhoSujo` e oferece "Recarregar agora"
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/: ele responde só `/api/empresas`, `/api/marcas` e a LEITURA de
 * `/api/integracoes` com dados de mentira (nenhuma escrita) e LANÇA para
 * qualquer outro endereço — inclusive graph.facebook.com
 * e api.cloudflare.com. Sem ACCESS_TOKEN e sem PIXEL_ID. Nada é gravado em
 * disco: o `localStorage` e o `document.cookie` são objetos em memória, e
 * nenhum módulo de `config/` ou `logs/` é carregado.
 *
 * Roda SEM `--conditions=react-server`: o store é código de navegador.
 *
 * Uso: npm run test:empresa-abas
 */
import fs from 'node:fs';

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

const AGORA = '2026-09-23T00:00:00.000Z';
/** A lista que o "servidor" devolve. Mutável: o caso A7 cria uma empresa "em outra aba". */
const empresasDoServidor = [
  { id: 'default', nome: 'Empresa Padrão (teste)', slug: 'padrao-teste', criadoEm: AGORA },
  { id: 'emp_a', nome: 'Empresa A', slug: 'empresa-a', criadoEm: AGORA },
  { id: 'emp_b', nome: 'Empresa B', slug: 'empresa-b', criadoEm: AGORA },
];

/** URL e header de empresa de cada tentativa. Nada de corpo. */
const chamadas = [];
/**
 * Portão de uma leitura só de `/api/empresas` (caso A7): a resposta leva a
 * lista como estava NA HORA do pedido e só sai quando o teste soltar.
 */
let portaoEmpresas = null;
const fetchFalso = async (entrada, init) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  let empresa = null;
  try {
    empresa = new Headers(init?.headers).get('X-Empresa-Id');
  } catch {
    /* header ilegível: fica null */
  }
  chamadas.push({ url, empresa });
  if (/graph\.facebook\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Meta');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Cloudflare');
  const json = (dados) =>
    new Response(JSON.stringify(dados), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  if (url === '/api/empresas') {
    const lista = [...empresasDoServidor];
    const portao = portaoEmpresas;
    portaoEmpresas = null;
    if (portao) await portao;
    return json({ empresas: lista, ativa: empresa ?? 'default' });
  }
  if (url === '/api/marcas') return json({ marcas: [] });
  // Só a LEITURA (caso A8): devolve de qual empresa o "servidor" leu, pelo header.
  if (url === '/api/integracoes' && String(init?.method ?? 'GET').toUpperCase() === 'GET') {
    return json({ integracoes: { lidaDe: empresa } });
  }
  throw new Error(`rede bloqueada pelo teste: ${url}`);
};
globalThis.fetch = fetchFalso;
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

/* ---------------- 1. Navegador de mentira: window, localStorage, document ---------------- */

const CHAVE = 'capi_empresa_ativa_v1';
const armazenamento = new Map();
/**
 * Toda escrita que ESTA aba fez (o `persist`), e se ela mudou o valor gravado.
 * Pela especificação, só a escrita que muda o valor chega às outras abas como
 * `storage`: é ela que, feita em reação a um `storage`, vira pingue-pongue.
 * As escritas "da outra aba" o teste faz direto no `armazenamento`.
 */
const escritasDaAba = [];
const localStorageFalso = {
  getItem: (k) => (armazenamento.has(k) ? armazenamento.get(k) : null),
  setItem: (k, v) => {
    const valor = String(v);
    escritasDaAba.push({ k, v: valor, mudou: armazenamento.get(k) !== valor });
    armazenamento.set(k, valor);
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
// Esta aba abriu na empresa A: é o que o `persist` teria deixado gravado.
armazenamento.set(CHAVE, JSON.stringify({ state: { empresaAtivaId: 'emp_a' }, version: 0 }));

const janela = new EventTarget();
janela.location = { protocol: 'http:', pathname: '/automatico', origin: 'http://localhost:3333' };
janela.localStorage = localStorageFalso;

const cookiesEscritos = [];
const documentoFalso = {
  set cookie(valor) {
    cookiesEscritos.push(String(valor));
  },
  get cookie() {
    return cookiesEscritos.at(-1) ?? '';
  },
};

globalThis.window = janela;
globalThis.document = documentoFalso;
globalThis.localStorage = localStorageFalso;

/** O que a aba ouviu de `capi:empresa-trocada-fora`. */
const trocasFora = [];
janela.addEventListener('capi:empresa-trocada-fora', (e) => trocasFora.push(e.detail ?? null));

/* ---------------- 2. Imports de src/, depois da rede trancada ---------------- */

const modStore = await import(new URL('../src/stores/useEmpresaStore.ts', import.meta.url).href);
const { useEmpresaStore } = modStore;

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

/** Um `storage` como o navegador entrega às OUTRAS abas. */
function eventoStorage(key, newValue, oldValue = null) {
  return Object.assign(new Event('storage'), {
    key,
    newValue,
    oldValue,
    storageArea: localStorageFalso,
    url: 'http://localhost:3333/instalacao',
  });
}
const noFormatoDoPersist = (id) => JSON.stringify({ state: { empresaAtivaId: id }, version: 0 });

/**
 * A OUTRA aba grava a chave (ou apaga, com `null`) no `localStorage`
 * compartilhado e devolve o `storage` que o navegador entregaria a esta. Como
 * no navegador, quando o evento chega o valor já está gravado.
 */
function outraAbaGrava(key, valor) {
  const anterior = armazenamento.has(key) ? armazenamento.get(key) : null;
  if (valor === null) armazenamento.delete(key);
  else armazenamento.set(key, valor);
  return eventoStorage(key, valor, anterior);
}

/* ---------------- A. O ouvinte de `storage` ---------------- */

console.log('\n  A. Outra aba trocou a empresa');

ok(modStore.CHAVE_EMPRESA_ATIVA === CHAVE, 'A0: a chave do persist é a que o teste simula', String(modStore.CHAVE_EMPRESA_ATIVA));
ok(
  modStore.EVENTO_EMPRESA_TROCADA_FORA === 'capi:empresa-trocada-fora',
  'A0: o nome do evento de janela é exportado e é "capi:empresa-trocada-fora"',
  String(modStore.EVENTO_EMPRESA_TROCADA_FORA)
);
ok(useEmpresaStore.getState().empresaAtivaId === 'emp_a', 'A1: o store nasce na empresa gravada (emp_a)', useEmpresaStore.getState().empresaAtivaId);

await useEmpresaStore.getState().carregar();
ok(useEmpresaStore.getState().empresas.length === 3, 'A1: a lista de empresas foi lida', String(useEmpresaStore.getState().empresas.length));

const antesDosControles = { cookies: cookiesEscritos.length, chamadas: chamadas.length };

// R5: o `persist` da PRÓPRIA aba também escreve a chave; o eco chega igual ao atual.
janela.dispatchEvent(eventoStorage(CHAVE, noFormatoDoPersist('emp_a'), noFormatoDoPersist('emp_a')));
janela.dispatchEvent(outraAbaGrava('outra_chave', noFormatoDoPersist('emp_b')));
janela.dispatchEvent(outraAbaGrava(CHAVE, '{isto não é json'));
janela.dispatchEvent(outraAbaGrava(CHAVE, JSON.stringify({ empresaAtivaId: 'emp_b' })));
janela.dispatchEvent(outraAbaGrava(CHAVE, null));
janela.dispatchEvent(eventoStorage(null, null));
await assentar();
// Os casos seguintes partem de "as duas abas em emp_a", como no navegador.
armazenamento.set(CHAVE, noFormatoDoPersist('emp_a'));
armazenamento.delete('outra_chave');

ok(useEmpresaStore.getState().empresaAtivaId === 'emp_a', 'A2: eco igual, outra chave, JSON quebrado, formato errado e chave apagada não mudam nada', useEmpresaStore.getState().empresaAtivaId);
ok(trocasFora.length === 0, 'A2: nenhum aviso de troca foi disparado', String(trocasFora.length));
ok(cookiesEscritos.length === antesDosControles.cookies, 'A2: nenhum cookie reescrito');
ok(chamadas.length === antesDosControles.chamadas, 'A2: nenhuma leitura de rede');

// A troca de verdade, no formato do `persist`.
const chamadasAntesDaTroca = chamadas.length;
janela.dispatchEvent(outraAbaGrava(CHAVE, noFormatoDoPersist('emp_b')));
ok(useEmpresaStore.getState().empresaAtivaId === 'emp_b', '🔴 A3: o store passou para a empresa da outra aba (emp_b)', useEmpresaStore.getState().empresaAtivaId);
ok(
  cookiesEscritos.some((c) => c.startsWith('capi_empresa=emp_b;')),
  'A3: o cookie capi_empresa foi reescrito para emp_b',
  cookiesEscritos.at(-1) ?? '(nenhum)'
);
ok(trocasFora.length === 1, '🔴 A3: capi:empresa-trocada-fora disparado uma vez', String(trocasFora.length));
ok(trocasFora[0]?.id === 'emp_b', 'A3: o aviso diz para qual empresa', JSON.stringify(trocasFora[0] ?? null));
ok(trocasFora[0]?.anterior === 'emp_a', 'A3: e de qual empresa a aba saiu', JSON.stringify(trocasFora[0] ?? null));
await assentar();
const depoisDaTroca = chamadas.slice(chamadasAntesDaTroca);
ok(
  depoisDaTroca.some((c) => c.url === '/api/marcas' && c.empresa === 'emp_b'),
  'A3: os Pixels foram relidos já com X-Empresa-Id: emp_b',
  JSON.stringify(depoisDaTroca)
);

// O `persist` desta aba regrava a chave com emp_b; o eco que volta é ignorado.
janela.dispatchEvent(eventoStorage(CHAVE, noFormatoDoPersist('emp_b'), noFormatoDoPersist('emp_a')));
await assentar();
ok(trocasFora.length === 1, 'A4: o eco da própria troca não dispara um segundo aviso', String(trocasFora.length));

// Empresa criada em outra aba: ainda não está na lista desta.
empresasDoServidor.push({ id: 'emp_c', nome: 'Empresa C', slug: 'empresa-c', criadoEm: AGORA });
const chamadasAntesDaC = chamadas.length;
janela.dispatchEvent(outraAbaGrava(CHAVE, noFormatoDoPersist('emp_c')));
await assentar();
const depoisDaC = chamadas.slice(chamadasAntesDaC);
ok(useEmpresaStore.getState().empresaAtivaId === 'emp_c', 'A5: empresa nova vinda de outra aba vira a ativa (emp_c)', useEmpresaStore.getState().empresaAtivaId);
ok(depoisDaC.some((c) => c.url === '/api/empresas'), 'A5: a lista foi relida, porque emp_c não estava nela', JSON.stringify(depoisDaC));
ok(
  useEmpresaStore.getState().empresas.some((e) => e.id === 'emp_c'),
  'A5: e agora a lista tem emp_c, então o cabeçalho mostra o nome certo'
);
ok(trocasFora.length === 2 && trocasFora[1]?.id === 'emp_c', 'A5: o aviso de troca saiu para emp_c', JSON.stringify(trocasFora));

// A6 — eventos ATRASADOS (revisão da C2, ressalva 1). Esta aba estava
// congelada (fundo, economia de energia) enquanto a outra ia emp_c → emp_a →
// emp_b. Ela acorda com os dois `storage` na fila, e o gravado já é emp_b.
// Seguir o `newValue` de cada evento regravava emp_a e depois emp_b, cada
// escrita virava um `storage` na outra aba, e as duas trocavam sem parar.
const avisosAntesDaFila = trocasFora.length;
const escritasAntesDaFila = escritasDaAba.length;
const filaAtrasada = [
  outraAbaGrava(CHAVE, noFormatoDoPersist('emp_a')),
  outraAbaGrava(CHAVE, noFormatoDoPersist('emp_b')),
];
janela.dispatchEvent(filaAtrasada[0]);
ok(
  useEmpresaStore.getState().empresaAtivaId === 'emp_b',
  '🔴 A6: o evento atrasado (emp_a) leva ao valor gravado AGORA (emp_b), não ao valor do evento',
  useEmpresaStore.getState().empresaAtivaId
);
ok(
  armazenamento.get(CHAVE) === noFormatoDoPersist('emp_b'),
  '🔴 A6: a aba não regravou o valor velho no localStorage',
  armazenamento.get(CHAVE)
);
janela.dispatchEvent(filaAtrasada[1]);
await assentar();
const escritasDaFila = escritasDaAba.slice(escritasAntesDaFila).filter((e) => e.k === CHAVE);
ok(
  escritasDaFila.every((e) => !e.mudou),
  '🔴 A6: nenhuma escrita desta aba mudou o valor gravado (nada volta para a outra aba: sem pingue-pongue)',
  JSON.stringify(escritasDaFila)
);
const avisosDaFila = trocasFora.slice(avisosAntesDaFila);
ok(
  avisosDaFila.length === 1 && avisosDaFila[0]?.id === 'emp_b' && avisosDaFila[0]?.anterior === 'emp_c',
  'A6: um aviso só para a fila inteira, de emp_c para emp_b',
  JSON.stringify(avisosDaFila)
);

// A7 — leitura da lista já em voo (revisão da C2, ressalva 5). Esta aba começa
// a reler a lista; antes de a resposta chegar, a outra aba cria emp_d e troca
// para ela. A resposta em voo é ANTERIOR a emp_d. Aplicar a regra D-4 nela
// reconduzia esta aba para a padrão, e o `persist` levava todas as abas junto,
// sem ninguém ter pedido.
let soltarLista = () => {};
portaoEmpresas = new Promise((r) => {
  soltarLista = r;
});
const chamadasAntesDaD = chamadas.length;
const leituraEmVoo = useEmpresaStore.getState().carregar();
empresasDoServidor.push({ id: 'emp_d', nome: 'Empresa D', slug: 'empresa-d', criadoEm: AGORA });
janela.dispatchEvent(outraAbaGrava(CHAVE, noFormatoDoPersist('emp_d')));
soltarLista();
await leituraEmVoo;
await assentar();
const depoisDaD = chamadas.slice(chamadasAntesDaD);
ok(
  useEmpresaStore.getState().empresaAtivaId === 'emp_d',
  '🔴 A7: a leitura que já estava em voo não reconduziu para a padrão (fica emp_d)',
  useEmpresaStore.getState().empresaAtivaId
);
ok(
  armazenamento.get(CHAVE) === noFormatoDoPersist('emp_d'),
  '🔴 A7: o localStorage continua em emp_d (as outras abas não vão para a padrão)',
  armazenamento.get(CHAVE)
);
ok(
  (cookiesEscritos.at(-1) ?? '').startsWith('capi_empresa=emp_d;'),
  'A7: o cookie termina em emp_d',
  cookiesEscritos.at(-1) ?? '(nenhum)'
);
ok(
  depoisDaD.filter((c) => c.url === '/api/empresas').length >= 2,
  'A7: a lista foi relida depois da resposta velha',
  JSON.stringify(depoisDaD)
);
ok(
  useEmpresaStore.getState().empresas.some((e) => e.id === 'emp_d'),
  'A7: e agora a lista tem emp_d, então o cabeçalho mostra o nome certo'
);

// A8 — a premissa da correção da rodada 2 (bloqueante 1): o store desta aba já
// foi para a empresa da outra (emp_d), e a tela aberta ainda é de emp_a. A
// leitura da tela manda o header dela, e o `pedir` tem de respeitá-lo em vez
// de pôr o do store. O controle mostra o defeito: sem header, vai o do store.
const { pedir } = await import(new URL('../src/lib/cliente-api.ts', import.meta.url).href);
const lidaPelaTela = await pedir('/api/integracoes', { cache: 'no-store', headers: { 'X-Empresa-Id': 'emp_a' } });
ok(
  useEmpresaStore.getState().empresaAtivaId === 'emp_d' && chamadas.at(-1)?.empresa === 'emp_a' && lidaPelaTela?.integracoes?.lidaDe === 'emp_a',
  '🔴 A8: com o store em emp_d, a leitura com o header da tela (emp_a) vai com emp_a',
  JSON.stringify({ store: useEmpresaStore.getState().empresaAtivaId, enviado: chamadas.at(-1)?.empresa, lida: lidaPelaTela?.integracoes?.lidaDe })
);
const lidaPeloStore = await pedir('/api/integracoes', { cache: 'no-store' });
ok(
  chamadas.at(-1)?.empresa === 'emp_d' && lidaPeloStore?.integracoes?.lidaDe === 'emp_d',
  'A8: controle — sem header explícito, a leitura vai com a empresa do store (era o defeito das telas)',
  JSON.stringify({ enviado: chamadas.at(-1)?.empresa, lida: lidaPeloStore?.integracoes?.lidaDe })
);

/* ---------------- B. Rascunho ---------------- */

console.log('\n  B. Rascunho da tela');

const estado = useEmpresaStore.getState();
ok(estado.rascunhoSujo === false, '🔴 B1: rascunhoSujo existe e nasce false', String(estado.rascunhoSujo));
ok(typeof estado.marcarRascunho === 'function', '🔴 B1: marcarRascunho existe');
if (typeof estado.marcarRascunho === 'function') {
  estado.marcarRascunho(true);
  ok(useEmpresaStore.getState().rascunhoSujo === true, 'B2: marcarRascunho(true) → true');
  const gravado = localStorageFalso.getItem(CHAVE) ?? '';
  ok(!gravado.includes('rascunhoSujo'), 'B2: rascunhoSujo NÃO vai para o localStorage', gravado);
  ok(gravado.includes('"empresaAtivaId"'), 'B2: a escolha da empresa continua gravada', gravado);
  useEmpresaStore.getState().marcarRascunho(false);
  ok(useEmpresaStore.getState().rascunhoSujo === false, 'B3: marcarRascunho(false) → false');
}

ok(
  !chamadas.some((c) => /graph\.facebook\.com|api\.cloudflare\.com/i.test(c.url)),
  '🔴 nenhuma tentativa de ir à Meta ou à Cloudflare',
  `chamadas=${chamadas.length}`
);

/* ---------------- C. O fonte das telas ---------------- */

console.log('\n  C. As telas (leitura do fonte)');

const ler = (relativo) => fs.readFileSync(new URL(relativo, import.meta.url), 'utf8');
// V2 (v7): as telas de Instalação e Disparo automático moram em
// `/e/<slug>/fontes` e `/e/<slug>/regras`; `/instalacao` e `/automatico`
// ficaram só como reserva de redirecionamento.
const paginaInstalacao = ler('../src/app/(console)/e/[slug]/fontes/page.tsx');
const paginaAutomatico = ler('../src/app/(console)/e/[slug]/regras/page.tsx');
const telaInstalacao = ler('../src/components/instalacao/InstalacaoPage.tsx');
const telaAutomatico = ler('../src/components/integrations/IntegrationsPage.tsx');
// V3 (v7): o ouvinte de C4 saiu do seletor e mora na lateral de empresas.
const seletor = ler('../src/components/layout/LateralDeEmpresas.tsx');

/** O elemento JSX `<Nome …/>` inteiro, do `<` ao `/>`. */
const elementoJsx = (fonte, nome) => fonte.match(new RegExp(`<${nome}\\b[\\s\\S]*?\\/>`))?.[0] ?? '';

for (const [rotulo, fonte, componente] of [
  ['e/[slug]/fontes/page.tsx', paginaInstalacao, 'InstalacaoPage'],
  ['e/[slug]/regras/page.tsx', paginaAutomatico, 'IntegrationsPage'],
]) {
  const el = elementoJsx(fonte, componente);
  ok(el.includes('key={empresaId}'), `🔴 C1: ${rotulo} renderiza <${componente} key={empresaId}>`);
  ok(el.includes('empresaId={empresaId}'), `C1: ${rotulo} passa empresaId={empresaId}`);
  // V2: a empresa vem do ENDEREÇO (`empresaDosParams`), nunca do cookie.
  ok(
    /empresaDosParams\(/.test(fonte) && /\bempresaId\s*=\s*empresa\.id\b/.test(fonte),
    `C1: ${rotulo} tira empresaId da empresa do endereço (empresaDosParams)`
  );
  ok(!/empresaDaPagina/.test(fonte), `🔴 C1: ${rotulo} não lê a empresa pelo cookie (empresaDaPagina)`);
}

/** A linha `body:` de cada `method: 'PUT'`. */
function corposDePut(fonte) {
  const corpos = [];
  let i = fonte.indexOf("method: 'PUT'");
  while (i !== -1) {
    const b = fonte.indexOf('body:', i);
    corpos.push(b === -1 ? '' : fonte.slice(b, fonte.indexOf('\n', b)));
    i = fonte.indexOf("method: 'PUT'", i + 1);
  }
  return corpos;
}

for (const [rotulo, fonte, minimo] of [
  ['InstalacaoPage.tsx', telaInstalacao, 2],
  ['IntegrationsPage.tsx', telaAutomatico, 1],
]) {
  const corpos = corposDePut(fonte);
  ok(corpos.length >= minimo, `C2: ${rotulo} tem ${minimo} PUT(s) ou mais`, String(corpos.length));
  ok(
    corpos.length > 0 && corpos.every((c) => /\bempresaId\b/.test(c)),
    `🔴 C2: todo PUT de ${rotulo} leva empresaId no corpo`,
    JSON.stringify(corpos.map((c) => c.trim()))
  );
  ok(/\bempresaId:\s*string\b/.test(fonte), `C2: ${rotulo} recebe a prop empresaId: string`);
  ok(/marcarRascunho\(/.test(fonte), `C3: ${rotulo} chama marcarRascunho`);
}

/**
 * O fonte sem comentários de bloco (inclusive os `{/* … *\/}` do JSX) e sem as
 * linhas que são só comentário `//`. Os `//` depois de código ficam: cortá-los
 * cortaria também o `http://` das strings.
 */
const semComentarios = (fonte) => fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Cada `pedir('<url>', …)` do fonte: a URL, o método e o objeto de opções
 * inteiro (do `{` ao `}` que o fecha, contando chaves). Sem objeto de opções,
 * é um GET com `opcoes` vazio — portanto sem a empresa da tela. `chamadas` conta
 * TODO `pedir(`, com URL literal ou não: uma URL em variável escaparia da
 * conferência, então o teste exige que as duas contas batam.
 */
function pedidosDePedir(fonteBruta) {
  const fonte = semComentarios(fonteBruta);
  const achados = [];
  const re = /\bpedir(?:<[^>]*>)?\(\s*(['"`])(.*?)\1\s*(,\s*\{)?/g;
  let m;
  while ((m = re.exec(fonte))) {
    let opcoes = '';
    if (m[3]) {
      const inicio = m.index + m[0].length - 1;
      let fundo = 0;
      let fim = inicio;
      for (; fim < fonte.length; fim++) {
        if (fonte[fim] === '{') fundo++;
        else if (fonte[fim] === '}' && --fundo === 0) break;
      }
      opcoes = fonte.slice(inicio, fim + 1);
    }
    const metodo = (opcoes.match(/\bmethod:\s*'(\w+)'/)?.[1] ?? 'GET').toUpperCase();
    achados.push({ url: m[2], metodo, opcoes });
  }
  const chamadas = (fonte.match(/\bpedir(?:<[^>]*>)?\(/g) ?? []).length;
  return { achados, chamadas };
}
/** Cada `pedir` cujo `method:` não é GET. */
const escritasDePedir = (fonte) => pedidosDePedir(fonte).achados.filter((p) => p.metodo !== 'GET');

/** A empresa da tela vai no header (`'X-Empresa-Id': empresaId`, a prop). */
const comHeaderDaTela = (op) => /'X-Empresa-Id':\s*empresaId\b/.test(op);

// Revisão da C2, bloqueante 1: o PUT diz a empresa no corpo, mas os 2 POSTs
// de Instalação (girar o segredo do webhook, girar a chave da tag) não têm
// corpo de configuração. Sem o header da tela, a aba com rascunho, cujo store
// já foi para a empresa da outra aba, girava a credencial da empresa NOVA.
const escritasInstalacao = escritasDePedir(telaInstalacao);
const deConfig = escritasInstalacao.filter((e) => e.url === '/api/integracoes');
const porSegredo = escritasInstalacao.filter((e) => e.url.startsWith('/api/webhook/in'));
const outrasEscritas = escritasInstalacao.filter((e) => !deConfig.includes(e) && !porSegredo.includes(e));
const comEmpresaDaTela = (op) =>
  /body:\s*JSON\.stringify\(\{[^\n]*\bempresaId\b/.test(op) || comHeaderDaTela(op);
const resumoEscritas = (lista) => JSON.stringify(lista.map((e) => `${e.metodo} ${e.url}`));
ok(
  deConfig.filter((e) => e.metodo === 'PUT').length >= 2 && deConfig.filter((e) => e.metodo === 'POST').length >= 2,
  'C2: Instalação tem 2 PUTs e 2 POSTs em /api/integracoes',
  resumoEscritas(deConfig)
);
ok(
  deConfig.length > 0 && deConfig.every((e) => comEmpresaDaTela(e.opcoes)),
  '🔴 C2: toda escrita de Instalação em /api/integracoes diz a empresa da tela (empresaId no corpo ou X-Empresa-Id: empresaId)',
  resumoEscritas(deConfig.filter((e) => !comEmpresaDaTela(e.opcoes)))
);
ok(
  deConfig.filter((e) => e.metodo === 'POST').every((e) => /'X-Empresa-Id':\s*empresaId\b/.test(e.opcoes)),
  '🔴 C2: os POSTs de segredo e de chave da tag levam X-Empresa-Id: empresaId (a prop da tela)',
  resumoEscritas(deConfig.filter((e) => e.metodo === 'POST'))
);
ok(
  porSegredo.every((e) => /'X-CAPI-Secret'/.test(e.opcoes)),
  'C2: a simulação do webhook escolhe a empresa pelo segredo da tela (X-CAPI-Secret), não pela empresa ativa',
  resumoEscritas(porSegredo)
);
ok(outrasEscritas.length === 0, 'C2: Instalação não tem outra escrita sem a empresa da tela', resumoEscritas(outrasEscritas));

// Revisão da C2, rodada 2, bloqueante 1: LER também tem de dizer a empresa da
// tela. Outra aba troca para B com rascunho aberto aqui; o store desta aba vai
// para B e a tela segue de `key` A. Um "Atualizar", o `carregar()` do erro de
// salvar, o do "Testar destino" ou o do "Simular" relia pelo header do store
// (B) e punha a config de B nesta instância. Quando a empresa voltava para A,
// a `key` era a mesma, nada remontava, e o PUT seguinte gravava
// `{...config de B, empresaId: 'A'}` no arquivo de A — com header e cookie A,
// o servidor aceitava. Com o header da tela, a instância de `key` A só lê A.
for (const [rotulo, fonte, minimos] of [
  ['InstalacaoPage.tsx', telaInstalacao, { GET: 1, PUT: 2, POST: 2 }],
  ['IntegrationsPage.tsx', telaAutomatico, { GET: 2, PUT: 1, POST: 1 }],
]) {
  const { achados, chamadas: totalDePedir } = pedidosDePedir(fonte);
  ok(
    achados.length === totalDePedir,
    `C2: toda chamada de pedir em ${rotulo} usa URL literal (o teste confere cada uma)`,
    `${achados.length} de ${totalDePedir}`
  );
  const daEmpresa = achados.filter((p) => /^\/api\/(integracoes|relay)(?:[?#]|$)/.test(p.url));
  const porMetodo = daEmpresa.reduce((acc, p) => ({ ...acc, [p.metodo]: (acc[p.metodo] ?? 0) + 1 }), {});
  ok(
    Object.entries(minimos).every(([metodo, n]) => (porMetodo[metodo] ?? 0) >= n),
    `C2: ${rotulo} tem os pedidos esperados a /api/integracoes e /api/relay`,
    `${JSON.stringify(porMetodo)} (mínimo ${JSON.stringify(minimos)})`
  );
  const leituras = daEmpresa.filter((p) => p.metodo === 'GET');
  ok(
    leituras.length > 0 && leituras.every((p) => comHeaderDaTela(p.opcoes)),
    `🔴 C2: toda LEITURA de ${rotulo} em /api/integracoes e /api/relay manda X-Empresa-Id: empresaId (a tela de key A só relê A)`,
    resumoEscritas(leituras.filter((p) => !comHeaderDaTela(p.opcoes)))
  );
  const semEmpresa = daEmpresa.filter((p) => (p.metodo === 'GET' ? !comHeaderDaTela(p.opcoes) : !comEmpresaDaTela(p.opcoes)));
  ok(
    daEmpresa.length > 0 && semEmpresa.length === 0,
    `🔴 C2: todo pedido de ${rotulo} a /api/integracoes e /api/relay diz a empresa da tela`,
    resumoEscritas(semEmpresa)
  );
}
const pingDoDestino = escritasDePedir(telaAutomatico).filter((p) => p.url === '/api/relay' && p.metodo === 'POST');
ok(
  pingDoDestino.length > 0 && pingDoDestino.every((p) => comHeaderDaTela(p.opcoes)),
  '🔴 C2: o "Testar destino" pinga o destino da empresa da tela (POST /api/relay com X-Empresa-Id: empresaId)',
  resumoEscritas(pingDoDestino)
);

ok(
  seletor.includes('EVENTO_EMPRESA_TROCADA_FORA') || seletor.includes("'capi:empresa-trocada-fora'"),
  '🔴 C4: LateralDeEmpresas ouve capi:empresa-trocada-fora'
);
ok(/addEventListener\(\s*(EVENTO_EMPRESA_TROCADA_FORA|'capi:empresa-trocada-fora')/.test(seletor), 'C4: com addEventListener na janela');
ok(seletor.includes('rascunhoSujo'), '🔴 C4: o ouvinte consulta rascunhoSujo');
ok(seletor.includes('Recarregar agora'), '🔴 C4: com rascunho, oferece "Recarregar agora" em vez de recarregar sozinho');
ok(seletor.includes('Empresa trocada em outra aba'), 'C4: sem rascunho, avisa que a troca veio de outra aba');

/* ---------------- Fim ---------------- */

console.log(
  falhas === 0
    ? '\n  Abas sincronizadas: store ouve o persist sem pingue-pongue, telas remontam por empresa e todo pedido das telas, leitura ou escrita, diz de qual empresa são os dados.'
    : `\n  ${falhas} falha(s).`
);
process.exit(falhas === 0 ? 0 : 1);
