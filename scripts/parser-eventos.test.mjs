#!/usr/bin/env node
/**
 * O parser decide QUAL evento vai para a Meta. Errar aqui significa mandar
 * conversao que nao aconteceu (checkout abandonado virando InitiateCheckout)
 * ou perder venda de verdade. Este teste trava o comportamento da tabela
 * MAPA_EVENTOS_ORIGEM e dos campos do formato A do xWinner.
 *
 * Roda direto no .ts pelo type stripping do Node 22+ (nenhuma dependencia nova).
 *
 * Uso: npm run test:parser
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWebhook, mapearEventoOrigem, ehTesteInterno, MAPA_EVENTOS_ORIGEM } from '../src/lib/parser.ts';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const exemplo = (nome) => fs.readFileSync(path.join(DIR, 'exemplos', nome), 'utf8');

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  Parser — classificacao de eventos e campos do formato A\n');

// 1. Tabela: os nomes perigosos NUNCA podem virar conversao
for (const nome of ['checkout_abandoned', 'checkout_lead_abandoned', 'precheckout_expired', 'purchase_refunded', 'chargeback_opened', 'checkout.session.expired']) {
  const m = mapearEventoOrigem(nome);
  ok(m.eventoMeta === null && m.conhecido, `${nome} -> ignorar`);
}

// 2. Tabela: os que sao conversao de verdade
const esperados = {
  precheckout_opened: 'Lead',
  checkout_session_opened: 'InitiateCheckout',
  payment_generated: 'AddPaymentInfo',
  checkout_card_attempted: 'AddPaymentInfo',
  purchase_approved: 'Purchase',
  'checkout.session.completed': 'Purchase',
  'payment.paid': 'Purchase',
  'pre.checkout.session.opened': 'Lead',
  'checkout.pix.generated': 'AddPaymentInfo',
};
for (const [nome, evento] of Object.entries(esperados)) {
  const m = mapearEventoOrigem(nome);
  ok(m.eventoMeta === evento && m.conhecido, `${nome} -> ${evento}`, `(veio ${m.eventoMeta})`);
}

// 3. Catalogo completo dos 24 eventos do formato A presente na tabela
const catalogo24 = ['user_registered','onboarding_completed','precheckout_opened','precheckout_expired','checkout_session_opened','payment_generated','checkout_card_attempted','checkout_abandoned','checkout_lead_abandoned','purchase_approved','purchase_refunded','chargeback_opened','subscription_started','subscription_renewed','subscription_cancelled','subscription_expired','affiliate_registered','affiliate_approved','commission_released','commission_reversed','withdrawal_requested','withdrawal_paid','ebook_completed','tool_used'];
const faltando = catalogo24.filter((e) => !Object.prototype.hasOwnProperty.call(MAPA_EVENTOS_ORIGEM, e));
ok(faltando.length === 0, 'os 24 eventos do catalogo estao na tabela', faltando.join(','));

// 4. Nome desconhecido com palavra negativa nao vira conversao
ok(mapearEventoOrigem('pedido_cancelado_pelo_cliente').eventoMeta === null, 'nome novo com "cancel" -> ignorar');
ok(mapearEventoOrigem('purchase_completed_v2').eventoMeta === 'Purchase', 'nome novo com "completed" -> Purchase (heuristica)');
ok(mapearEventoOrigem('purchase_completed_v2').conhecido === false, 'heuristica marcada como nao-conhecida');

console.log('');

// 5. Formato A — purchase_approved do botao "Testar" do xWinner
const a = parseWebhook(exemplo('A-purchase_approved.json'));
ok(a.eventName === 'Purchase', 'A purchase_approved -> Purchase');
ok(a.eventoOrigem === 'purchase_approved', 'A guarda o nome de origem');
ok(a.ignorar === false, 'A purchase_approved nao e ignorado pela tabela');
ok(a.fields.value === '19.90', 'A amount 1990 centavos -> 19.90', String(a.fields.value));
ok(a.fields.ip === '187.10.20.30', 'A le attribution.ip (formato A)', String(a.fields.ip));
ok(String(a.fields.fbc).startsWith('fb.1.'), 'A le fbc do cookie');
ok(a.fields.externalId === '14', 'A cai para buyer.external_id sem taxId', String(a.fields.externalId));
ok(ehTesteInterno(a.fields, a.fields.eventId) === true, 'A lead@example.com + evt_preview -> teste interno');

// 6. Formato A — DDI separado
const pre = parseWebhook(exemplo('A-precheckout_opened.json'));
ok(pre.eventName === 'Lead', 'A precheckout_opened -> Lead');
ok(pre.fields.phone === '5511988887777', 'A junta phone_country_code + phone', String(pre.fields.phone));
ok(ehTesteInterno(pre.fields, pre.fields.eventId) === false, 'comprador ficticio valido passa pelo filtro');

// 7. Formato A — PIX gerado (antes ficava sem evento nenhum)
const pix = parseWebhook(exemplo('A-payment_generated.json'));
ok(pix.eventName === 'AddPaymentInfo', 'A payment_generated -> AddPaymentInfo', String(pix.eventName));

// 8. Formato A — abandono nunca vira conversao
const ab = parseWebhook(exemplo('A-checkout_abandoned.json'));
ok(ab.ignorar === true, 'A checkout_abandoned marcado como ignorar');
ok(ab.eventName === undefined, 'A checkout_abandoned nao recebe evento Meta', String(ab.eventName));

// 9. Formato B continua funcionando
const b = parseWebhook(exemplo('B-checkout.session.completed.json'));
ok(b.eventName === 'Purchase', 'B checkout.session.completed -> Purchase');
ok(b.fields.value === '27.90', 'B amountMinor 2790 -> 27.90', String(b.fields.value));
ok(String(b.fields.eventId).includes('_completed'), 'B usa o eventId canonico do webhook');
ok(b.fields.ip === undefined, 'B descarta IP interno ::ffff:10.244.x', String(b.fields.ip));
ok(b.fields.externalId === '00000000191', 'B usa taxId como external_id');

// 10. Compra sem attribution: o parser nao inventa nada (a heranca e da F2)
const semAttr = parseWebhook(exemplo('A-purchase_approved-sem-atribuicao.json'));
ok(semAttr.eventName === 'Purchase', 'A sem attribution ainda e Purchase');
ok(semAttr.fields.fbc === undefined && semAttr.fields.fbp === undefined, 'A sem attribution fica sem fbc/fbp (herda depois)');

console.log(falhas === 0 ? '\n  Parser classificando certo.\n' : `\n  ${falhas} falha(s) no parser.\n`);
process.exit(falhas === 0 ? 0 : 1);
