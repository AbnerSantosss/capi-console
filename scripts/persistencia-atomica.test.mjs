#!/usr/bin/env node
/**
 * As travas da persistência em disco (PARTE 14, §14.0.1 B-1 e §14.0.2 B-2).
 *
 * Este arquivo existe por um motivo só, e ele vale dinheiro:
 *
 *   🔴 O SEGREDO DE ENTRADA NÃO PODE MUDAR SOZINHO.
 *
 * `config/integracoes.json` guarda o segredo que o xWinner usa para entregar
 * venda (`whsec_…`/UUID). O código antigo gravava com `fs.writeFile` direto e
 * lia com um `try/catch` que devolvia o padrão em QUALQUER falha. Um processo
 * morto no meio de uma gravação deixava o arquivo pela metade; na leitura
 * seguinte o `JSON.parse` falhava, caía no padrão — e o padrão GERA SEGREDO
 * NOVO. A partir dali o xWinner recebia 401, marcava a entrega como recusada e
 * parava de tentar. As vendas PIX paravam de entrar em silêncio, que é
 * exatamente o problema que este projeto inteiro existe para impedir.
 *
 * O que cada bloco prova:
 *
 *   C15  nenhuma escrita em config/*.json fora da porta atômica
 *   B1-a o `.bak` é o ESTADO ANTERIOR, não uma cópia do estado atual
 *   B1-c falha ao escrever o `.tmp` não encosta no arquivo original
 *   B1-d a troca é por `rename`, e não sobra `.tmp`
 *   D32  as quatro situações de leitura, e o segredo intacto nas quatro
 *   B1-e arquivo e `.bak` quebrados = 503 (modo degradado), NADA é gravado
 *   B1-f só a ausência das DUAS cópias gera configuração nova
 *   B1-g o único lugar do código que troca o segredo é `novoSegredoEntrada`
 *   C16  processo morto no meio da gravação: o arquivo nunca fica truncado
 *   B-2  duas gravações simultâneas: nenhuma se perde
 *
 * Roda num diretório temporário (nunca toca `config/` de verdade), sem rede e
 * sem disparar evento nenhum para a Meta.
 *
 * Uso: npm run test:persistencia
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.dirname(AQUI);
const RESOLVER = new URL('./_resolver-ts.mjs', import.meta.url).href;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-persist-'));
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raizAnterior = process.cwd();
// config-store.ts resolve `<cwd>/config` no import. A troca de diretório vem
// ANTES de qualquer import, senão o teste escreveria na configuração real.
process.chdir(tmp);

const ARQ = path.join(tmp, 'config', 'integracoes.json');
const BAK = ARQ + '.bak';
const TMPF = ARQ + '.tmp';
const ARQ_MARCAS = path.join(tmp, 'config', 'marcas.json');

const { gravarAtomico, ErroConfiguracaoIndisponivel } = await import(
  new URL('../src/lib/arquivo-atomico.ts', import.meta.url).href
);
const store = await import(new URL('../src/lib/config-store.ts', import.meta.url).href);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

/** null = não existe; undefined = existe e não faz parse; objeto = íntegro. */
const ler = (p) => {
  let txt;
  try {
    txt = fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(txt);
  } catch {
    return undefined;
  }
};

const limparConfig = () => {
  for (const p of [ARQ, BAK, TMPF, ARQ_MARCAS, ARQ_MARCAS + '.bak', ARQ_MARCAS + '.tmp']) {
    fs.rmSync(p, { force: true, recursive: true });
  }
};

console.log('\n  Persistência atômica de config/*.json (B-1, B-2)\n');

/* ================================================================== */
/* C15 — nenhuma escrita fora da porta atômica                         */
/* ================================================================== */
console.log('  -- C15: a única porta de escrita --');

const fonteStore = fs.readFileSync(path.join(RAIZ, 'src', 'lib', 'config-store.ts'), 'utf8');
const fonteAtomico = fs.readFileSync(path.join(RAIZ, 'src', 'lib', 'arquivo-atomico.ts'), 'utf8');

// A regressão que isto pega: alguém acrescenta um `fs.writeFile(ARQ, ...)` para
// "salvar rápido" e desfaz B-1 inteiro sem nenhum erro de compilação.
ok(
  !/fs\.writeFile\s*\(/.test(fonteStore) && !/writeFileSync\s*\(/.test(fonteStore),
  'config-store.ts não tem nenhum fs.writeFile/writeFileSync',
  'toda escrita passa por gravarAtomico'
);
ok(
  !/fs\.appendFile/.test(fonteStore) && !/createWriteStream/.test(fonteStore),
  'config-store.ts não abre stream nem append em config/*.json'
);
ok(
  (fonteStore.match(/gravarAtomico\s*\(/g) ?? []).length === 1,
  'só uma chamada de gravarAtomico em config-store.ts (dentro de gravarJson)'
);
ok(
  /await fs\.rename\(tmp, arquivo\)/.test(fonteAtomico) && /fh\.sync\(\)/.test(fonteAtomico),
  'gravarAtomico faz fsync antes do rename',
  'sem fsync o rename chega antes dos bytes'
);

// B1-g estático: o segredo de entrada só é escrito em UM lugar do código.
ok(
  (fonteStore.match(/entrada\.segredo\s*=/g) ?? []).length === 1,
  'B1-g: só uma atribuição a entrada.segredo em todo o config-store.ts',
  'e ela mora em novoSegredoEntrada()'
);
ok(
  /novoSegredoEntrada[\s\S]{0,400}entrada\.segredo = crypto\.randomUUID\(\)/.test(fonteStore),
  'B1-g: essa atribuição está dentro de novoSegredoEntrada()',
  'nenhum caminho de leitura ou de falha chega nela'
);

/* ================================================================== */
/* B1-a / B1-b / B1-d — o .bak é o estado anterior                     */
/* ================================================================== */
console.log('\n  -- B1-a/B1-d: o .bak guarda o estado ANTERIOR --');
limparConfig();

await gravarAtomico(ARQ, JSON.stringify({ v: 1 }));
ok(ler(ARQ)?.v === 1 && ler(BAK) === null, 'primeira gravação: arquivo criado e nenhum .bak');
ok(ler(TMPF) === null, 'B1-d: o .tmp não sobra depois do rename');

await gravarAtomico(ARQ, JSON.stringify({ v: 2 }));
ok(ler(ARQ)?.v === 2 && ler(BAK)?.v === 1, 'segunda gravação: .bak = versão 1, arquivo = versão 2');

await gravarAtomico(ARQ, JSON.stringify({ v: 3 }));
ok(ler(ARQ)?.v === 3 && ler(BAK)?.v === 2, 'terceira gravação: o .bak anda junto, sempre um passo atrás');

await gravarAtomico(ARQ, JSON.stringify({ v: 4 }), { backup: false });
ok(
  ler(ARQ)?.v === 4 && ler(BAK)?.v === 2,
  'backup:false grava sem tocar no .bak',
  'é o modo da restauração: não sobrescrever a única cópia boa'
);

/* ================================================================== */
/* B1-c — falha na escrita não encosta no original                     */
/* ================================================================== */
console.log('\n  -- B1-c: gravação que falha deixa o original intacto --');

// Um diretório no lugar do `.tmp` faz o `open(tmp, "w")` falhar. Simula disco
// cheio / permissão negada sem precisar de nenhum deles.
fs.mkdirSync(TMPF, { recursive: true });
let lancou = false;
try {
  await gravarAtomico(ARQ, JSON.stringify({ v: 99 }));
} catch {
  lancou = true;
}
fs.rmSync(TMPF, { recursive: true, force: true });
ok(lancou, 'a falha de escrita é propagada, não engolida');
ok(ler(ARQ)?.v === 4, 'B1-c: o arquivo original continua na versão anterior, inteiro');

/* ================================================================== */
/* 🔴 D32 — as quatro situações de leitura, e o segredo nas quatro      */
/* ================================================================== */
console.log('\n  -- 🔴 D32: o segredo de entrada não muda sozinho --');
limparConfig();

// 1) Primeira subida: as duas cópias ausentes. É o ÚNICO caso que gera segredo.
const primeira = await store.lerIntegracoes();
const SEGREDO = primeira.entrada.segredo;
const CHAVE_TAG = primeira.tag.chave;
ok(typeof SEGREDO === 'string' && SEGREDO.length > 10, 'B1-f: volume novo (nada em disco) gera a configuração padrão');

// 2) Boot repetido: nada muda.
let igual = true;
for (let i = 0; i < 5; i++) {
  const c = await store.lerIntegracoes();
  if (c.entrada.segredo !== SEGREDO || c.tag.chave !== CHAVE_TAG) igual = false;
}
ok(igual, '🔴 cinco leituras seguidas devolvem o MESMO segredo e a MESMA chave de tag');

// 3) Arquivo corrompido, `.bak` bom → restaura, mesmo segredo.
await store.atualizarIntegracoes((c) => {
  c.entrada.rotulo = 'estado-bom';
}); // garante um .bak íntegro
const bakBomAntes = fs.readFileSync(BAK, 'utf8');
fs.writeFileSync(ARQ, '{"entrada":{"segre', 'utf8'); // truncado, como num crash
const restaurada = await store.lerIntegracoes();
ok(
  restaurada.entrada.segredo === SEGREDO,
  '🔴 integracoes.json TRUNCADO: restaura do .bak e o segredo é o MESMO',
  'este é o defeito B1 original'
);
ok(ler(ARQ)?.entrada?.segredo === SEGREDO, 'o arquivo principal volta ao disco já íntegro');
ok(
  fs.readFileSync(BAK, 'utf8') === bakBomAntes,
  'a restauração NÃO copia o arquivo corrompido por cima do .bak bom'
);

// 4) Arquivo inválido de outro jeito: faz parse, mas não tem segredo dentro.
fs.writeFileSync(ARQ, JSON.stringify({ regras: [], saida: [] }), 'utf8');
const semSegredo = await store.lerIntegracoes();
ok(
  semSegredo.entrada.segredo === SEGREDO,
  '🔴 JSON válido porém SEM entrada.segredo também cai no .bak, sem gerar segredo novo'
);

// 5) Arquivo ausente e `.bak` presente: o arquivo já existiu, então nada de padrão.
fs.rmSync(ARQ, { force: true });
const soBak = await store.lerIntegracoes();
ok(
  soBak.entrada.segredo === SEGREDO,
  '🔴 arquivo apagado com .bak presente: restaura, não regenera',
  'ausência só conta quando as DUAS cópias sumiram'
);

/* ================================================================== */
/* B1-e — as duas quebradas: modo degradado, nada gravado              */
/* ================================================================== */
console.log('\n  -- B1-e: arquivo e .bak quebrados = 503, não segredo novo --');

fs.writeFileSync(ARQ, 'isto nao e json', 'utf8');
fs.writeFileSync(BAK, '{"entrada":{', 'utf8');
const arqAntes = fs.readFileSync(ARQ, 'utf8');
const bakAntes = fs.readFileSync(BAK, 'utf8');

let erroDegradado = null;
try {
  await store.lerIntegracoes();
} catch (e) {
  erroDegradado = e;
}
ok(
  erroDegradado instanceof ErroConfiguracaoIndisponivel,
  '🔴 as duas cópias ilegíveis lançam ErroConfiguracaoIndisponivel',
  'a rota traduz isso em 503, nunca em 401'
);
ok(
  fs.readFileSync(ARQ, 'utf8') === arqAntes && fs.readFileSync(BAK, 'utf8') === bakAntes,
  '🔴 NADA foi gravado no modo degradado — os dois arquivos estão byte a byte iguais',
  'nenhum segredo foi trocado'
);
ok(!fs.existsSync(TMPF), 'e nenhum .tmp foi deixado para trás');

const msg = String(erroDegradado?.message ?? '');
ok(
  msg.includes('config/integracoes.json'),
  'a mensagem diz QUAL arquivo restaurar',
  JSON.stringify(msg)
);
ok(
  !msg.includes(tmp) && !msg.includes('\\'),
  'a mensagem usa caminho relativo, não o caminho absoluto do container'
);
ok(!msg.includes(SEGREDO) && !msg.includes(CHAVE_TAG), 'regra 2: a mensagem não carrega segredo nem chave');

// E, com a configuração de volta, o segredo continua o de sempre.
fs.writeFileSync(BAK, bakBomAntes, 'utf8');
fs.rmSync(ARQ, { force: true });
ok((await store.lerIntegracoes()).entrada.segredo === SEGREDO, 'restaurado o .bak, o segredo volta a ser o mesmo');

/* ================================================================== */
/* B-2 — escrita concorrente                                           */
/* ================================================================== */
console.log('\n  -- B-2: duas gravações ao mesmo tempo, nenhuma se perde --');
limparConfig();

const base = await store.lerIntegracoes();
const SEGREDO2 = base.entrada.segredo;
const regrasAntes = base.regras.length;

// 40 saves simultâneos, cada um acrescentando uma regra própria. Sem a fila
// (read-modify-write serializado) o último a gravar apagaria os 39 anteriores.
await Promise.all(
  Array.from({ length: 40 }, (_, i) =>
    store.atualizarIntegracoes((c) => {
      c.regras.push({
        id: `concorrente-${i}`,
        eventoOrigem: `evento_concorrente_${i}`,
        eventoMeta: '',
        marcas: [],
        modo: 'ignorar',
        ativo: true,
      });
    })
  )
);

const depois = ler(ARQ);
const presentes = Array.from({ length: 40 }, (_, i) => `concorrente-${i}`).filter((id) =>
  depois.regras.some((r) => r.id === id)
);
ok(presentes.length === 40, 'B2-a: as 40 regras gravadas em paralelo estão TODAS no arquivo', `${presentes.length}/40`);
ok(depois.regras.length === regrasAntes + 40, 'nenhuma regra anterior foi apagada no caminho');
ok(depois.entrada.segredo === SEGREDO2, '🔴 40 gravações concorrentes e o segredo continua o mesmo');

// O caso real de produção: o contador de hits da Tag escrevendo ao mesmo tempo
// em que o operador salva uma regra. Antes, um apagava o outro (defeito B2).
await store.atualizarIntegracoes((c) => {
  c.tag.dominios = [{ id: 'd1', host: 'loja.com.br', criadoEm: new Date().toISOString(), hits: 0 }];
});
await Promise.all([
  ...Array.from({ length: 25 }, () =>
    store.atualizarIntegracoes((c) => {
      const d = c.tag.dominios.find((x) => x.id === 'd1');
      d.hits += 1;
    })
  ),
  store.atualizarIntegracoes((c) => {
    c.entrada.rotulo = 'salvo-pelo-operador';
  }),
]);
const misto = ler(ARQ);
ok(
  misto.tag.dominios[0].hits === 25,
  'B2-c: 25 incrementos de hit concorrentes somam 25 — nenhum leu valor velho',
  `hits=${misto.tag.dominios[0].hits}`
);
ok(
  misto.entrada.rotulo === 'salvo-pelo-operador',
  'e o save do operador, feito no meio deles, sobreviveu'
);

// marcas.json tem fila própria (B2-a: uma fila POR ARQUIVO).
await Promise.all(
  Array.from({ length: 30 }, (_, i) =>
    store.salvarMarca({ id: `pixel-${i}`, nome: `Pixel ${i}`, pixelId: `${100000 + i}` })
  )
);
const marcas = ler(ARQ_MARCAS) ?? [];
ok(marcas.length === 30, 'B2-a: 30 Pixels salvos em paralelo, todos no marcas.json', `${marcas.length}/30`);

/* ================================================================== */
/* C16 — processo morto no meio da gravação                            */
/* ================================================================== */
console.log('\n  -- C16: SIGKILL durante a gravação --');
limparConfig();

const CFG_BOA = {
  entrada: { segredo: SEGREDO, modo: 'fila', rotulo: 'xwinner-codigo-vencedor' },
  regras: [],
  saida: [],
  tag: { chave: CHAVE_TAG, dominios: [] },
};

// Filho que grava em laço, com carga grande o bastante para a morte cair no
// meio do `.tmp` de vez em quando. Fica no tmp: não é script de produção.
const FILHO = path.join(tmp, 'gravador-suicida.mjs');
fs.writeFileSync(
  FILHO,
  `
import path from 'node:path';
process.chdir(process.argv[2]);
const { gravarAtomico } = await import(${JSON.stringify(new URL('../src/lib/arquivo-atomico.ts', import.meta.url).href)});
const arq = path.join(process.argv[2], 'config', 'integracoes.json');
const base = ${JSON.stringify(CFG_BOA)};
for (let i = 0; ; i++) {
  await gravarAtomico(arq, JSON.stringify({ ...base, n: i, enchimento: 'x'.repeat(400000) }));
}
`,
  'utf8'
);

let mortesLimpas = 0;
// Quantas vezes o filho chegou a gravar antes de morrer. Se fosse zero, o teste
// estaria matando um processo que ainda nem abriu o arquivo — verde de mentira.
let mortesComGravacao = 0;
const TENTATIVAS = 8;
for (let i = 0; i < TENTATIVAS; i++) {
  limparConfig();
  fs.writeFileSync(ARQ, JSON.stringify(CFG_BOA), 'utf8');

  const filho = spawn(
    process.execPath,
    [
      '--conditions=react-server',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      RESOLVER,
      FILHO,
      tmp,
    ],
    { cwd: tmp, stdio: 'ignore' }
  );
  await new Promise((r) => setTimeout(r, 150 + i * 45));
  filho.kill('SIGKILL');
  await new Promise((r) => filho.on('exit', r));

  const principal = ler(ARQ);
  const backup = ler(BAK);
  const principalOk = principal !== null && principal !== undefined;
  const copiaOk = backup !== null && backup !== undefined;
  const segredoIntacto =
    (!principalOk || principal.entrada?.segredo === SEGREDO) &&
    (!copiaOk || backup.entrada?.segredo === SEGREDO);

  if (principalOk && typeof principal.n === 'number') mortesComGravacao++;
  if (principalOk && segredoIntacto) mortesLimpas++;
  else {
    ok(false, `morte #${i + 1}: arquivo ficou inutilizável`, `principal=${principalOk} bak=${copiaOk}`);
  }

  // E a prova que interessa: depois do crash, quem lê pelo caminho normal
  // recebe a configuração de sempre, com o segredo de sempre.
  const relida = await store.lerIntegracoes();
  if (relida.entrada.segredo !== SEGREDO) {
    ok(false, `morte #${i + 1}: 🔴 O SEGREDO MUDOU depois do crash`);
  }
}
ok(
  mortesLimpas === TENTATIVAS,
  `C16: ${TENTATIVAS} mortes por SIGKILL no meio da gravação, e o integracoes.json sempre fez parse`,
  `${mortesLimpas}/${TENTATIVAS}`
);
ok(
  mortesComGravacao > 0,
  'o filho realmente gravou antes de morrer (senão o bloco acima seria verde de mentira)',
  `${mortesComGravacao}/${TENTATIVAS} mortes pegaram o arquivo já reescrito`
);
ok(
  (await store.lerIntegracoes()).entrada.segredo === SEGREDO,
  '🔴 D32: depois de todas as mortes, o segredo de entrada é o original'
);

/* ================================================================== */

process.chdir(raizAnterior);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Persistência trancada: escrita atômica, backup, fila e o segredo intocado.\n'
    : `\n  ${falhas} falha(s).\n`
);
process.exit(falhas === 0 ? 0 : 1);
