#!/usr/bin/env node
/**
 * Testes automatizados dos sinais de leitura do payload (src/lib/inbox-sinais.ts).
 *
 * Cobre:
 *  1. Entrada hostil (null, undefined, texto, array, número) nunca lança
 *  2. fbclid na query da URL de origem
 *  3. fbclid em campo próprio, em vários níveis
 *  4. cookie fbc no formato fb.1.<ms>.<fbclid> implicando fbclid
 *  5. Payload sem atribuição nenhuma
 *  6. gclid, gbraid e wbraid, cada um ligando temGclid
 *  7. Nome do cliente em cada caminho suportado e a precedência entre eles
 *  8. Payload fundo demais: não lança, não estoura a pilha
 *  9. Formatos reais A e B (scripts/exemplos)
 *
 * Uso: npm run test:inbox-sinais
 */

const { sinaisDoPayload } = await import(
  new URL('../src/lib/inbox-sinais.ts', import.meta.url).href
);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

/** Roda a função capturando exceção: o contrato é "nunca lança". */
const semLancar = (valor) => {
  try {
    return { r: sinaisDoPayload(valor), erro: null };
  } catch (e) {
    return { r: null, erro: e };
  }
};

console.log('\n  Sinais do payload da caixa de entrada\n');

/* ---------------- 1. Entrada hostil ---------------- */
for (const [rotulo, valor] of [
  ['null', null],
  ['undefined', undefined],
  ["'texto'", 'texto solto'],
  ['[]', []],
  ['[1,2,3]', [1, 2, 3]],
  ['numero', 42],
  ['{}', {}],
]) {
  const { r, erro } = semLancar(valor);
  ok(erro === null, `sinaisDoPayload(${rotulo}) nao lanca`, erro ? String(erro) : '');
  ok(r?.temFbclid === false, `sinaisDoPayload(${rotulo}) -> temFbclid false`);
  ok(r?.temGclid === false, `sinaisDoPayload(${rotulo}) -> temGclid false`);
  ok(r?.nomeCliente === undefined, `sinaisDoPayload(${rotulo}) -> sem nomeCliente`);
}

/* ---------------- 2. fbclid na query da URL de origem ---------------- */
ok(
  sinaisDoPayload({
    data: { attribution: { event_source_url: 'https://codigovencedor.com/checkout?utm_source=ig&fbclid=IwAR3wXYZ' } },
  }).temFbclid === true,
  'fbclid na query de data.attribution.event_source_url'
);
ok(
  sinaisDoPayload({ attribution: { eventSourceUrl: 'https://x.com/?fbclid=abc' } }).temFbclid === true,
  'fbclid na query de attribution.eventSourceUrl (formato B)'
);
ok(
  sinaisDoPayload({ page_url: 'https://x.com/p?a=1&fbclid=abc#fim' }).temFbclid === true,
  'fbclid em page_url na raiz'
);
ok(
  sinaisDoPayload({ url: 'https://x.com/p#fbclid=abc' }).temFbclid === true,
  'fbclid depois do # tambem conta'
);
ok(
  sinaisDoPayload({ url: 'https://x.com/p?fbclid=' }).temFbclid === false,
  'fbclid vazio na query nao conta como atribuicao'
);
ok(
  sinaisDoPayload({ url: 'https://x.com/p?meu_fbclid_favorito=1' }).temFbclid === false,
  'nome de parametro parecido nao liga o sinal'
);
ok(
  sinaisDoPayload({ referrer: 'https://l.instagram.com/?fbclid=abc' }).temFbclid === false,
  'referrer NAO e URL de origem: fbclid ali nao conta'
);

/* ---------------- 3. fbclid em campo proprio ---------------- */
ok(sinaisDoPayload({ data: { fbclid: 'IwAR1' } }).temFbclid === true, 'data.fbclid em campo proprio');
ok(
  sinaisDoPayload({ data: { attribution: { fbclid: 'IwAR1' } } }).temFbclid === true,
  'data.attribution.fbclid em campo proprio'
);
ok(
  sinaisDoPayload({ data: { attribution: { cookies: { fbclid: 'IwAR1' } } } }).temFbclid === true,
  'data.attribution.cookies.fbclid (formato A real)'
);
ok(sinaisDoPayload({ fbclid: null }).temFbclid === false, 'fbclid null nao liga o sinal');
ok(sinaisDoPayload({ fbclid: '' }).temFbclid === false, 'fbclid vazio nao liga o sinal');
ok(sinaisDoPayload({ fbclid: '   ' }).temFbclid === false, 'fbclid so com espaco nao liga o sinal');
ok(sinaisDoPayload({ fbclid: 'null' }).temFbclid === false, "fbclid com o texto 'null' nao liga o sinal");
ok(
  sinaisDoPayload({ itens: [{ attribution: { fbclid: 'IwAR1' } }] }).temFbclid === true,
  'array no caminho nao esconde o fbclid'
);

/* ---------------- 4. cookie fbc implica fbclid ---------------- */
ok(
  sinaisDoPayload({ data: { attribution: { cookies: { fbc: 'fb.1.1757700000000.IwZXh0EXEMPLO' } } } }).temFbclid === true,
  'cookie fbc no formato fb.1.<ms>.<fbclid> implica fbclid'
);
ok(
  sinaisDoPayload({ _fbc: 'fb.2.1757700000000.IwZXh0EXEMPLO' }).temFbclid === true,
  '_fbc com outro numero de subdominios tambem vale'
);
ok(sinaisDoPayload({ fbc: 'fb.1.' }).temFbclid === false, 'fbc truncado (sem fbclid dentro) nao vale');
ok(sinaisDoPayload({ fbc: 'lixo' }).temFbclid === false, 'fbc malformado nao vale');
ok(
  sinaisDoPayload({ fbp: 'fb.1.1757700000000.2324207034' }).temFbclid === false,
  'fbp com formato parecido NAO implica fbclid (fbp nao atribui anuncio)'
);

/* ---------------- 5. Sem nada ---------------- */
const nada = sinaisDoPayload({
  event: 'purchase_approved',
  data: { order_id: '6', amount: 1990, lead: { email: 'a@b.com' }, attribution: { utm: { source: 'facebook' } } },
});
ok(nada.temFbclid === false && nada.temGclid === false, 'payload sem click id nenhum -> os dois sinais false');

/* ---------------- 6. gclid / gbraid / wbraid ---------------- */
for (const id of ['gclid', 'gbraid', 'wbraid']) {
  ok(sinaisDoPayload({ data: { attribution: { [id]: 'Cj0KEXEMPLO' } } }).temGclid === true, `${id} em campo proprio liga temGclid`);
  ok(
    sinaisDoPayload({ data: { attribution: { event_source_url: `https://x.com/p?${id}=Cj0KEXEMPLO` } } }).temGclid === true,
    `${id} na query da URL de origem liga temGclid`
  );
}
ok(sinaisDoPayload({ data: { attribution: { gclid: null } } }).temGclid === false, 'gclid null (entrega real do xWinner) nao liga temGclid');
ok(
  sinaisDoPayload({ gclid: 'Cj0K', fbclid: 'IwAR1' }).temGclid === true &&
    sinaisDoPayload({ gclid: 'Cj0K', fbclid: 'IwAR1' }).temFbclid === true,
  'os dois sinais convivem no mesmo payload'
);

/* ---------------- 7. Nome do cliente ---------------- */
ok(sinaisDoPayload({ data: { lead: { name: 'Maria Exemplo Da Silva' } } }).nomeCliente === 'Maria Exemplo Da Silva', 'nome em data.lead.name');
ok(sinaisDoPayload({ data: { customer: { name: 'Ana Cliente' } } }).nomeCliente === 'Ana Cliente', 'nome em data.customer.name');
ok(sinaisDoPayload({ data: { buyer: { name: 'Bruno Comprador' } } }).nomeCliente === 'Bruno Comprador', 'nome em data.buyer.name');
ok(sinaisDoPayload({ data: { lead: { nome: 'Carlos Lead' } } }).nomeCliente === 'Carlos Lead', 'nome em data.lead.nome');
ok(sinaisDoPayload({ name: 'Daniela Raiz' }).nomeCliente === 'Daniela Raiz', 'nome em name na raiz');
ok(sinaisDoPayload({ nome: 'Eduardo Raiz' }).nomeCliente === 'Eduardo Raiz', 'nome em nome na raiz');
ok(sinaisDoPayload({ lead: { name: 'Fabio Formato B' } }).nomeCliente === 'Fabio Formato B', 'nome em lead.name na raiz (formato B)');
ok(sinaisDoPayload({ data: { lead: { name: '  Gisele Com Espaco  ' } } }).nomeCliente === 'Gisele Com Espaco', 'nome vem com trim()');
ok(
  sinaisDoPayload({ data: { lead: { name: 'Helena Do Nascimento Santos' } } }).nomeCliente === 'Helena Do Nascimento Santos',
  'nome vem COMPLETO, sem mascara (so o e-mail e mascarado)'
);
ok(sinaisDoPayload({ data: { lead: { name: '   ' } } }).nomeCliente === undefined, 'nome so com espaco e tratado como ausente');
ok(sinaisDoPayload({ data: { lead: { name: 42 } } }).nomeCliente === undefined, 'nome que nao e string e ignorado');

// Precedencia, do mais especifico ao mais generico.
ok(
  sinaisDoPayload({
    name: 'Raiz',
    nome: 'RaizPt',
    lead: { name: 'RaizLead' },
    data: { lead: { name: 'DataLead', nome: 'DataLeadPt' }, customer: { name: 'DataCustomer' }, buyer: { name: 'DataBuyer' } },
  }).nomeCliente === 'DataLead',
  'data.lead.name vence todos os outros caminhos'
);
ok(
  sinaisDoPayload({ name: 'Raiz', data: { customer: { name: 'DataCustomer' }, buyer: { name: 'DataBuyer' } } }).nomeCliente === 'DataCustomer',
  'data.customer.name vence data.buyer.name e a raiz'
);
ok(
  sinaisDoPayload({ name: 'Raiz', data: { buyer: { name: 'DataBuyer' }, lead: { nome: 'DataLeadPt' } } }).nomeCliente === 'DataBuyer',
  'data.buyer.name vence data.lead.nome'
);
ok(
  sinaisDoPayload({ name: 'Raiz', nome: 'RaizPt', data: { lead: { nome: 'DataLeadPt' } } }).nomeCliente === 'DataLeadPt',
  'data.lead.nome vence name/nome da raiz'
);
ok(sinaisDoPayload({ name: 'Raiz', nome: 'RaizPt' }).nomeCliente === 'Raiz', 'name vence nome na raiz');
ok(
  sinaisDoPayload({ nome: 'RaizPt', lead: { name: 'RaizLead' } }).nomeCliente === 'RaizPt',
  'nome da raiz vence lead.name da raiz (formato B fica por ultimo)'
);

/* ---------------- 8. Payload fundo demais ---------------- */
const fundo = {};
let ponta = fundo;
for (let i = 0; i < 6000; i++) {
  ponta.filho = {};
  ponta = ponta.filho;
}
ponta.fbclid = 'IwAR1';
const { r: rFundo, erro: erroFundo } = semLancar(fundo);
ok(erroFundo === null, 'payload com 6000 niveis nao lanca nem estoura a pilha', erroFundo ? String(erroFundo) : '');
ok(rFundo?.temFbclid === false, 'fbclid alem do teto de profundidade nao e visto (conservador: nao inventa atribuicao)');

const largo = { fbclid: 'IwAR1' };
for (let i = 0; i < 5000; i++) largo['campo' + i] = 'valor';
const { r: rLargo, erro: erroLargo } = semLancar(largo);
ok(erroLargo === null, 'payload com 5000 chaves na raiz nao lanca');
ok(rLargo?.temFbclid === true, 'o teto de nos nao impede ler o que esta no primeiro nivel');

const ciclico = { data: { attribution: { fbclid: 'IwAR1' } } };
ciclico.data.eu = ciclico; // referencia circular: JSON.parse nao gera, mas a tela pode
const { r: rCiclico, erro: erroCiclico } = semLancar(ciclico);
ok(erroCiclico === null, 'payload com referencia circular nao trava nem lanca');
ok(rCiclico?.temFbclid === true, 'e ainda assim encontra o fbclid');

/* ---------------- 9. Formatos reais ---------------- */
const ms = Date.now();
const formatoA = {
  event: 'purchase_approved',
  data: {
    order_id: '5',
    lead: { email: 'comprador.exemplo@dominio-ficticio.com.br', name: 'Maria Exemplo Da Silva' },
    attribution: {
      utm: { source: 'facebook' },
      cookies: { fbp: `fb.1.${ms}.2324207034`, fbc: `fb.1.${ms}.IwZXh0EXEMPLO`, fbclid: 'IwZXh0EXEMPLO', gclid: null },
      referrer: 'https://l.instagram.com/',
      landing_page: 'https://codigovencedor.com/?utm_source=facebook&utm_campaign=52564275344761',
    },
  },
};
const a = sinaisDoPayload(formatoA);
ok(a.temFbclid === true, 'formato A real: temFbclid');
ok(a.temGclid === false, 'formato A real: temGclid false (gclid vem null nas entregas)');
ok(a.nomeCliente === 'Maria Exemplo Da Silva', 'formato A real: nome do lead');

const formatoB = {
  event: 'checkout.session.completed',
  lead: { name: 'Maria Exemplo Da Silva', email: 'comprador.exemplo@dominio-ficticio.com.br' },
  attribution: {
    cookies: { fbc: `fb.1.${ms}.PAcGRvEXEMPLO`, fbp: `fb.1.${ms}.2324207034`, fbclid: 'PAcGRvEXEMPLO', gclid: null },
    eventSourceUrl: 'https://codigovencedor.com/?placement=Instagram_Feed&ad_id=52567985998561',
  },
};
const b = sinaisDoPayload(formatoB);
ok(b.temFbclid === true, 'formato B real: temFbclid');
ok(b.temGclid === false, 'formato B real: temGclid false');
ok(b.nomeCliente === 'Maria Exemplo Da Silva', 'formato B real: nome do lead na raiz');

/* --------------------------------------------------------------------------
 * Nome PARTIDO em first_name/last_name — o caminho que o parser já lia
 * (`parser.ts:332-340`) e que a leitura do disco precisa alcançar também.
 * Sem isto, uma entrega antiga que só trouxe `buyer.first_name` mostraria nome
 * no item recém-recebido e nenhum nome depois de um restart.
 * ------------------------------------------------------------------------ */
ok(
  sinaisDoPayload({ data: { buyer: { first_name: 'Joana', last_name: 'Prado' } } }).nomeCliente ===
    'Joana Prado',
  'nome partido em data.buyer.first_name + last_name'
);
ok(
  sinaisDoPayload({ data: { buyer: { first_name: 'Solange' } } }).nomeCliente === 'Solange',
  'só first_name já vale como nome'
);
ok(
  sinaisDoPayload({ buyer: { first_name: 'Ivo', last_name: 'Raiz' } }).nomeCliente === 'Ivo Raiz',
  'nome partido em buyer na raiz (payload achatado)'
);
ok(
  sinaisDoPayload({
    data: { lead: { name: 'Nome Inteiro' }, buyer: { first_name: 'Nao', last_name: 'Use' } },
  }).nomeCliente === 'Nome Inteiro',
  'nome inteiro vence nome partido'
);
ok(
  sinaisDoPayload({ data: { buyer: { first_name: '   ', last_name: '  ' } } }).nomeCliente ===
    undefined,
  'nome partido só com espaço é tratado como ausente'
);

console.log(
  falhas === 0 ? '\n  Sinais do payload com 100% de cobertura e funcionando.\n' : `\n  ${falhas} falha(s).\n`
);
process.exit(falhas === 0 ? 0 : 1);
