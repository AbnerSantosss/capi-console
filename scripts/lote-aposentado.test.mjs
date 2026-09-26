#!/usr/bin/env node
/**
 * Disparo em lote aposentado (D14, D15, T5) — tarefa C11 do plano de
 * correções do pacote 16.
 *
 * O defeito: havia dois caminhos de "lote" que INVENTAVAM compra.
 *   - `scripts/processar-fila-cli.mjs --producao` lia um arquivo de entregas
 *     e mandava tudo direto para a Graph API, transformando status como
 *     `completed`/`approved` em `Purchase`.
 *   - `POST /api/fila-disparo` fazia o mesmo pelo servidor, via
 *     `src/lib/batch-processor.ts`, que caía em `Lead` quando não reconhecia o
 *     evento e nunca dava 404 de marca.
 * Nenhuma tela chamava a rota. Evento inventado estraga o aprendizado das
 * campanhas e fere a regra 1 do projeto (só eventos reais).
 *
 * O que este arquivo prova:
 *
 *   A  os dois arquivos saíram do repositório e o extrator do Chrome não
 *      ensina mais a rodar o script de lote. Os caminhos são ABSOLUTOS a partir
 *      deste arquivo (`new URL(..., import.meta.url)`): o teste faz `chdir`
 *      para uma pasta temporária, e um caminho relativo daria "não existe"
 *      antes e depois da correção, sem provar nada
 *   B  a rota não importa nada que envie (batch-processor, meta-capi, dedup,
 *      log de disparos, automático) e ninguém em src/ ou scripts/ importa o
 *      batch-processor de volta
 *   C  `POST /api/fila-disparo` com sessão responde 410 com a mensagem de
 *      aposentadoria, qualquer que seja o corpo (inclusive `dryRun: false` e
 *      corpo que nem é JSON); sem sessão continua 401
 *   R  nenhuma tentativa de rede e nenhum registro de disparo gravado
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/: ele anota a URL e LANÇA sempre — para a Graph API, para a
 * Cloudflare e para qualquer outro lugar. Sem ACCESS_TOKEN e sem PIXEL_ID, e
 * tudo roda numa pasta temporária: o `config/` e o `logs/` reais nunca são
 * lidos nem escritos.
 *
 * Roda SEM `--conditions=react-server`, como `rotas-api.test.mjs`: antes da
 * correção, carregar esta rota arrastava meta-capi → meta-events → ícones.
 *
 * Uso: npm run test:lote-aposentado
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

/** Só a URL de cada tentativa. Nada de corpo: ele levaria token. */
const chamadas = [];
const fetchFalso = async (entrada) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  chamadas.push(url);
  if (/graph\.facebook\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Meta');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Cloudflare');
  throw new Error('rede bloqueada pelo teste');
};
globalThis.fetch = fetchFalso;

/* Credenciais de mentira ANTES de carregar sessao.ts, que lê o ambiente no import. */
process.env.CONSOLE_USER = 'admin';
process.env.CONSOLE_PASSWORD = 'senha-super-segura-com-mais-de-12-chars';
process.env.SESSION_SECRET = 'segredo-de-sessao-muito-seguro-com-mais-de-32-caracteres-para-teste';
/* Nada do .env: nenhum token existe aqui, então nada teria como sair para a Meta. */
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-lote-aposentado-'));
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raizAnterior = process.cwd();
// config-store.ts, dedup.ts e attribution-log.ts resolvem `<cwd>/config` e
// `<cwd>/logs` no import: o `chdir` vem ANTES, senão o teste tocaria o real.
process.chdir(tmp);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

function encerrar(codigo) {
  process.chdir(raizAnterior);
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  process.exit(codigo);
}

function exigirFetchFalso() {
  if (globalThis.fetch !== fetchFalso) {
    console.log('  FALHA  🔴 o fetch falso saiu do lugar: a suíte para aqui, sem rede');
    encerrar(1);
  }
}

const lerTexto = (url) => {
  try {
    return fs.readFileSync(url, 'utf8');
  } catch {
    return null;
  }
};

/* ---------------- A. Os arquivos do lote saíram ---------------- */

console.log('\n  A. arquivos do lote');

const URL_CLI = new URL('./processar-fila-cli.mjs', import.meta.url);
const URL_BATCH = new URL('../src/lib/batch-processor.ts', import.meta.url);
const URL_EXTRATOR = new URL('./extrair-chrome-direto.mjs', import.meta.url);
const URL_ROTA = new URL('../src/app/api/fila-disparo/route.ts', import.meta.url);

ok(!fs.existsSync(URL_CLI), '🔴 A1: scripts/processar-fila-cli.mjs não existe mais', fileURLToPath(URL_CLI));
ok(!fs.existsSync(URL_BATCH), '🔴 A2: src/lib/batch-processor.ts não existe mais', fileURLToPath(URL_BATCH));

const extrator = lerTexto(URL_EXTRATOR);
ok(extrator !== null, 'A3: o extrator do Chrome continua existindo (só perdeu os comandos)');
ok(
  extrator !== null && !extrator.includes('processar-fila-cli'),
  '🔴 A4: o extrator não ensina mais a rodar processar-fila-cli'
);
ok(
  extrator !== null && !extrator.includes('--producao'),
  'A5: o extrator não imprime mais nenhum comando com --producao'
);
ok(
  extrator !== null && extrator.includes('Os disparos em lote foram aposentados em 23/09/2026'),
  'A6: o extrator avisa que o lote foi aposentado e aponta a caixa de entrada'
);

/* ---------------- B. Nada que envie fica ligado à rota ---------------- */

console.log('\n  B. imports');

const fonteRota = lerTexto(URL_ROTA);
ok(fonteRota !== null, 'B1: a rota /api/fila-disparo continua existindo (para responder 410)');
const importsDaRota = fonteRota
  ? [...fonteRota.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
  : [];
const proibidos = /(batch-processor|meta-capi|dedup|attribution-log|auto-dispatch|config-store)$/;
const importsProibidos = importsDaRota.filter((m) => proibidos.test(m));
ok(
  fonteRota !== null && importsProibidos.length === 0,
  '🔴 B2: a rota não importa batch-processor, meta-capi, dedup, log de disparos, automático nem config-store',
  importsProibidos.length ? `importa: ${importsProibidos.join(', ')}` : `imports: ${importsDaRota.join(', ')}`
);
ok(
  fonteRota !== null && !/enviarParaMeta|dispararFila|montarFilaDisparo/.test(fonteRota),
  'B3: a rota não chama enviarParaMeta, dispararFila nem montarFilaDisparo'
);

/** Varre src/ e scripts/ atrás de quem ainda cita o lote (menos este arquivo). */
function arquivosDe(dirUrl) {
  const raiz = fileURLToPath(dirUrl);
  const saida = [];
  const pilha = [raiz];
  while (pilha.length) {
    const atual = pilha.pop();
    for (const ent of fs.readdirSync(atual, { withFileTypes: true })) {
      const p = path.join(atual, ent.name);
      if (ent.isDirectory()) pilha.push(p);
      else if (/\.(m?[jt]sx?|mjs|cjs)$/.test(ent.name)) saida.push(p);
    }
  }
  return saida;
}
const esteArquivo = fileURLToPath(import.meta.url);
const citam = [
  ...arquivosDe(new URL('../src/', import.meta.url)),
  ...arquivosDe(new URL('./', import.meta.url)),
]
  .filter((p) => p !== esteArquivo)
  .filter((p) => /batch-processor|processar-fila-cli/.test(fs.readFileSync(p, 'utf8')))
  .map((p) => path.relative(fileURLToPath(new URL('../', import.meta.url)), p));
ok(
  citam.length === 0,
  '🔴 B4: nenhum arquivo de src/ ou scripts/ cita batch-processor nem processar-fila-cli',
  citam.length ? `citam: ${citam.join(', ')}` : ''
);

/* ---------------- C. A rota responde 410 ---------------- */

console.log('\n  C. POST /api/fila-disparo');

exigirFetchFalso();

const { NextRequest } = await import('next/server.js');
const { assinarSessao, COOKIE_SESSAO } = await import(
  new URL('../src/lib/sessao.ts', import.meta.url).href
);

let rota = null;
try {
  rota = await import(URL_ROTA.href);
} catch (err) {
  ok(false, 'C0: a rota carrega', String(err?.message ?? err).slice(0, 160));
}
exigirFetchFalso();

const COOKIE = `${COOKIE_SESSAO}=${assinarSessao('admin', 12)}`;
const MENSAGEM = 'O disparo em lote foi aposentado. Use a caixa de entrada do console.';

function req({ corpo, sessao = true } = {}) {
  const h = {};
  if (sessao) h.cookie = COOKIE;
  const init = { method: 'POST', headers: h };
  if (corpo !== undefined) {
    h['content-type'] = 'application/json';
    init.body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  }
  return new NextRequest('http://localhost:3333/api/fila-disparo', init);
}

async function chamar(opcoes) {
  if (!rota || typeof rota.POST !== 'function') return { status: -1, corpo: null, json: false };
  const res = await rota.POST(req(opcoes));
  const tipo = res.headers.get('content-type') ?? '';
  const txt = await res.text();
  let corpo;
  try {
    corpo = JSON.parse(txt);
  } catch {
    corpo = { __naoEhJson: txt.slice(0, 120) };
  }
  return { status: res.status, corpo, json: tipo.includes('application/json') };
}

{
  const r = await chamar({ corpo: { deliveries: [], brandId: 'default' }, sessao: false });
  ok(r.status === 401 && r.json, 'C1: sem sessão continua 401 (nada é revelado a quem não entrou)', `status=${r.status}`);
}
{
  const r = await chamar({ corpo: { deliveries: [], brandId: 'default' } });
  ok(r.status === 410, '🔴 C2: com sessão, corpo vazio (dryRun padrão) → 410', `status=${r.status}`);
  ok(r.json && r.corpo?.erro === MENSAGEM, 'C3: resposta JSON { erro } com a mensagem de aposentadoria', JSON.stringify(r.corpo).slice(0, 140));
}
{
  // Lista de entregas VAZIA de propósito: antes da correção este pedido ia até
  // o `dispararFila` de verdade, e nem com a rede trancada o teste deve montar
  // uma venda inventada. Vazia, a versão velha responde 200 com fila vazia (e o
  // caso falha, como tem que falhar); a nova responde 410 sem ler o corpo.
  const r = await chamar({ corpo: { deliveries: [], brandId: 'default', dryRun: false, delayMs: 0 } });
  ok(r.status === 410, '🔴 C4: com sessão e dryRun: false → 410, sem montar fila nem disparar', `status=${r.status}`);
}
{
  const r = await chamar({ corpo: '{isto não é json' });
  ok(r.status === 410 && r.json, 'C5: corpo que nem é JSON também → 410 (a rota não lê o corpo)', `status=${r.status}`);
}

exigirFetchFalso();

/* ---------------- R. Nada saiu, nada foi gravado ---------------- */

console.log('\n  R. rede e disco');

ok(chamadas.length === 0, '🔴 R1: nenhuma chamada a graph.facebook.com nem a api.cloudflare.com', `(${chamadas.length} tentativa(s) de rede no total)`);
const gravados = fs.readdirSync(path.join(tmp, 'logs'));
ok(
  !gravados.some((n) => /disparos/i.test(n)),
  'R2: nenhum registro de disparo gravado na pasta temporária',
  gravados.length ? `logs/: ${gravados.join(', ')}` : 'logs/ vazio'
);

console.log(
  falhas === 0
    ? '\n  Tudo certo. Lote aposentado: script e batch-processor fora, rota em 410, nada enviado.\n'
    : `\n  ${falhas} falha(s).\n`
);
encerrar(falhas === 0 ? 0 : 1);
