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
 *   C19  os 8 handlers de §14.8.2 respondem 401 sem cookie de sessão — e junto
 *        deles o `GET /api/inbox/resumo`, que nasceu depois (FASE 4 do painel):
 *        handler que fica de fora desta lista é handler que ninguém confere
 *   D33  401 é SEMPRE falta de sessão; 503 é SEMPRE arquivo indisponível.
 *        Trocar os dois custa venda: o xWinner lê 401 como "segredo errado" e
 *        desiste da entrega; 503 ele reentrega sozinho depois.
 *   C20  DELETE /api/inbox exige `{"confirmar": true}` no corpo — antes um
 *        clique perdido apagava `inbox.jsonl` e `inbox-resultados.jsonl`
 *        inteiros, sem backup nenhum
 *   C16b PUT /api/integracoes PRESERVA campo que ele não conhece (diff do
 *        arquivo antes/depois), não zera `saida` nem o contador de hits da tag,
 *        e nunca troca o segredo de entrada
 *   C16c a lista de testes é normalizada e validada antes de gravar. É o único
 *        campo desta rota que PARA uma venda de chegar à Meta: item escrito
 *        errado aqui descarta venda PIX real em silêncio, então o servidor
 *        recusa antes, em vez de gravar e deixar o estrago acontecer
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
const rotaResumo = await import(
  new URL('../src/app/api/inbox/resumo/route.ts', import.meta.url).href
);
const rotaPessoas = await import(
  new URL('../src/app/api/inbox/pessoas/route.ts', import.meta.url).href
);
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
console.log('  -- C19: 401 sem cookie de sessão (os 8 handlers de §14.8.2 + o resumo do painel) --');

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

/**
 * O resumo do Painel (FASE 4) entra na MESMA lista, não numa checagem à parte.
 *
 * `OITO` continua sendo exatamente os oito handlers de §14.8.2 — mexer no nome
 * dele apagaria a referência à seção. O que a lista de baixo diz é outra coisa:
 * TODA rota de console protegida passa pelas duas voltas abaixo, e uma rota nova
 * que não apareça aqui é uma rota que ninguém confere.
 */
const PROTEGIDAS = [
  ...OITO,
  ['GET    /api/inbox/resumo', (s) => rotaResumo.GET(req('/api/inbox/resumo', { sessao: s }))],
  ['GET    /api/inbox/pessoas', (s) => rotaPessoas.GET(req('/api/inbox/pessoas', { sessao: s }))],
];

for (const [nome, chamar] of PROTEGIDAS) {
  const res = await chamar(false);
  const corpo = await corpoDe(res);
  ok(
    res.status === 401 && ehJson(res) && typeof corpo?.erro === 'string',
    `${nome} → 401 JSON sem cookie`,
    `status=${res.status}`
  );
}

console.log('\n  -- e com cookie válido nenhum deles responde 401 --');
for (const [nome, chamar] of PROTEGIDAS) {
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

/* ------------------------------------------------------------------ */
/* `?limite=` é clampado, nunca erro: lixo cai no padrão 50 e número    */
/* absurdo cai no teto. Uma URL montada à mão não pode virar 500 nem    */
/* arrastar a caixa inteira para a resposta.                            */
/* ------------------------------------------------------------------ */
const limiteLixo = await rotaInbox.GET(req('/api/inbox?limite=abc', { sessao: true }));
const corpoLimiteLixo = await corpoDe(limiteLixo);
ok(
  limiteLixo.status === 200 && (corpoLimiteLixo?.itens?.length ?? 0) <= 50,
  'GET /api/inbox?limite=abc → 200 e no máximo 50 itens (padrão)',
  `status=${limiteLixo.status}`
);

const limiteEnorme = await rotaInbox.GET(req('/api/inbox?limite=99999', { sessao: true }));
await corpoDe(limiteEnorme);
ok(
  limiteEnorme.status === 200,
  'GET /api/inbox?limite=99999 → 200 (clampado no teto, não é erro)',
  `status=${limiteEnorme.status}`
);

/* ------------------------------------------------------------------ */
/* FASE 4 — GET /api/inbox/resumo: `?dias=` cai no padrão, nunca erra,  */
/* e o corpo é CONTAGEM.                                                */
/*                                                                      */
/* 🔴 O resumo NÃO pode trazer a chave `payload`. A caixa guarda o JSON  */
/* inteiro que o comprador gerou (nome, e-mail, pedido) e o painel só    */
/* precisa de número. No dia em que alguém devolver o item junto com a   */
/* contagem — "já que estou aqui" —, esta asserção reprova antes de a    */
/* PII chegar à tela.                                                    */
/* ------------------------------------------------------------------ */
const resumo30 = await rotaResumo.GET(req('/api/inbox/resumo?dias=30', { sessao: true }));
const corpoResumo30 = await corpoDe(resumo30);
ok(
  resumo30.status === 200 && corpoResumo30?.resumo?.periodo === 30,
  'GET /api/inbox/resumo?dias=30 → 200 e resumo.periodo = 30',
  `status=${resumo30.status}`
);

const resumo5 = await rotaResumo.GET(req('/api/inbox/resumo?dias=5', { sessao: true }));
const corpoResumo5 = await corpoDe(resumo5);
ok(
  resumo5.status === 200 && corpoResumo5?.resumo?.periodo === 'hoje',
  'GET /api/inbox/resumo?dias=5 → 200 e período inválido cai no padrão "hoje"',
  `status=${resumo5.status}`
);

const resumoHoje = await rotaResumo.GET(req('/api/inbox/resumo?dias=hoje', { sessao: true }));
const corpoResumoHoje = await corpoDe(resumoHoje);
ok(
  resumoHoje.status === 200 && corpoResumoHoje?.resumo?.periodo === 'hoje',
  'GET /api/inbox/resumo?dias=hoje → 200 e o período volta como "hoje", não como número',
  `status=${resumoHoje.status}`
);

const resumoLivre = await rotaResumo.GET(
  req('/api/inbox/resumo?de=2026-09-01&ate=2026-09-10', { sessao: true })
);
const corpoResumoLivre = await corpoDe(resumoLivre);
ok(
  resumoLivre.status === 200 &&
    corpoResumoLivre?.resumo?.periodo?.de === '2026-09-01' &&
    corpoResumoLivre?.resumo?.periodo?.ate === '2026-09-10',
  'GET /api/inbox/resumo?de=&ate= → 200 e o período livre volta como intervalo',
  `status=${resumoLivre.status}`
);
ok(
  typeof corpoResumoLivre?.resumo?.janela?.inicio === 'string' &&
    typeof corpoResumoLivre?.resumo?.janela?.fim === 'string',
  'e a janela sai em ISO, que é o que a lista do recorte usa para filtrar igual'
);

const resumoDataPodre = await rotaResumo.GET(
  req('/api/inbox/resumo?de=2026-02-30&ate=nao-e-data', { sessao: true })
);
const corpoDataPodre = await corpoDe(resumoDataPodre);
ok(
  resumoDataPodre.status === 200 && corpoDataPodre?.resumo?.periodo === 'hoje',
  '🔴 data impossível na URL não derruba a rota nem inventa janela: cai no padrão "hoje"',
  `status=${resumoDataPodre.status}`
);

ok(
  JSON.stringify(corpoResumo30).includes('"payload"') === false,
  '🔴 o corpo do resumo NÃO traz a chave `payload`: contagem não carrega dado de cliente'
);

/* ------------------------------------------------------------------ */
/* GET /api/inbox/pessoas — a lista que o clique no card abre.          */
/*                                                                      */
/* 🔴 A MESMA trava do resumo, e aqui ela é mais importante, não menos:  */
/* esta rota devolve ITEM, não contagem. É o lugar onde "já que estou    */
/* devolvendo o item, devolvo inteiro" é a tentação natural — e é        */
/* exatamente assim que e-mail e telefone de comprador chegariam à tela. */
/* ------------------------------------------------------------------ */
const pessoas30 = await rotaPessoas.GET(req('/api/inbox/pessoas?dias=30', { sessao: true }));
const corpoPessoas30 = await corpoDe(pessoas30);
ok(
  pessoas30.status === 200 && Array.isArray(corpoPessoas30?.pessoas),
  'GET /api/inbox/pessoas?dias=30 → 200 e `pessoas` é uma lista',
  `status=${pessoas30.status}`
);
ok(
  JSON.stringify(corpoPessoas30).includes('"payload"') === false,
  '🔴 o corpo de /pessoas NÃO traz a chave `payload`: a lista mostra pessoa, não payload'
);

const pessoasDataPodre = await rotaPessoas.GET(
  req('/api/inbox/pessoas?de=2026-02-30&ate=nao-e-data', { sessao: true })
);
const corpoPessoasPodre = await corpoDe(pessoasDataPodre);
ok(
  pessoasDataPodre.status === 200 && corpoPessoasPodre?.periodo === 'hoje',
  'data impossível na URL de /pessoas cai no mesmo padrão "hoje" do resumo, sem derrubar a rota',
  `status=${pessoasDataPodre.status}`
);

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
/* C16c — a lista de testes, o unico campo que PARA uma venda          */
/* ================================================================== */
console.log('\n  -- C16c: PUT /api/integracoes valida a lista de testes --');

// Este bloco e o inverso de todos os outros deste arquivo. Um dominio torto ou
// uma regra invalida fazem o console DEIXAR DE agir; um item torto aqui faz o
// console DESCARTAR venda PIX real, em silencio e para sempre. Por isso o que
// se prova aqui e que o servidor recusa o item perigoso ANTES de gravar.

const resTestes = await rotaIntegracoes.PUT(
  req('/api/integracoes', {
    metodo: 'PUT',
    sessao: true,
    corpo: {
      testes: {
        // Maiusculas, espaco em volta e um repetido: tudo isso chega do
        // copiar-e-colar do backoffice e nenhum deles pode virar item novo.
        emails: ['  Jairo@Exemplo.com.BR ', 'jairo@exemplo.com.br', 'qa@loja.com'],
        nomes: ['  Jairo   Silva  '],
        comprasParaSuspeitar: 4,
      },
    },
  })
);
await corpoDe(resTestes);
const comTestes = JSON.parse(lerArq(ARQ));
ok(resTestes.status === 200, 'PUT com `testes` válido → 200', `status=${resTestes.status}`);
ok(
  comTestes.testes?.emails?.length === 2,
  'e-mail repetido só por causa de maiúscula/espaço entra UMA vez',
  JSON.stringify(comTestes.testes?.emails)
);
ok(
  comTestes.testes?.emails?.[0] === 'jairo@exemplo.com.br',
  'o e-mail é gravado em minúsculas e sem espaço — a comparação lá na frente é exata'
);
ok(
  comTestes.testes?.nomes?.[0] === 'Jairo Silva',
  'o espaço duplicado do nome é achatado',
  JSON.stringify(comTestes.testes?.nomes)
);
ok(comTestes.testes?.comprasParaSuspeitar === 4, 'o limite do operador foi gravado');

// A mesma regra de `saida`: ausente significa "não mexi nisto".
const resSemTestes = await rotaIntegracoes.PUT(
  req('/api/integracoes', { metodo: 'PUT', sessao: true, corpo: { saida: [] } })
);
await corpoDe(resSemTestes);
ok(
  JSON.parse(lerArq(ARQ)).testes?.emails?.length === 2,
  '🔴 um save de OUTRA aba, sem `testes` no corpo, não apaga a lista de testes'
);

// 🔴 O nome casa por CONTER. "a" marcaria praticamente todo comprador do Brasil
// como teste, e nenhuma venda voltaria à Meta — sem erro em lugar nenhum.
const antesNomeCurto = lerArq(ARQ);
const resNomeCurto = await rotaIntegracoes.PUT(
  req('/api/integracoes', { metodo: 'PUT', sessao: true, corpo: { testes: { nomes: ['a'] } } })
);
const corpoNomeCurto = await corpoDe(resNomeCurto);
ok(
  resNomeCurto.status === 400 && Array.isArray(corpoNomeCurto.erros) && corpoNomeCurto.erros.length > 0,
  '🔴 nome de 1 letra → 400: ele casa por CONTER e barraria todo comprador',
  `status=${resNomeCurto.status}`
);
ok(lerArq(ARQ) === antesNomeCurto, 'e o arquivo está byte a byte igual ao de antes da tentativa');

const resEmailQuebrado = await rotaIntegracoes.PUT(
  req('/api/integracoes', {
    metodo: 'PUT',
    sessao: true,
    corpo: { testes: { emails: ['jairo'] } },
  })
);
await corpoDe(resEmailQuebrado);
ok(
  resEmailQuebrado.status === 400,
  'pedaço de e-mail → 400: a comparação é exata e um pedaço nunca casaria',
  `status=${resEmailQuebrado.status}`
);

const resLimite1 = await rotaIntegracoes.PUT(
  req('/api/integracoes', {
    metodo: 'PUT',
    sessao: true,
    corpo: { testes: { comprasParaSuspeitar: 1 } },
  })
);
await corpoDe(resLimite1);
ok(
  resLimite1.status === 400,
  '🔴 limite 1 → 400: toda primeira compra viraria suspeita e o produto travava',
  `status=${resLimite1.status}`
);
ok(
  JSON.parse(lerArq(ARQ)).testes?.comprasParaSuspeitar === 4,
  'e o limite que já estava gravado continua o mesmo'
);

// Esvaziar é uma decisão legítima — e explícita, como em `saida: []`.
const resEsvaziar = await rotaIntegracoes.PUT(
  req('/api/integracoes', {
    metodo: 'PUT',
    sessao: true,
    corpo: { testes: { emails: [], nomes: [] } },
  })
);
await corpoDe(resEsvaziar);
const semTestes = JSON.parse(lerArq(ARQ));
ok(
  resEsvaziar.status === 200 &&
    semTestes.testes.emails.length === 0 &&
    semTestes.testes.nomes.length === 0,
  'um `testes` EXPLÍCITO com listas vazias esvazia a lista'
);
ok(
  semTestes.chaveDeVersaoFutura?.ligado === false,
  'e a chave desconhecida continua lá depois de mexer nos testes'
);

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

// 6) O resumo do painel também sai em JSON quando a configuração some.
//    `config/empresas.json` ilegível é o erro que dá para forçar nesta rota: ela
//    só lê, e `empresaDaRequisicao` se recusa a cair na empresa padrão nesse
//    estado — contar a caixa do cliente A como se fosse do B seria pior do que
//    não responder. O que está sob teste é o FORMATO da recusa: JSON com `erro`,
//    nunca o 500 do Next em HTML, que quebra o `.json()` da tela.
const EMPRESAS_ARQ = path.join(tmp, 'config', 'empresas.json');
fs.writeFileSync(EMPRESAS_ARQ, 'isto nao e json', 'utf8');
fs.writeFileSync(EMPRESAS_ARQ + '.bak', '{"empresas":[', 'utf8');

const resResumoDegradado = await rotaResumo.GET(req('/api/inbox/resumo', { sessao: true }));
const corpoResumoDegradado = await corpoDe(resResumoDegradado);
ok(
  resResumoDegradado.status === 503 &&
    ehJson(resResumoDegradado) &&
    typeof corpoResumoDegradado.erro === 'string',
  '🔴 C32/D33: GET /api/inbox/resumo com empresas.json ilegível → 503 JSON (não 401, não HTML)',
  `status=${resResumoDegradado.status}`
);
ok(
  !(corpoResumoDegradado.erro ?? '').includes(tmp),
  'regra 2: o caminho absoluto não aparece na mensagem do resumo'
);

fs.rmSync(EMPRESAS_ARQ, { force: true });
fs.rmSync(EMPRESAS_ARQ + '.bak', { force: true });

/* ================================================================== */

process.chdir(raizAnterior);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Rotas trancadas: sessão, confirmação, preservação de campo, erro em JSON e resumo sem PII.\n'
    : `\n  ${falhas} falha(s).\n`
);
process.exit(falhas === 0 ? 0 : 1);
