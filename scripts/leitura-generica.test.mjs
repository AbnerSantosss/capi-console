// White-label (06/10/2026): a mesma empresa recebe webhook de várias
// plataformas. Estes payloads são FICTÍCIOS, no formato de plataformas que o
// parser não conhecia. Roda sem servidor e não manda nada a ninguém.
import { readFileSync } from 'node:fs';
import { parseWebhook } from '../src/lib/parser.ts';
import { lerGenerico, nomeDoEventoGenerico, ehPrimeiroDeposito } from '../src/lib/leitura-generica.ts';

let falhas = 0;
const ok = (cond, nome, detalhe = '') => {
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${nome}${cond || !detalhe ? '' : ' -> ' + detalhe}`);
};
const ler = (obj) => parseWebhook(JSON.stringify(obj));

// 1. Aninhado, com comprador em `buyer` e valor em `purchase.price.value`
const aninhado = ler({
  id: 'ficticio-1',
  event: 'PURCHASE_APPROVED',
  data: {
    product: { id: 1, name: 'Curso Fictício' },
    affiliates: [{ name: 'Afiliado Fictício', email: 'afiliado@loja-ficticia.invalid' }],
    buyer: { email: 'compradora@cliente-ficticio.invalid', name: 'Ana Fictícia Souza', checkout_phone: '11988887777' },
    producer: { name: 'Produtor Fictício' },
    commissions: [{ value: 9.9, source: 'MARKETPLACE' }],
    purchase: {
      transaction: 'HP-FICTICIO-001',
      status: 'APPROVED',
      price: { value: 197.5, currency_value: 'BRL' },
    },
  },
});
console.log('1. Formato aninhado (buyer + purchase.price)');
ok(aninhado.fields.email === 'compradora@cliente-ficticio.invalid', 'e-mail é o do comprador, não o do afiliado', String(aninhado.fields.email));
ok(aninhado.fields.firstName === 'Ana' && aninhado.fields.lastName === 'Fictícia Souza', 'nome do comprador');
ok(aninhado.fields.phone === '11988887777', 'telefone em buyer.checkout_phone', String(aninhado.fields.phone));
ok(aninhado.fields.value === '197.50', 'valor em purchase.price.value, sem pegar a comissão', String(aninhado.fields.value));
ok(aninhado.fields.currency === 'BRL', 'moeda em currency_value', String(aninhado.fields.currency));
ok(aninhado.fields.orderId === 'HP-FICTICIO-001', 'pedido em purchase.transaction', String(aninhado.fields.orderId));
ok(aninhado.fields.eventId === 'order_HP-FICTICIO-001', 'event_id derivado do pedido', String(aninhado.fields.eventId));
ok(aninhado.eventName === undefined && aninhado.ignorar === true, 'nome novo NÃO vira evento da Meta sozinho');
ok(aninhado.classificacao === 'desconhecido' && aninhado.eventoMetaSugerido === 'Purchase', 'fica sem regra, com sugestão Purchase', `${aninhado.classificacao}/${aninhado.eventoMetaSugerido}`);
ok(aninhado.fields.sourceUrl === undefined, 'sem site no payload, não inventa URL de outra empresa', String(aninhado.fields.sourceUrl));

// 2. Nome do evento em outro campo, pessoa em `Customer`, atribuição em `TrackingParameters`
const outroCampo = ler({
  order_id: 'KW-FICTICIO-77',
  order_status: 'paid',
  webhook_event_type: 'pedido_aprovado_ficticio',
  Customer: { full_name: 'Bruno Fictício Lima', email: 'bruno@cliente-ficticio.invalid', mobile: '+55 (21) 97777-6666' },
  Product: { product_name: 'Produto Fictício' },
  Commissions: { charge_amount: 9700, currency: 'USD' },
  TrackingParameters: { utm_source: 'meta', utm_campaign: 'campanha-ficticia', fbp: 'fb.1.1700000000000.123456789', fbclid: 'FBCLID-FICTICIO' },
  domain: 'loja-ficticia.invalid',
});
console.log('2. Nome do evento em webhook_event_type');
ok(outroCampo.eventoOrigem === 'pedido_aprovado_ficticio', 'nome do evento lido de webhook_event_type', String(outroCampo.eventoOrigem));
ok(outroCampo.fields.email === 'bruno@cliente-ficticio.invalid', 'e-mail em Customer.email');
ok(outroCampo.fields.firstName === 'Bruno', 'nome em Customer.full_name');
ok(outroCampo.fields.phone === '5521977776666', 'telefone só com dígitos', String(outroCampo.fields.phone));
ok(outroCampo.fields.orderId === 'KW-FICTICIO-77', 'pedido na raiz');
ok(outroCampo.fields.value === undefined, 'valor dentro de Commissions não é lido como faturamento', String(outroCampo.fields.value));
ok(outroCampo.fields.fbp === 'fb.1.1700000000000.123456789', 'fbp lido de TrackingParameters');
ok(String(outroCampo.fields.fbc || '').endsWith('.FBCLID-FICTICIO'), 'fbc remontado do fbclid', String(outroCampo.fields.fbc));
ok(
  String(outroCampo.fields.sourceUrl || '').startsWith('https://loja-ficticia.invalid/?utm_source=meta'),
  'URL montada com o domínio DO PAYLOAD e as UTMs',
  String(outroCampo.fields.sourceUrl)
);
ok(!String(outroCampo.fields.sourceUrl || '').includes('codigovencedor'), 'nada de domínio do Código Vencedor');

// 3. Plano e curto
const curto = ler({ type: 'venda_ficticia', email: 'carla@cliente-ficticio.invalid', name: 'Carla Fictícia', value: '97,00', currency: 'BRL', transaction_id: 'TX-1' });
console.log('3. Payload plano e curto');
ok(curto.eventoOrigem === 'venda_ficticia', 'nome do evento lido de type');
ok(curto.fields.email === 'carla@cliente-ficticio.invalid' && curto.fields.firstName === 'Carla', 'e-mail e nome na raiz');
ok(curto.fields.value === '97.00', 'valor "97,00" vira 97.00', String(curto.fields.value));
ok(curto.fields.orderId === 'TX-1', 'pedido em transaction_id');
ok(curto.preenchidos.some((p) => p.includes('campo "value"') && p.includes('confira')), 'a tela diz de qual campo o valor saiu');

// 4. Unidade do valor
console.log('4. Unidade do valor');
const centavos = ler({ type: 'x_ficticio', customer: { email: 'd@cliente-ficticio.invalid' }, payment: { amount_cents: 4990 } });
ok(centavos.fields.value === '49.90', 'campo com "cents" no nome divide por 100', String(centavos.fields.value));
const ambiguo = ler({ type: 'x_ficticio', customer: { email: 'd@cliente-ficticio.invalid' }, payment: { amount: 4990 } });
ok(ambiguo.fields.value === undefined, '`amount` inteiro aninhado fica sem ler', String(ambiguo.fields.value));
ok(ambiguo.preenchidos.some((p) => p.startsWith('valor não lido')), 'e a tela avisa que o valor não foi lido');
const decimal = ler({ type: 'x_ficticio', customer: { email: 'd@cliente-ficticio.invalid' }, payment: { amount: '49.90' } });
ok(decimal.fields.value === '49.90', '`amount` com casa decimal é unidade de moeda', String(decimal.fields.value));

// 5. Os formatos que já funcionavam não mudam
console.log('5. Formatos conhecidos intactos');
const exemplo = (n) => readFileSync(new URL(`./exemplos/${n}`, import.meta.url), 'utf8');
for (const nome of ['A-purchase_approved.json', 'A-checkout_abandoned.json', 'B-checkout.session.completed.json', 'G-DEPOSIT_PAYMENT.json', 'G-DEPOSIT_CREATED.json']) {
  const r = parseWebhook(exemplo(nome));
  ok(!r.preenchidos.some((p) => p.includes('leitura genérica') || p.includes('campo "')), `${nome}: nenhum campo veio da leitura genérica`, r.preenchidos.join(' | '));
}
const g = parseWebhook(exemplo('G-DEPOSIT_PAYMENT.json'));
ok(g.fields.value === '10.00' && g.eventName === 'Purchase', 'depósito do payload plano segue 10.00 e Purchase', `${g.fields.value}/${g.eventName}`);

// 6. Funções soltas
console.log('6. Funções soltas');
ok(nomeDoEventoGenerico({ data: { type: 'pix' } }) === '', '`type` aninhado não é nome de evento');
ok(nomeDoEventoGenerico({ type: 'frase com espaço' }) === '', 'texto com espaço não é nome de evento');
ok(lerGenerico({ seller: { email: 'loja@loja-ficticia.invalid' } }).email === undefined, 'e-mail do vendedor não é do comprador');
ok(lerGenerico(null).email === undefined && lerGenerico([1, 2]).email === undefined && lerGenerico('x').email === undefined, 'entrada que não é objeto não quebra');
ok(ehPrimeiroDeposito({ approved_deposits: 1 }) === true, 'approved_deposits 1 = primeiro depósito');
ok(ehPrimeiroDeposito({ approved_deposits: 4 }) === undefined, 'approved_deposits 4 não é');
ok(ehPrimeiroDeposito({ data: { is_first_deposit: true } }) === true, 'marca is_first_deposit de outra origem');
ok(ehPrimeiroDeposito({ ftd: false }) === undefined && ehPrimeiroDeposito({}) === undefined, 'sem marca = não informado');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
