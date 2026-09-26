#!/usr/bin/env node
/**
 * A trava do Pixel — disparo automático por Pixel (PARTE 9, FASE 6).
 *
 * Este arquivo existe por um motivo só, e ele custa dinheiro se quebrar:
 *
 *   🔴 NENHUM EVENTO SAI SOZINHO SEM ALGUÉM TER LIGADO O SWITCH DAQUELE PIXEL.
 *
 * Há 16 regras em `fila` e 34 em `ignorar` numa produção que NUNCA disparou
 * automaticamente. Se qualquer leitura de `autoDisparo` usar `!!x`, `x ?? true`
 * ou `x !== false`, o campo ausente vira "ligado" e o primeiro boot manda
 * conversão real para o pixel de produção sem aprovação humana. Evento enviado
 * à Meta não volta, e contamina o aprendizado da campanha — exatamente o dano
 * que a regra 1 do CLAUDE.md existe para impedir.
 *
 * O que cada bloco prova (numeração da §9.10 do blueprint):
 *
 *   T1   marca sem `autoDisparo` + regra `auto`   -> fila, `auto-do-pixel-desligado`
 *   T3   marca ligada + regra `fila`              -> fila, `regra-em-fila`
 *   T4   regra `ignorar`                          -> o pixel nem é consultado
 *   T5   evento sem regra                         -> fallback `fila` preservado
 *   T6   marca ligada + token vazio               -> fila, `sem-token`, sem rede
 *   T8   marca vinda do `.env`, sem marcas.json   -> `autoDisparo: false`
 *   T9   item antigo do inbox (só `modo` escalar) -> lê e exibe sem quebrar
 *   T10  duas marcas, uma ligada e outra desligada, mesma regra `auto`
 *        -> uma em `auto`, a outra em `fila`  (a parte OFFLINE do T10; o
 *           fechamento ponta a ponta com a Meta exige autorização do dono)
 *   C10  sonda do "Testar" numa regra com um Pixel em teste e outro em
 *        produção -> só o Pixel com código de teste entra na decisão da
 *        sonda; o de produção fica fora de `modoPorMarca`, `motivoFila` e
 *        `marcasAuto` (D2 do pacote de correção)
 *   C26  nenhuma leitura de `autoDisparo` fora de `=== true`
 *   C28  `publicarMarca` normaliza o campo para booleano de verdade
 *   MIG-4 o repositório não embarca marca nenhuma (`config/` é gitignored),
 *         e o estado local do operador é apenas relatado — ver a seção
 *
 * Roda num diretório temporário (nunca toca `config/` nem `logs/` de verdade),
 * sem rede e sem disparar evento nenhum para a Meta. O `fetch` global é trocado
 * por um falso antes de qualquer import de src/: ele lança sempre, e o fim da
 * suíte reprova se alguém tiver chamado.
 *
 * Uso: npm run test:auto-pixel
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.dirname(AQUI);

/* ---------------- Rede trancada, antes de qualquer import de src/ ---------------- */
// Esta suíte só decide, não dispara: nada aqui deveria nem TENTAR sair. Se algo
// tentar, o fetch falso anota a URL (só a URL, nada do corpo) e LANÇA — em
// graph.facebook.com, em api.cloudflare.com e em qualquer outra — e o fim da
// suíte reprova. O ACCESS_TOKEN lá embaixo é de mentira e é do T6/T8; com a rede
// trancada, nem ele nem nada tem como chegar à Meta.
const chamadasDeRede = [];
const fetchFalso = async (entrada) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  chamadasDeRede.push(url);
  if (/graph\.facebook\.com/i.test(url)) throw new Error('graph.facebook.com bloqueado pelo teste');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('api.cloudflare.com bloqueado pelo teste');
  throw new Error('rede bloqueada pelo teste');
};
globalThis.fetch = fetchFalso;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-auto-pixel-'));
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raizAnterior = process.cwd();
// config-store.ts e inbox.ts resolvem `<cwd>/config` e `<cwd>/logs` no import.
// A troca de diretório vem ANTES de qualquer import, senão o teste escreveria
// na configuração real.
process.chdir(tmp);

const ARQ_MARCAS = path.join(tmp, 'config', 'marcas.json');
const ARQ_INBOX = path.join(tmp, 'logs', 'inbox.jsonl');

// A marca implícita do `.env` é remontada a cada leitura. O T8 depende destes
// valores, então eles entram antes do import do config-store.
process.env.BRAND_NAME = 'Marca do Env';
process.env.PIXEL_ID = '999999999999999';
process.env.ACCESS_TOKEN = 'token-de-teste-que-nao-sai-daqui';

const store = await import(new URL('../src/lib/config-store.ts', import.meta.url).href);
const motor = await import(new URL('../src/lib/modo-por-marca.ts', import.meta.url).href);
const inbox = await import(new URL('../src/lib/inbox.ts', import.meta.url).href);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

/** Escreve marcas.json na mão (é o estado que o disco teria). */
const semearMarcas = (marcas) => {
  fs.writeFileSync(ARQ_MARCAS, JSON.stringify(marcas, null, 2), 'utf8');
};
const limparMarcas = () => {
  for (const p of [ARQ_MARCAS, ARQ_MARCAS + '.bak', ARQ_MARCAS + '.tmp']) {
    fs.rmSync(p, { force: true });
  }
};

const PIXEL = { pixelId: '1234567890', accessToken: 'EAAtoken-falso-de-teste' };

/**
 * O filtro da sonda (C10, D2): de uma lista de destinos, só os Pixels com
 * código de teste. É o MESMO filtro que o `webhook-handler.ts` usa em
 * `marcasEmTeste`; ele mora em `modo-por-marca.ts` para esta suíte conseguir
 * chamá-lo, porque o handler inteiro não carrega sob
 * `--conditions=react-server`.
 *
 * Antes da correção o filtro não existia e o handler mandava a lista INTEIRA
 * da regra para `decisaoDaSonda`. O `(ids) => [...ids]` reproduz exatamente
 * isso, e é por isso que os `ok(...)` do bloco C10 falham no código antigo em
 * vez de derrubar a suíte.
 */
const soMarcasEmTeste =
  typeof motor.soMarcasEmTeste === 'function' ? motor.soMarcasEmTeste : (ids) => [...ids];

console.log('\n  A trava do Pixel — disparo automático por Pixel (FASE 6)\n');

/* ================================================================== */
/* T1 — o coração da entrega: campo ausente = desligado                */
/* ================================================================== */
console.log('  -- T1: marca sem `autoDisparo`, regra em `auto` --');

semearMarcas([{ id: 'default', nome: 'Codigo Vencedor', ...PIXEL }]);
let d = await motor.resolverModoPorMarca('auto', ['default']);

ok(d.modoPorMarca.default === 'fila', '🔴 T1: campo ausente NÃO dispara — o item vai para a fila');
ok(
  d.motivoFila.default === 'auto-do-pixel-desligado',
  'T1: o motivo registrado é `auto-do-pixel-desligado`',
  d.motivoFila.default
);
ok(d.marcasAuto.length === 0, 'T1: nenhuma marca entra na lista de disparo automático');

// As três leituras proibidas, provadas uma a uma no lugar onde a decisão mora.
const marcaSemCampo = { id: 'default', nome: 'x', ...PIXEL };
ok(
  motor.pixelAceitaAuto(marcaSemCampo) === false,
  'T1: `pixelAceitaAuto` com o campo ausente responde false',
  '(!!x, x ?? true e x !== false responderiam true aqui)'
);
ok(motor.pixelAceitaAuto(undefined) === false, 'T1: marca inexistente também responde false');
ok(
  motor.pixelAceitaAuto({ ...marcaSemCampo, autoDisparo: 'sim' }) === false,
  'T1: valor truthy que não é o booleano `true` não liga nada',
  'JSON editado a mão não vira permissão'
);
ok(
  motor.pixelAceitaAuto({ ...marcaSemCampo, autoDisparo: true }) === true,
  'T1: só o booleano `true` responde true'
);

/* ================================================================== */
/* T3 — o pixel ligado não atropela a regra                            */
/* ================================================================== */
console.log('\n  -- T3: marca LIGADA, regra em `fila` --');

semearMarcas([{ id: 'default', nome: 'Codigo Vencedor', ...PIXEL, autoDisparo: true }]);
d = await motor.resolverModoPorMarca('fila', ['default']);

ok(d.modoPorMarca.default === 'fila', 'T3: a regra em `fila` manda, mesmo com o Pixel ligado');
ok(
  d.motivoFila.default === 'regra-em-fila',
  'T3: o motivo aponta a REGRA, não o Pixel',
  d.motivoFila.default
);
ok(d.marcasAuto.length === 0, 'T3: nada entra na lista de disparo');

/* ================================================================== */
/* T4 — `ignorar` curto-circuita: o pixel nem é consultado             */
/* ================================================================== */
console.log('\n  -- T4: regra em `ignorar` --');

d = await motor.resolverModoPorMarca('ignorar', ['default']);
ok(d.marcasAuto.length === 0, 'T4: `ignorar` nunca produz disparo, com o Pixel ligado ou não');
ok(d.modoPorMarca.default === 'fila', 'T4: o modo efetivo nunca é `auto`');

const fonteMotor = fs.readFileSync(path.join(RAIZ, 'src', 'lib', 'modo-por-marca.ts'), 'utf8');
ok(
  /if\s*\(\s*modoDaRegra === 'auto'\s*\)\s*\{[\s\S]{0,200}listarMarcas\(\)/.test(fonteMotor),
  'T4: `listarMarcas()` só é chamado quando a regra está em `auto`',
  'o disco nem é lido para um evento descartado'
);
ok(
  (fonteMotor.match(/listarMarcas\(\)/g) ?? []).length === 1,
  'T4: existe UMA única leitura de marcas no motor da decisão'
);

const fonteWebhook = fs.readFileSync(path.join(RAIZ, 'src', 'lib', 'webhook-handler.ts'), 'utf8');
ok(
  /modo === 'ignorar'\s*\r?\n?\s*\?\s*SEM_DECISAO/.test(fonteWebhook),
  'T4: o webhook usa `SEM_DECISAO` para `ignorar`, sem consultar Pixel nenhum'
);
ok(
  Object.keys(motor.SEM_DECISAO.modoPorMarca).length === 0 &&
    motor.SEM_DECISAO.marcasAuto.length === 0 &&
    Object.isFrozen(motor.SEM_DECISAO),
  'T4: `SEM_DECISAO` é vazia e congelada',
  'ninguém consegue escrever `auto` nela por acidente'
);

/* ================================================================== */
/* T5 — evento sem regra: o fallback `fila` continua de pé             */
/* ================================================================== */
console.log('\n  -- T5: evento sem regra correspondente --');

ok(
  /= regra\s*\r?\n?\s*\? regra\.modo\s*\r?\n?\s*: ignorarPeloParser\s*\r?\n?\s*\? 'ignorar'\s*\r?\n?\s*: 'fila';/.test(
    fonteWebhook
  ),
  'T5: sem regra o modo cai em `fila` (ou `ignorar` pelo parser), nunca em `auto`'
);
// E mesmo que alguém mude o fallback, a trava do Pixel segura por baixo:
semearMarcas([{ id: 'default', nome: 'Codigo Vencedor', ...PIXEL }]);
d = await motor.resolverModoPorMarca('fila', ['default']);
ok(
  d.marcasAuto.length === 0,
  'T5: o destino `default` sem switch ligado não dispara de qualquer forma'
);

/* ================================================================== */
/* T6 — ligado, mas sem token: fila, e NENHUMA chamada à Meta          */
/* ================================================================== */
console.log('\n  -- T6: marca LIGADA com token vazio --');

// O Pixel é um SEGUNDO, e não a marca `default`: a `default` herda o token do
// `.env` como reserva (`config-store.ts:243`), então ela nunca fica de fato sem
// token enquanto houver ACCESS_TOKEN no ambiente. O caso do T6 é o Pixel que
// alguém ligou e depois teve o token apagado.
semearMarcas([
  { id: 'default', nome: 'Codigo Vencedor', ...PIXEL },
  { id: 'secundaria', nome: 'Sem token', pixelId: '1234567890', accessToken: '', autoDisparo: true },
]);
d = await motor.resolverModoPorMarca('auto', ['secundaria']);
ok(d.modoPorMarca.secundaria === 'fila', '🔴 T6: sem token o evento fica na fila');
ok(d.motivoFila.secundaria === 'sem-token', 'T6: o motivo é `sem-token`', d.motivoFila.secundaria);

// A contrapartida, para o teste acima não passar por acidente: a `default` com
// o token vindo do `.env` e o switch ligado DISPARA.
semearMarcas([{ id: 'default', nome: 'Codigo Vencedor', accessToken: '', pixelId: '1234567890', autoDisparo: true }]);
d = await motor.resolverModoPorMarca('auto', ['default']);
ok(
  d.modoPorMarca.default === 'auto',
  'T6: a marca `default` com o token de reserva do `.env` não é barrada por `sem-token`'
);

semearMarcas([
  { id: 'default', nome: 'Sem pixel', pixelId: '   ', accessToken: 'EAAx', autoDisparo: true },
]);
d = await motor.resolverModoPorMarca('auto', ['default']);
ok(d.motivoFila.default === 'sem-token', 'T6: pixelId só com espaços também barra');

// A segunda trava, em auto-dispatch.ts: mesmo que a decisão errasse, o envio
// recusa. Ela é RESTRITIVA — nunca liga nada, só barra.
const fonteDisparo = fs.readFileSync(path.join(RAIZ, 'src', 'lib', 'auto-dispatch.ts'), 'utf8');
ok(
  /origem === 'auto' && !pixelAceitaAuto\(/.test(fonteDisparo),
  'T6: `dispararItem` tem a trava de invariante, e ela só barra `origem: auto`',
  'o botão "Disparar agora" do operador continua funcionando'
);
ok(
  /status: 'pixel-desligado'/.test(fonteDisparo) &&
    /'enviado'[\s\S]{0,200}marcarStatus\(item\.id, 'disparado'\)/.test(fonteDisparo),
  'T6: o bloqueio vira resultado `pixel-desligado` e só `enviado` marca o item como disparado'
);

/* ================================================================== */
/* T10 (offline) — o teste que justifica a entrega inteira             */
/* ================================================================== */
console.log('\n  -- T10 (offline): dois Pixels, estados opostos, mesma regra `auto` --');

semearMarcas([
  { id: 'ligada', nome: 'Pixel ligado', pixelId: '111', accessToken: 'EAAa', autoDisparo: true },
  { id: 'desligada', nome: 'Pixel desligado', pixelId: '222', accessToken: 'EAAb' },
]);
d = await motor.resolverModoPorMarca('auto', ['ligada', 'desligada']);

ok(d.modoPorMarca.ligada === 'auto', '🔴 T10: o Pixel ligado dispara');
ok(d.modoPorMarca.desligada === 'fila', '🔴 T10: o Pixel desligado, na MESMA regra, enfileira');
ok(
  d.motivoFila.desligada === 'auto-do-pixel-desligado' && d.motivoFila.ligada === undefined,
  'T10: só o enfileirado carrega motivo'
);
ok(
  d.marcasAuto.length === 1 && d.marcasAuto[0] === 'ligada',
  'T10: a lista de disparo tem exatamente o Pixel ligado',
  d.marcasAuto.join(',') || '(vazia)'
);

// Destino que não existe em marcas.json não herda o "ligado" de ninguém.
d = await motor.resolverModoPorMarca('auto', ['ligada', 'inexistente']);
ok(
  d.modoPorMarca.inexistente === 'fila' && d.marcasAuto.length === 1,
  'T10: id desconhecido não cai no fallback da primeira marca — fica desligado'
);

// A sonda de conexão passa por FORA da trava do Pixel, de propósito (ver
// decisaoDaSonda): o Pixel com o automático DESLIGADO recebe a sonda, desde que
// esteja em modo teste. Na chamada nova (C10) só entra em `decisaoDaSonda` quem
// passou pelo filtro de código de teste, do mesmo jeito que no handler.
semearMarcas([
  { id: 'ligada', nome: 'Pixel ligado', pixelId: '111', accessToken: 'EAAa', autoDisparo: true },
  { id: 'desligada', nome: 'Pixel desligado', pixelId: '222', accessToken: 'EAAb', testCode: 'TEST22222' },
]);
const sondaNoDesligado = motor.decisaoDaSonda(
  soMarcasEmTeste(['desligada'], await store.listarMarcas())
);
ok(
  sondaNoDesligado.marcasAuto.length === 1 && sondaNoDesligado.modoPorMarca.desligada === 'auto',
  'T10: a sonda do botão "Testar" não passa pela trava do Pixel',
  'ela só vai a Pixel com test_event_code e nunca vira conversão'
);

/* ================================================================== */
/* C10 (D2) — a sonda do "Testar" só vai aos Pixels em modo teste      */
/* ================================================================== */
console.log('\n  -- C10 (D2): sonda numa regra com um Pixel em teste e outro em produção --');

// O caso do D2: a regra do `ping` aponta para dois Pixels, e só um tem código
// de teste. O de produção está até com o automático LIGADO, para provar que o
// que o tira da sonda é a falta do código de teste, e não o switch.
semearMarcas([
  { id: 'emTeste', nome: 'Pixel em teste', pixelId: '333', accessToken: 'EAAc', testCode: 'TEST33333' },
  { id: 'producao', nome: 'Pixel em produção', pixelId: '444', accessToken: 'EAAd', testCode: '', autoDisparo: true },
]);
const cadastroC10 = await store.listarMarcas();
const alvosDaSonda = soMarcasEmTeste(['emTeste', 'producao'], cadastroC10);
const sonda = motor.decisaoDaSonda(alvosDaSonda);

ok(
  alvosDaSonda.length === 1 && alvosDaSonda[0] === 'emTeste',
  '🔴 C10: dos dois Pixels da regra, só o que tem código de teste vira alvo da sonda',
  `alvos: ${alvosDaSonda.join(',') || '(nenhum)'}`
);
ok(
  sonda.marcasAuto.length === 1 && sonda.marcasAuto[0] === 'emTeste',
  '🔴 C10: a sonda sai só para o Pixel em modo teste',
  `marcasAuto: ${sonda.marcasAuto.join(',') || '(vazia)'}`
);
ok(
  sonda.modoPorMarca.emTeste === 'auto',
  'C10: controle — o Pixel em teste recebe a sonda (sem ligar o automático dele)'
);
ok(
  !('producao' in sonda.modoPorMarca),
  '🔴 C10: o Pixel de produção fica FORA do `modoPorMarca` do item da sonda',
  JSON.stringify(sonda.modoPorMarca)
);
ok(
  !('producao' in sonda.motivoFila),
  'C10: e fora do `motivoFila`: a sonda não fica na fila do Pixel de produção',
  JSON.stringify(sonda.motivoFila)
);

// Código de teste só com espaços não é código: a mesma leitura `?.trim()` de sempre.
semearMarcas([
  { id: 'emTeste', nome: 'Pixel em teste', pixelId: '333', accessToken: 'EAAc', testCode: 'TEST33333' },
  { id: 'producao', nome: 'Pixel em produção', pixelId: '444', accessToken: 'EAAd', testCode: '   ' },
]);
const comEspacos = soMarcasEmTeste(['emTeste', 'producao'], await store.listarMarcas());
ok(
  comEspacos.length === 1 && comEspacos[0] === 'emTeste',
  '🔴 C10: código de teste só com espaços não põe o Pixel de produção na sonda',
  `alvos: ${comEspacos.join(',') || '(nenhum)'}`
);

// Id que não está no cadastro não vira alvo (sem o fallback de `acharMarca`
// para a primeira marca da lista).
const comDesconhecido = soMarcasEmTeste(['inexistente', 'emTeste'], cadastroC10);
ok(
  comDesconhecido.length === 1 && comDesconhecido[0] === 'emTeste',
  '🔴 C10: id desconhecido na regra não recebe a sonda',
  `alvos: ${comDesconhecido.join(',') || '(nenhum)'}`
);

// Nenhum Pixel em teste: nenhum alvo. E a decisão vazia não inventa o `default`,
// que pode ser justamente o Pixel de produção.
const semTeste = soMarcasEmTeste(['producao'], cadastroC10);
ok(semTeste.length === 0, '🔴 C10: regra só com Pixel de produção não tem alvo de sonda', `alvos: ${semTeste.join(',') || '(nenhum)'}`);
const decisaoVazia = motor.decisaoDaSonda([]);
ok(
  decisaoVazia.marcasAuto.length === 0 &&
    Object.keys(decisaoVazia.modoPorMarca).length === 0 &&
    Object.keys(decisaoVazia.motivoFila).length === 0,
  '🔴 C10: `decisaoDaSonda([])` devolve decisão vazia, sem cair no `default`',
  JSON.stringify(decisaoVazia)
);

// O handler usa o filtro. Prova estática, porque o `webhook-handler.ts` não
// carrega sob `--conditions=react-server` (o comportamento está provado acima,
// no mesmo filtro que ele chama).
ok(
  /const emTeste = testePlataforma \? await marcasEmTeste\(marcas\) : \[\];/.test(fonteWebhook),
  '🔴 C10: o handler lê quais destinos da regra estão em teste (e só lê quando é teste da plataforma)'
);
ok(
  /const sonda = testePlataforma && emTeste\.length > 0;/.test(fonteWebhook),
  '🔴 C10: a sonda liga quando a plataforma testou e há pelo menos um Pixel em teste'
);
ok(
  /\?\s*decisaoDaSonda\(emTeste\)/.test(fonteWebhook) && !/decisaoDaSonda\(marcas\)/.test(fonteWebhook),
  '🔴 C10: `decisaoDaSonda` recebe só os Pixels em teste, nunca a lista inteira da regra'
);
ok(
  /soMarcasEmTeste\(ids, /.test(fonteWebhook) && !/algumaMarcaEmTeste|ids\.some\(/.test(fonteWebhook),
  '🔴 C10: `marcasEmTeste` do handler usa o mesmo filtro desta suíte; a pergunta "alguma marca?" saiu'
);

/* ================================================================== */
/* T8 — a marca do `.env`, a falha mais provável da migração           */
/* ================================================================== */
console.log('\n  -- T8: marca implícita do `.env`, sem marcas.json --');

limparMarcas();
const doEnv = await store.listarMarcas();
ok(doEnv.length === 1 && doEnv[0].doEnv === true, 'T8: sem marcas.json sobra a marca do `.env`');
ok(
  doEnv[0].autoDisparo === false,
  '🔴 T8: a marca do `.env` nasce com `autoDisparo: false` EXPLÍCITO',
  `veio: ${JSON.stringify(doEnv[0].autoDisparo)}`
);
d = await motor.resolverModoPorMarca('auto', ['default']);
ok(
  d.marcasAuto.length === 0 && d.motivoFila.default === 'auto-do-pixel-desligado',
  'T8: com token e pixel válidos vindos do `.env`, ela ainda assim não dispara'
);

// O round-trip de gravação preserva o campo (e só ele muda).
await store.salvarMarca({ id: 'default', nome: 'Codigo Vencedor', ...PIXEL, autoDisparo: true });
let salvas = await store.listarMarcas();
ok(salvas[0].autoDisparo === true, 'T8: `salvarMarca` grava o `true` e `listarMarcas` lê de volta');
await store.salvarMarca({ id: 'default', autoDisparo: false });
salvas = await store.listarMarcas();
ok(
  salvas[0].autoDisparo === false && salvas[0].pixelId === PIXEL.pixelId,
  'T8: desligar preserva pixelId e token — o switch não apaga credencial'
);

/* ================================================================== */
/* C28 — a fronteira pública normaliza                                 */
/* ================================================================== */
console.log('\n  -- C28: `publicarMarca` entrega booleano de verdade --');

ok(
  store.publicarMarca({ id: 'a', nome: 'a', pixelId: '1', accessToken: 't' }).autoDisparo === false,
  'C28: campo ausente sai como `false` para a tela'
);
ok(
  store.publicarMarca({ id: 'a', nome: 'a', pixelId: '1', accessToken: 't', autoDisparo: true })
    .autoDisparo === true,
  'C28: campo `true` sai como `true`'
);
ok(
  !('accessToken' in store.publicarMarca({ id: 'a', nome: 'a', pixelId: '1', accessToken: 'x' })),
  'C28: e o token continua sem atravessar a fronteira pública (regra 2 do CLAUDE.md)'
);

/* ================================================================== */
/* T9 — o histórico antigo do inbox continua legível                   */
/* ================================================================== */
console.log('\n  -- T9: item antigo de inbox.jsonl, só com `modo` escalar --');

// Uma linha exatamente como a FASE 5 gravava: `modo` escalar, sem os campos
// novos. Reescrever histórico de evento seria pior que o problema (§9.9.2).
const antigo = {
  id: '00000000-0000-4000-8000-000000000001',
  recebidoEm: '2026-09-01T12:00:00.000Z',
  status: 'novo',
  evento: 'Purchase',
  modo: 'fila',
  campos: { value: '27.90' },
};
fs.writeFileSync(ARQ_INBOX, JSON.stringify(antigo) + '\n', 'utf8');

const lidos = await inbox.listarEntradas();
ok(lidos.length === 1 && lidos[0].id === antigo.id, 'T9: a linha antiga é lida sem quebrar');
ok(lidos[0].modo === 'fila', 'T9: o `modo` escalar continua chegando na tela');
ok(
  lidos[0].modoPorMarca === undefined && lidos[0].motivoFila === undefined,
  'T9: os campos novos ficam `undefined` — nada é inventado para o passado'
);

// E o item novo grava os campos novos ao lado do escalar (aditivo).
const novo = await inbox.registrarEntrada({
  evento: 'Purchase',
  modo: 'auto',
  modoPorMarca: { ligada: 'auto', desligada: 'fila' },
  motivoFila: { desligada: 'auto-do-pixel-desligado' },
  campos: {},
});
ok(
  novo.modo === 'auto' && novo.modoPorMarca?.desligada === 'fila',
  'T9: o item novo carrega o escalar E o mapa por Pixel, lado a lado'
);
const gravado = JSON.parse(fs.readFileSync(ARQ_INBOX, 'utf8').trim().split('\n').pop());
ok(
  gravado.motivoFila?.desligada === 'auto-do-pixel-desligado',
  'T9: e o motivo por Pixel chega ao disco'
);

/* ================================================================== */
/* C26 — nenhuma leitura de `autoDisparo` fora de `=== true`           */
/* ================================================================== */
console.log('\n  -- C26: a única leitura aceita --');

const arquivosFonte = [];
const varrer = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (/\.(ts|tsx)$/.test(e.name)) arquivosFonte.push(p);
  }
};
varrer(path.join(RAIZ, 'src'));

// Comentários são removidos antes da varredura: metade dos arquivos DOCUMENTA
// as formas proibidas para que ninguém as use, e isso não pode reprovar.
const semComentarios = (txt) =>
  txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const PROIBIDAS = [
  [/!!\s*\w*\??\.?autoDisparo/, '!!autoDisparo'],
  [/autoDisparo\s*\?\?/, 'autoDisparo ?? ...'],
  [/autoDisparo\s*!==\s*false/, 'autoDisparo !== false'],
  [/autoDisparo\s*==\s*true/, 'autoDisparo == true (comparação fraca)'],
  [/if\s*\(\s*\w+\??\.autoDisparo\s*\)/, 'if (marca.autoDisparo)'],
];
const culpados = [];
for (const p of arquivosFonte) {
  const codigo = semComentarios(fs.readFileSync(p, 'utf8'));
  if (!/autoDisparo/.test(codigo)) continue;
  for (const [re, nome] of PROIBIDAS) {
    if (re.test(codigo)) culpados.push(`${path.relative(RAIZ, p)}: ${nome}`);
  }
}
ok(
  culpados.length === 0,
  '🔴 C26: nenhuma leitura permissiva de `autoDisparo` no código',
  culpados.join(' | ')
);

// E os lugares que de fato LEEM o campo leem com `=== true`.
const leitores = [
  ['src/lib/modo-por-marca.ts', /marca\?\.autoDisparo === true/],
  ['src/lib/config-store.ts', /m\.autoDisparo === true/],
  ['src/components/pixels/CardDePixel.tsx', /marca\.autoDisparo === true/],
  ['src/app/api/marcas/route.ts', /body\.autoDisparo === true/],
];
for (const [rel, re] of leitores) {
  ok(re.test(fs.readFileSync(path.join(RAIZ, rel), 'utf8')), `C26: ${rel} lê com === true`);
}

/* ================================================================== */
/* RD-21 — ligar sem token é recusado antes de gravar                  */
/* ================================================================== */
console.log('\n  -- RD-21: ligar sem token é recusado --');

const fonteRota = fs.readFileSync(
  path.join(RAIZ, 'src', 'app', 'api', 'marcas', 'route.ts'),
  'utf8'
);
ok(
  /if \(!tokenDepois\)[\s\S]{0,500}status: 400/.test(fonteRota),
  'RD-21: a rota devolve 400 quando alguém tenta ligar um Pixel sem token'
);
ok(
  /const mudaAuto = typeof body\.autoDisparo === 'boolean'/.test(fonteRota) &&
    /mudaAuto \? \{ autoDisparo: body\.autoDisparo as boolean \} : \{\}/.test(fonteRota),
  'RD-21: um PUT que não fala de `autoDisparo` não encosta no campo',
  'salvar o token não liga nem desliga o automático'
);

/* ================================================================== */
/* MIG-4 — a FASE 6 termina com o switch DESLIGADO                     */
/* ================================================================== */
console.log('\n  -- MIG-4: o repositório termina com tudo desligado --');

// 🔴 O que esta seção prova é que o REPOSITÓRIO não embarca um switch ligado —
// não que a máquina de quem roda o teste esteja com o automático desligado.
//
// A distinção não é preciosismo: `config/` inteiro está no `.gitignore`, e em
// produção ele é um volume nomeado (`capi_config`). O arquivo que existe aqui
// do lado é estado do OPERADOR, escrito por um clique humano na tela de Pixels
// — que é exatamente o clique que o resto deste arquivo existe para exigir.
// Falhar porque alguém ligou o produto seria o teste cobrando que o produto
// nunca tivesse entrado no ar.
//
// A garantia de que nada sai sozinho continua inteira e continua sendo provada
// por código, não por arquivo de configuração: T1 (campo ausente = desligado),
// T8 (a marca do `.env` nasce `false` explícito), C26 (nenhuma leitura
// permissiva) e C28 (o booleano que chega à tela é de verdade).
const gitignore = (() => {
  try {
    return fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8');
  } catch {
    return '';
  }
})();
// `/config/` (só o da raiz) desde o 2º deploy de 26/09: `config/` sem a barra
// escondia também `src/app/api/config/route.ts`, que precisa ir para o git.
const configIgnorado = /^\s*\/?config\/?\s*$/m.test(gitignore);

ok(
  configIgnorado,
  '🔴 MIG-4: `config/` está no .gitignore — o repositório não embarca marca nenhuma',
  configIgnorado ? 'nada de config/ vai para o git' : 'ATENÇÃO: config/ saiu do .gitignore'
);

const marcasReais = path.join(RAIZ, 'config', 'marcas.json');
if (fs.existsSync(marcasReais)) {
  let conteudo = [];
  try {
    conteudo = JSON.parse(fs.readFileSync(marcasReais, 'utf8'));
  } catch {
    conteudo = [];
  }
  const ligadas = (Array.isArray(conteudo) ? conteudo : []).filter((m) => m?.autoDisparo === true);
  // Relatório, não veredito: esta linha existe para que quem roda o teste veja
  // o estado da própria máquina antes de mexer em disparo automático.
  console.log(
    ligadas.length === 0
      ? '  --    config/marcas.json local: nenhum Pixel com automático ligado'
      : `  --    config/marcas.json local: automático LIGADO em ${ligadas.map((m) => m.id).join(', ')} (estado do operador, não do repositório)`
  );
} else {
  ok(true, 'MIG-4: não há config/marcas.json local — a marca do `.env` já nasce desligada (T8)');
}

/* ================================================================== */
/* Rede — nada tentou sair                                             */
/* ================================================================== */
console.log('\n  -- Rede: nenhuma chamada --');

ok(
  globalThis.fetch === fetchFalso,
  'Rede: o fetch falso continua no lugar até o fim (ninguém o trocou no meio)'
);
ok(
  chamadasDeRede.length === 0,
  '🔴 Rede: nenhuma chamada de fetch na suíte inteira (nem à Meta, nem à Cloudflare)',
  chamadasDeRede.length ? `${chamadasDeRede.length} chamada(s)` : ''
);

/* ================================================================== */

process.chdir(raizAnterior);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Trava do Pixel fechada: o campo ausente é desligado, e só um clique humano liga.\n'
    : `\n  ${falhas} falha(s).\n`
);
process.exit(falhas === 0 ? 0 : 1);
