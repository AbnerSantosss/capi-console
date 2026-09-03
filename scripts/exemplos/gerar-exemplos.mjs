#!/usr/bin/env node
/**
 * Gera os payloads de exemplo usados para testar o parser e o webhook.
 *
 * Regra 1 do CLAUDE.md: NENHUM dado aqui e de pessoa real. Sao compradores
 * inventados. Os exemplos existem para exercitar o parser, nunca para disparar
 * evento de verdade na Meta (o filtro ehTesteInterno barra os que tem
 * @example.com / evt_preview; os "validos" so podem ir com test_event_code).
 *
 * As datas sao carimbadas na hora da geracao porque a Meta rejeita event_time
 * com mais de 7 dias — exemplo com data fixa vira lixo depois de uma semana.
 *
 *   node scripts/exemplos/gerar-exemplos.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const agora = new Date();
const iso = (minutosAtras) => new Date(agora.getTime() - minutosAtras * 60_000).toISOString();
const ms = agora.getTime();

const atribuicaoA = {
  utm: { source: 'facebook', medium: 'cpc', campaign: '52564275344761', term: '52567602614161', content: '52567985998561' },
  cookies: {
    fbp: `fb.1.${ms - 900_000}.2324207034`,
    fbc: `fb.1.${ms - 900_000}.IwZXh0bgNhZW0BMABhZGlkAasdEXEMPLO`,
    fbclid: 'IwZXh0bgNhZW0BMABhZGlkAasdEXEMPLO',
    gclid: null,
  },
  referrer: 'https://l.instagram.com/',
  landing_page: 'https://codigovencedor.com/?placement=Instagram_Feed&utm_source=facebook&utm_campaign=52564275344761',
  ip: '187.10.20.30',
  user_agent: 'Mozilla/5.0 (Linux; Android 16; SM-A566B Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/500.0.0.0;]',
};

// Comprador inventado, usado nos exemplos que DEVEM passar pelo filtro de teste.
const leadFicticio = { email: 'comprador.exemplo@dominio-ficticio.com.br', name: 'Maria Exemplo Da Silva', phone: '11988887777', phone_country_code: '55', birth_date: '1990-05-15' };
// Lead do botao "Testar" do xWinner: TEM que ser barrado pelo filtro.
const leadTeste = { email: 'lead@example.com', name: 'Lead Convidado', phone: '11988887777', birth_date: '1990-05-15' };

const produto = { id: '6', slug: 'codigo-vencedor', name: 'Acesso Código Vencedor' };

const exemplos = {
  'A-precheckout_opened.json': {
    event: 'precheckout_opened', event_id: `evt_${ms}_pre`, version: '1.0', created_at: iso(30),
    data: {
      precheckout_id: '812', payment_link_id: '17', product: produto, currency: 'BRL',
      occurred_at: iso(30), lead: leadFicticio, attribution: atribuicaoA,
    },
  },
  'A-checkout_session_opened.json': {
    event: 'checkout_session_opened', event_id: `evt_${ms}_ck`, version: '1.0', created_at: iso(25),
    data: {
      session_token: 'sess_exemplo_9f2a', order_id: '5', product: produto, amount: 1990, currency: 'BRL',
      opened_at: iso(25), lead: leadFicticio, attribution: atribuicaoA,
    },
  },
  'A-payment_generated.json': {
    event: 'payment_generated', event_id: `evt_${ms}_pix`, version: '1.0', created_at: iso(20),
    data: {
      order_id: '5', product: produto, amount: 1990, currency: 'BRL', payment_method: 'pix',
      generated_at: iso(20), lead: leadFicticio, attribution: atribuicaoA,
    },
  },
  // purchase_approved do botao "Testar": lead@example.com + evt_preview -> teste interno
  'A-purchase_approved.json': {
    event: 'purchase_approved', event_id: 'evt_preview_0000000000000', version: '1.0', created_at: iso(2),
    data: {
      purchase_id: '9', order_id: '5', product: produto, amount: 1990, currency: 'BRL', payment_method: 'pix',
      original_amount: 2490, discount: 500, coupon_code: 'BEMVINDO10', buyer: { external_id: '14' },
      approved_at: iso(2), lead: leadTeste, attribution: atribuicaoA,
    },
  },
  // purchase_approved "real" (ficticio, mas passa o filtro) e SEM attribution:
  // serve para provar a heranca de fbc/fbp vinda do precheckout pelo e-mail.
  'A-purchase_approved-sem-atribuicao.json': {
    event: 'purchase_approved', event_id: `evt_${ms}_buy`, version: '1.0', created_at: iso(1),
    data: {
      purchase_id: '10', order_id: '6', product: produto, amount: 1990, currency: 'BRL', payment_method: 'pix',
      buyer: { external_id: '15' }, approved_at: iso(1), lead: leadFicticio,
    },
  },
  'A-checkout_abandoned.json': {
    event: 'checkout_abandoned', event_id: `evt_${ms}_ab`, version: '1.0', created_at: iso(15),
    data: {
      order_id: '7', product: produto, amount: 1990, currency: 'BRL',
      abandoned_at: iso(15), lead: leadFicticio, attribution: atribuicaoA,
    },
  },
  'B-checkout.session.completed.json': {
    lead: { name: 'Maria Exemplo Da Silva', email: 'comprador.exemplo@dominio-ficticio.com.br', phone: '11988887777', taxId: '00000000191' },
    event: 'checkout.session.completed', method: 'pix', eventId: `b_${ms}_completed`,
    pricing: { couponCode: null, discountMinor: 0, originalAmountMinor: 2790 },
    currency: 'BRL', tracking: { cv_visit: 'exemplo-visit-0001' },
    paymentId: 'pay_exemplo_0001', sessionId: 'sess_exemplo_0001', occurredAt: iso(3),
    productIds: ['plan-4'], amountMinor: 2790, paymentStatus: 'paid',
    attribution: {
      utm: { term: '52567602614161', medium: 'paid', source: 'facebook', content: '52567985998561', campaign: '52564275344761' },
      cookies: { fbc: `fb.1.${ms - 900_000}.PAcGRvEXEMPLO`, fbp: `fb.1.${ms - 900_000}.2324207034`, fbclid: 'PAcGRvEXEMPLO', gclid: null },
      ipAddress: '::ffff:10.244.16.187',
      userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-A566B) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36',
      eventSourceUrl: 'https://codigovencedor.com/?placement=Instagram_Feed&ad_id=52567985998561&utm_source=facebook&utm_campaign=52564275344761',
    },
  },
};

for (const [nome, corpo] of Object.entries(exemplos)) {
  await fs.writeFile(path.join(DIR, nome), JSON.stringify(corpo, null, 2) + '\n', 'utf8');
  console.log('gerado:', nome);
}
console.log(`\n${Object.keys(exemplos).length} exemplos com datas de ${agora.toISOString()}`);
