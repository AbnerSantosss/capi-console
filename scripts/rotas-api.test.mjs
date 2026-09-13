#!/usr/bin/env node
/**
 * As travas das rotas de API (PARTE 14, §14.8.1 B-10, §14.8.2 B-11, §14.8.3 B-12).
 *
 * Os handlers de verdade são importados e chamados aqui dentro — não há cópia
 * da lógica escrita de novo no teste. Se alguém apagar um `exigirSessao()` ou
 * voltar a montar o objeto de integrações campo a campo, este arquivo reprova.
 *
 * O que cada bloco prova:
 *
 *   C19  os 8 handlers de §14.8.2 respondem 401 sem cookie de sessão
 *   D33  401 é SEMPRE falta de sessão; 503 é SEMPRE arquivo indisponível.
 *        Trocar os dois custa venda: o xWinner lê 401 como "segredo errado" e
 *        desiste da entrega; 503 ele reentrega sozinho depois.
 *   C20  DELETE /api/inbox exige `{"confirmar": true}` no corpo — antes um
 *        clique perdido apagava `inbox.jsonl` e `inbox-resultados.jsonl`
 *        inteiros, sem backup nenhum
 *   C16b PUT /api/integracoes PRESERVA campo que ele não conhece (diff do
 *        arquivo antes/depois), não zera `saida` nem o contador de hits da tag,
 *        e nunca troca o segredo de entrada
 *   C32  erro forçado em cada rota sai como JSON `{ erro }` — nunca o 500 do
 *        Next em HTML, que quebra o `.json()` da tela
 *
 * Roda num diretório temporário, sem rede e SEM disparar nenhum evento para a
 * Meta: o único caminho de webhook exercitado aqui é o de segredo recusado e o
 * de configuração indisponível, que param antes de qualquer envio.
 *
 * ⚠️ Este é o único teste que roda SEM `--conditions=react-server`: carregar um
 * `route.ts` inteiro arrasta meta-capi → meta-events → lucide-react, e o React
 * da condição react-server não tem `createContext`. No lugar da condição,
 * `scripts/_resolver-ts.mjs` troca `server-only` por um módulo vazio — que é
 * exatamente o que a condição react-server faria com ele.
 *
 * Uso: npm run test:rotas
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* Credenciais fortes ANTES de carregar sessao.ts, que lê o ambiente no import. */
process.env.CONSOLE_USER = 'admin';
process.env.CONSOLE_PASSWORD = 'senha-super-segura-com-mais-de-12-chars';
process.env.SESSION_SECRET = 'segredo-de-sessao-muito-seguro-com-mais-de-32-caracteres-para-teste';
/* Sem token e sem pixel: nada tem como sair daqui para a Meta. */
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-rotas-'));
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raizAnterior = process.cwd();
// config-store.ts e inbox.ts resolvem os caminhos no import.
process.chdir(tmp);

const ARQ = path.join(tmp, 'config', 'integracoes.json');
const BAK = ARQ + '.bak';
const INBOX = path.join(tmp, 'logs', 'inbox.jsonl');
const INBOX_RES = path.join(tmp, 'logs', 'inbox-resultados.jsonl');

const { NextRequest } = await import('next/server.js');
const { assinarSessao, COOKIE_SESSAO } = await import(
  new URL('../src/lib/sessao.ts', import.meta.url).href
);

const rotaInbox = await import(new URL('../src/app/api/inbox/route.ts', import.meta.url).href);
const rotaRelay = await import(new URL('../src/app/api/relay/route.ts', import.meta.url).href);
const rotaMarcas = await import(new URL('../src/app/api/marcas/route.ts', import.meta.url).href);
const rotaConfig = await import(new URL('../src/app/api/config/route.ts', import.meta.url).href);
const rotaStream = await import(
  new URL('../src/app/api/webhook/stream/route.ts', import.meta.url).href
);
const rotaIntegracoes = await import(
  new URL('../src/app/api/integracoes/route.ts', import.meta.url).href
);
const rotaEmpresas = await import(
  new URL('../src/app/api/empresas/route.ts', import.meta.url).href
);
const rotaWebhook = await import(new URL('../src/app/api/webhook/in/route.ts', import.meta.url).href);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const COOKIE = `${COOKIE_SESSAO}=${assinarSessao('admin', 12)}`;

function req(caminho, { metodo = 'GET', corpo, sessao = false, cabecalhos = {} } = {}) {
  const h = { ...cabecalhos };
  if (sessao) h.cookie = COOKIE;
  const init = { method: metodo, headers: h };
  if (corpo !== undefined) {
    h['content-type'] = 'application/json';
    init.body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  }
  return new NextRequest('http://localhost:3333' + caminho, init);
}

/** Lê a resposta sem deixar stream aberto (o SSE tem intervalo de 20 s). */
async function corpoDe(res) {
  const tipo = res.headers.get('content-type') ?? '';
  if (tipo.includes('text/event-stream')) {
    try {
      const leitor = res.body.getReader();
      await leitor.read();
      await leitor.cancel();
    } catch {
      /* stream já encerrado */
    }
    return null;
  }
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { __naoEhJson: txt.slice(0, 120) };
  }
}

const ehJson = (res) => (res.headers.get('content-type') ?? '').includes('application/json');

const lerArq = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

console.log('\n  Rotas de API: sessão, confirmação, preservação e formato de erro\n');

/* ================================================================== */
/* C19 / B-11 — os 8 handlers de §14.8.2                               */
/* ================================================================== */
console.log('  -- C19: 401 sem cookie de sessão (os 8 handlers de §14.8.2) --');

const OITO = [
  ['GET    /api/inbox', (s) => rotaInbox.GET(req('/api/inbox', { sessao: s }))],
  [
    'PATCH  /api/inbox',
    (s) => rotaInbox.PATCH(req('/api/inbox', { metodo: 'PATCH', sessao: s, corpo: { id: 'x', status: 'novo' } })),
  ],
  [
    'DELETE /api/inbox',
    (s) => rotaInbox.DELETE(req('/api/inbox', { metodo: 'DELETE', sessao: s })),
  ],
  ['GET    /api/relay', (s) => rotaRelay.GET(req('/api/relay', { sessao: s }))],
  [
    'POST   /api/relay',
    (s) => rotaRelay.POST(req('/api/relay', { metodo: 'POST', sessao: s, corpo: { destinoId: 'nao-existe' } })),
  ],
  ['GET    /api/marcas', (s) => rotaMarcas.GET(req('/api/marcas', { sessao: s }))],
  ['GET    /api/config', (s) => rotaConfig.GET(req('/api/config', { sessao: s }))],
  ['GET    /api/webhook/stream', (s) => rotaStream.GET(req('/api/webhook/stream', { sessao: s }))],
];

for (const [nome, chamar] of OITO) {
  const res = await chamar(false);
  const corpo = await corpoDe(res);
  ok(
    res.status === 401 && ehJson(res) && typeof corpo?.erro === 'string',
    `${nome} → 401 JSON sem cookie`,
    `status=${res.status}`
  );
}

console.log('\n  -- e com cookie válido nenhum deles responde 401 --');
for (const [nome, chamar] of OITO) {
  const res = await chamar(true);
  await corpoDe(res);
  ok(res.status !== 401, `${nome} → ${res.status} com sessão válida`);
}

console.log('\n  -- cookie adulterado vale o mesmo que cookie nenhum --');
const adulterado = COOKIE.slice(0, -4) + 'AAAA';
const resAdulterado = await rotaInbox.GET(
  req('/api/inbox', { cabecalhos: { cookie: adulterado } })
);
ok(resAdulterado.status === 401, 'GET /api/inbox com cookie adulterado → 401');

/* ================================================================== */
/* D.1.6 — /api/empresas nasce com a mesma trava                       */
/* ================================================================== */
/**
 * A rota de empresas entrou na FASE D, depois de §14.8.2 — e é justamente a
 * rota que CRIA e APAGA empresa, arrastando os Pixels junto (D-17). Ficar de
 * fora da tabela de travas é como um handler nasce sem guarda: ninguém lembra
 * de conferir o que não está na lista.
 *
 * Os corpos são de propósito inválidos: o que está sob teste é o 401 chegar
 * ANTES de qualquer leitura de arquivo. Com sessão válida a resposta é 400 ou
 * 200 — o que importa é não ser 401.
 */
console.log('\n  -- D.1.6: 401 sem cookie de sessão em /api/empresas --');

const EMPRESAS = [
  ['GET    /api/empresas', (s) => rotaEmpresas.GET(req('/api/empresas', { sessao: s }))],
  [
    'PUT    /api/empresas',
    (s) => rotaEmpresas.PUT(req('/api/empresas', { metodo: 'PUT', sessao: s, corpo: {} })),
  ],
  [
    'DELETE /api/empresas',
    (s) =>
      rotaEmpresas.DELETE(
        req('/api/empresas?id=nao-existe', { metodo: 'DELETE', sessao: s, corpo: { confirmar: true } })
      ),
  ],
];

for (const [nome, chamar] of EMPRESAS) {
  const res = await chamar(false);
  const corpo = await corpoDe(res);
  ok(
    res.status === 401 && ehJson(res) && typeof corpo?.erro === 'string',
    `${nome} → 401 JSON sem cookie`,
    `status=${res.status}`
  );
}

console.log('\n  -- e com cookie válido nenhuma delas responde 401 --');
for (const [nome, chamar] of EMPRESAS) {
  const res = await chamar(true);
  await corpoDe(res);
  ok(res.status !== 401, `${nome} → ${res.status} com sessão válida`);
}

/* ================================================================== */
/* C20 / B11-b — o DELETE destrutivo exige confirmação                 */
/* ================================================================== */
console.log('\n  -- C20: DELETE /api/inbox só apaga com confirmação explícita --');

fs.writeFileSync(INBOX, JSON.stringify({ id: 'i1', recebidoEm: new Date().toISOString() }) + '\n', 'utf8');
fs.writeFileSync(INBOX_RES, JSON.stringify({ id: 'i1', status: 'novo' }) + '\n', 'utf8');

const semCorpo = await rotaInbox.DELETE(req('/api/inbox', { metodo: 'DELETE', sessao: true }));
const corpoSemCorpo = await corpoDe(semCorpo);
ok(
  semCorpo.status === 400 && ehJson(semCorpo) && /irrevers/i.test(corpoSemCorpo.erro ?? ''),
  'DELETE sem corpo → 400 e diz que é irreversível',
  `status=${semCorpo.status}`
);
ok(lerArq(INBOX) !== null && lerArq(INBOX_RES) !== null, 'e os dois .jsonl continuam no disco');

const confirmaFalso = await rotaInbox.DELETE(
  req('/api/inbox', { metodo: 'DELETE', sessao: true, corpo: { confirmar: 'sim' } })
);
await corpoDe(confirmaFalso);
ok(confirmaFalso.status === 400, 'confirmar:"sim" (string) NÃO confirma → 400');
ok(lerArq(INBOX) !== null, 'os arquivos continuam intactos');

const confirmado = await rotaInbox.DELETE(
  req('/api/inbox', { metodo: 'DELETE', sessao: true, corpo: { confirmar: true } })
);
const corpoConfirmado = await corpoDe(confirmado);
ok(confirmado.status === 200 && corpoConfirmado.ok === true, 'confirmar:true → 200');
ok(lerArq(INBOX) === null && lerArq(INBOX_RES) === null, 'e aí sim os dois .jsonl foram apagados');

/* ================================================================== */
/* C16b / B-12 — o PUT preserva o que não conhece                      */
/* ================================================================== */
console.log('\n  -- C16b: PUT /api/integracoes preserva campo desconhecido --');

const SEGREDO = 'segredo-de-entrada-fixo-do-teste';
const CHAVE_TAG = 'cvt_chave_fixa_do_teste';
fs.writeFileSync(
  ARQ,
  JSON.stringify(
    {
      entrada: {
        segredo: SEGREDO,
        modo: 'fila',
        rotulo: 'meu-endpoint',
        // Campo escrito por uma versão futura do console. O handler antigo
        // apagava isto em QUALQUER save, inclusive num save da aba de Regras.
        campoDeVersaoFutura: 'nao-me-apague',
      },
      regras: [
        {
          id: 'r1',
          eventoOrigem: 'purchase_approved',
          eventoMeta: 'Purchase',
          marcas: ['default'],
          modo: 'fila',
          ativo: true,
          anotacao: 'campo de regra que este handler não conhece',
        },
      ],
      saida: [
        {
          id: 'd1',
          nome: 'n8n',
          url: 'https://exemplo.invalid/hook',
          headers: {},
          eventos: ['dispatch.success'],
          ativo: true,
        },
      ],
      tag: {
        chave: CHAVE_TAG,
        dominios: [{ id: 'dom1', host: 'loja.com.br', criadoEm: '2026-01-01T00:00:00.000Z', hits: 42 }],
      },
      // Chave de TOPO desconhecida, só para provar o passthrough.
      //
      // 🔴 Este canário se chamava `autoDisparo` enquanto o campo não existia.
      // A FASE 6 criou o campo de verdade — em `marcas.json`, por Pixel, como
      // booleano — e um canário com o nome de um campo real deixa de provar
      // "chave que o handler não conhece" e passa a parecer contrato. Daí o
      // nome novo, que ninguém vai implementar.
      chaveDeVersaoFutura: { ligado: false },
    },
    null,
    2
  ),
  'utf8'
);
fs.rmSync(BAK, { force: true });

// Um save igual ao da tela de Regras: manda só `regras`, mais nada.
const resPut = await rotaIntegracoes.PUT(
  req('/api/integracoes', {
    metodo: 'PUT',
    sessao: true,
    corpo: {
      regras: [
        {
          id: 'r1',
          eventoOrigem: 'purchase_approved',
          eventoMeta: 'Purchase',
          marcas: ['default'],
          modo: 'fila',
          ativo: true,
          anotacao: 'campo de regra que este handler não conhece',
        },
      ],
    },
  })
);
await corpoDe(resPut);
ok(resPut.status === 200, 'PUT com só `regras` no corpo → 200', `status=${resPut.status}`);

const depois = JSON.parse(lerArq(ARQ));
ok(
  depois.chaveDeVersaoFutura?.ligado === false,
  'B12-a: a chave de TOPO desconhecida (`chaveDeVersaoFutura`) sobreviveu ao round-trip'
);
ok(
  depois.entrada.campoDeVersaoFutura === 'nao-me-apague',
  'B12-a: a chave desconhecida dentro de `entrada` sobreviveu'
);
ok(
  depois.regras[0].anotacao === 'campo de regra que este handler não conhece',
  'B12-b: `.passthrough()` preservou o campo desconhecido DENTRO da regra'
);
ok(
  depois.saida.length === 1 && depois.saida[0].id === 'd1',
  'B12-c: `saida` ausente no corpo significa "não mexi", não "apague"'
);
ok(depois.tag.chave === CHAVE_TAG, 'a chave da tag não foi girada por um save de regra');
ok(
  depois.tag.dominios[0].hits === 42,
  'o contador de hits do domínio não foi zerado',
  `hits=${depois.tag.dominios[0].hits}`
);
ok(depois.entrada.rotulo === 'meu-endpoint', 'o apelido da URL continua o mesmo');
ok(depois.entrada.segredo === SEGREDO, '🔴 B1-g: o PUT NÃO trocou o segredo de entrada');

// `saida: []` explícito é a única forma de esvaziar.
const resVazia = await rotaIntegracoes.PUT(
  req('/api/integracoes', { metodo: 'PUT', sessao: true, corpo: { saida: [] } })
);
await corpoDe(resVazia);
const semSaida = JSON.parse(lerArq(ARQ));
ok(
  resVazia.status === 200 && semSaida.saida.length === 0,
  'um `saida: []` EXPLÍCITO esvazia a lista — e só ele'
);
ok(
  semSaida.chaveDeVersaoFutura?.ligado === false,
  'e a chave desconhecida continua lá depois do segundo save'
);

// Corpo inválido: 400 com a lista de problemas, e NADA gravado.
const antesInvalido = lerArq(ARQ);
const resInvalido = await rotaIntegracoes.PUT(
  req('/api/integracoes', {
    metodo: 'PUT',
    sessao: true,
    corpo: {
      regras: [
        { id: 'r9', eventoOrigem: 'x', eventoMeta: 'Purchase', marcas: [], modo: 'auto', ativo: true },
      ],
    },
  })
);
const corpoInvalido = await corpoDe(resInvalido);
ok(
  resInvalido.status === 400 && Array.isArray(corpoInvalido.erros) && corpoInvalido.erros.length > 0,
  'regra em modo automático sem pixel → 400 com a lista de problemas',
  `status=${resInvalido.status}`
);
ok(/nada foi alterado/i.test(corpoInvalido.erro ?? ''), 'a mensagem diz que nada foi alterado');
ok(lerArq(ARQ) === antesInvalido, 'e o arquivo está byte a byte igual ao de antes da tentativa');

// `__proto__` no corpo não envenena o objeto gravado.
const resProto = await rotaIntegracoes.PUT(
  // String crua de propósito: um literal `{ __proto__: ... }` em JS trocaria o
  // protótipo do objeto do teste em vez de criar a chave.
  req('/api/integracoes', { metodo: 'PUT', sessao: true, corpo: '{"__proto__":{"poluido":true}}' })
);
await corpoDe(resProto);
ok(({}).poluido === undefined, 'chave __proto__ no corpo não polui o Object.prototype');

/* ================================================================== */
/* C32 / D33 — todo erro sai em JSON, e 401 nunca vira 503             */
/* ================================================================== */
console.log('\n  -- C32/D33: erro forçado sai em JSON, com o status certo --');

// 1) Corpo que não é JSON.
const resTexto = await rotaInbox.PATCH(
  req('/api/inbox', { metodo: 'PATCH', sessao: true, corpo: 'isto nao e json' })
);
const corpoTexto = await corpoDe(resTexto);
ok(
  resTexto.status === 400 && ehJson(resTexto) && /JSON/i.test(corpoTexto.erro ?? ''),
  'PATCH /api/inbox com corpo não-JSON → 400 JSON',
  `status=${resTexto.status}`
);

const resRelayRuim = await rotaRelay.POST(
  req('/api/relay', { metodo: 'POST', sessao: true, corpo: '{ isto {{ nao fecha' })
);
const corpoRelayRuim = await corpoDe(resRelayRuim);
ok(
  resRelayRuim.status === 400 && ehJson(resRelayRuim) && typeof corpoRelayRuim.erro === 'string',
  'POST /api/relay com corpo não-JSON → 400 JSON'
);

// 2) Destino inexistente: 404 JSON, e nada sai pela rede.
const resDestino = await rotaRelay.POST(
  req('/api/relay', { metodo: 'POST', sessao: true, corpo: { destinoId: 'nao-existe' } })
);
const corpoDestino = await corpoDe(resDestino);
ok(
  resDestino.status === 404 && corpoDestino.erro === 'Destino não encontrado.',
  'POST /api/relay com destino inexistente → 404 JSON'
);

// 3) Configuração indisponível: 503 com Retry-After, NUNCA 401.
fs.writeFileSync(ARQ, 'isto nao e json', 'utf8');
fs.writeFileSync(BAK, '{"entrada":{', 'utf8');
const arqAntes = lerArq(ARQ);
const bakAntes = lerArq(BAK);

const resDegradado = await rotaIntegracoes.GET(req('/api/integracoes', { sessao: true }));
const corpoDegradado = await corpoDe(resDegradado);
ok(
  resDegradado.status === 503 && ehJson(resDegradado),
  '🔴 D33: GET /api/integracoes com config ilegível → 503 (não 401)',
  `status=${resDegradado.status}`
);
ok(resDegradado.headers.get('retry-after') === '60', 'o 503 traz Retry-After: 60');
ok(
  /config\/integracoes\.json/.test(corpoDegradado.erro ?? '') &&
    /nenhum segredo foi trocado/i.test(corpoDegradado.erro ?? ''),
  'a mensagem diz qual arquivo restaurar e que nenhum segredo foi trocado'
);
ok(
  !(corpoDegradado.erro ?? '').includes(SEGREDO) && !(corpoDegradado.erro ?? '').includes(tmp),
  'regra 2: nem o segredo nem o caminho absoluto aparecem na mensagem'
);

// 4) 🔴 O portão: o webhook de venda com config ilegível responde 503, não 401.
const resWebhookDegradado = await rotaWebhook.POST(
  req('/api/webhook/in', {
    metodo: 'POST',
    corpo: { event: 'purchase_approved' },
    cabecalhos: { 'x-capi-secret': SEGREDO },
  })
);
const corpoWebhookDegradado = await corpoDe(resWebhookDegradado);
ok(
  resWebhookDegradado.status === 503,
  '🔴 D33: POST /api/webhook/in com config ilegível → 503, NUNCA 401',
  `status=${resWebhookDegradado.status}`
);
ok(
  resWebhookDegradado.headers.get('retry-after') === '60' && typeof corpoWebhookDegradado.erro === 'string',
  'o xWinner recebe Retry-After e reentrega sozinho quando a config voltar'
);
ok(lerArq(ARQ) === arqAntes && lerArq(BAK) === bakAntes, 'e nada foi gravado por cima dos arquivos quebrados');

// 5) Config de volta: segredo errado volta a ser 401. Os dois lados do portão.
fs.rmSync(BAK, { force: true });
fs.writeFileSync(
  ARQ,
  JSON.stringify({
    entrada: { segredo: SEGREDO, modo: 'fila', rotulo: 'meu-endpoint' },
    regras: [],
    saida: [],
    tag: { chave: CHAVE_TAG, dominios: [] },
  }),
  'utf8'
);
const resSegredoErrado = await rotaWebhook.POST(
  req('/api/webhook/in', {
    metodo: 'POST',
    corpo: { event: 'purchase_approved' },
    cabecalhos: { 'x-capi-secret': 'segredo-errado' },
  })
);
const corpoSegredoErrado = await corpoDe(resSegredoErrado);
ok(
  resSegredoErrado.status === 401 && typeof corpoSegredoErrado.erro === 'string',
  '🔴 D33: segredo errado (e config legível) → 401, como sempre foi'
);
ok(
  !(corpoSegredoErrado.erro ?? '').includes(SEGREDO),
  'regra 2: a recusa não devolve o segredo esperado'
);
ok(
  JSON.parse(lerArq(ARQ)).entrada.segredo === SEGREDO,
  '🔴 D32: passados todos os erros acima, o segredo em disco é o original'
);

/* ================================================================== */

process.chdir(raizAnterior);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Rotas trancadas: sessão, confirmação, preservação de campo e erro em JSON.\n'
    : `\n  ${falhas} falha(s).\n`
);
process.exit(falhas === 0 ? 0 : 1);
