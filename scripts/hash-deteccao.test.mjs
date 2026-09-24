#!/usr/bin/env node
/**
 * Deteccao de SHA-256 nos 5 campos de identidade (em/ph/fn/ln/external_id).
 *
 * Bug real corrigido: nao existia nenhuma deteccao de hash no repositorio.
 * Colar um payload ja hasheado (o formato que a propria Meta documenta)
 * fazia `montarEvento` (meta-capi.ts) hashear de novo — hash do hash — e o
 * `parser.ts` destruir o telefone antes disso (o replace(/\D+/g,'') tira as
 * letras do hex, sobram so digitos, e um "55" inventado entra na frente).
 * A Meta aceitava com HTTP 200; o dano so aparecia como EMQ baixo no
 * Gerenciador, nunca como erro na tela.
 *
 * Roda direto nos .ts pelo type stripping do Node 22+, igual aos demais
 * scripts de teste (ver scripts/_resolver-ts.mjs).
 *
 * Nenhum teste aqui chama rede: `enviarParaMeta` (fetch para
 * graph.facebook.com) nao e importado nem invocado.
 *
 * Uso: npm run test:hash-deteccao
 */
import crypto from 'node:crypto';
import { jaEhSha256 } from '../src/lib/hash-detect.ts';
import { sha256, normTelefone, montarEvento } from '../src/lib/meta-capi.ts';
import { parseWebhook } from '../src/lib/parser.ts';

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const agora = () => Math.floor(Date.now() / 1000);

console.log('\n  Deteccao de SHA-256 — nao hashear duas vezes, nao destruir hash\n');

const HASH_EMAIL = sha('a@b.com');
const HASH_TELEFONE = sha('5511987654321');
const HASH_NOME = sha('joao');
const HASH_SOBRENOME = sha('silva');
const HASH_EXTERNAL = sha('12345678900');

// 1. sha256() continua correto para entrada em claro.
ok(sha256('a@b.com') === HASH_EMAIL, 'sha256("a@b.com") produz o hash correto para entrada em claro');

// 2. jaEhSha256: 64 hex e reconhecido (minusculo, maiusculo e com espaco em volta).
ok(jaEhSha256(HASH_EMAIL) === true, '64 hex minusculo e reconhecido como hash');
ok(jaEhSha256(HASH_EMAIL.toUpperCase()) === true, '64 hex maiusculo tambem e reconhecido (a Meta documenta minusculo; o detector normaliza)');
ok(jaEhSha256(`  ${HASH_EMAIL}  `) === true, 'espaco em volta nao atrapalha a deteccao');

// 3. Falso-negativo proposital: 63/65 hex, ou caractere fora de [0-9a-f], e dado em claro.
ok(jaEhSha256(HASH_EMAIL.slice(0, 63)) === false, '63 hex e tratado como dado em claro (nao e hash)');
ok(jaEhSha256(HASH_EMAIL + 'a') === false, '65 hex e tratado como dado em claro (nao e hash)');
ok(jaEhSha256(HASH_EMAIL.slice(0, 63) + 'g') === false, '64 caracteres com "g" (fora de [0-9a-f]) e tratado como dado em claro');

// 4. montarEvento: os cinco campos passam INTACTOS quando ja sao hash — sem re-hash.
const eventoHash = montarEvento({
  event_name: 'Purchase',
  event_time: agora(),
  user: {
    email: HASH_EMAIL,
    phone: HASH_TELEFONE,
    firstName: HASH_NOME,
    lastName: HASH_SOBRENOME,
    externalId: HASH_EXTERNAL,
  },
});
ok(eventoHash.user_data.em[0] === HASH_EMAIL, 'email ja hasheado passa intacto, sem virar hash-do-hash', eventoHash.user_data.em[0]);
ok(
  eventoHash.user_data.ph[0] === HASH_TELEFONE,
  'telefone ja hasheado passa intacto — nao ganha "55" nem perde caracteres',
  eventoHash.user_data.ph[0]
);
ok(eventoHash.user_data.fn[0] === HASH_NOME, 'firstName ja hasheado passa intacto');
ok(eventoHash.user_data.ln[0] === HASH_SOBRENOME, 'lastName ja hasheado passa intacto');
ok(eventoHash.user_data.external_id[0] === HASH_EXTERNAL, 'externalId ja hasheado passa intacto');

// 5. montarEvento: entrada em claro continua sendo normalizada e hasheada como antes.
const eventoClaro = montarEvento({
  event_name: 'Purchase',
  event_time: agora(),
  user: {
    email: 'A@B.COM',
    phone: '11987654321',
    firstName: 'João',
    lastName: 'Silva',
    externalId: '12345678900',
  },
});
ok(eventoClaro.user_data.em[0] === sha256('a@b.com'), 'e-mail em claro normaliza (trim + lowercase) antes do hash');
ok(normTelefone('11987654321', true) === '5511987654321', 'normTelefone("11987654321") ainda vira "5511987654321"');
ok(
  eventoClaro.user_data.ph[0] === sha256('5511987654321'),
  'telefone em claro "11987654321" continua virando "5511987654321" antes do hash',
  eventoClaro.user_data.ph[0]
);
ok(eventoClaro.user_data.fn[0] === sha256('joão'), 'firstName em claro normaliza (maiusculo -> minusculo, acento preservado) antes do hash');
ok(eventoClaro.user_data.ln[0] === sha256('silva'), 'lastName em claro normaliza antes do hash');
ok(eventoClaro.user_data.external_id[0] === sha256('12345678900'), 'externalId em claro so e trimado e hasheado, como antes');

// 5b. Valor que so fica vazio depois de normalizar nao vira sha256('') — o campo fica fora, como antes.
const HASH_VAZIO = sha('');
const eventoLixo = montarEvento({
  event_name: 'Purchase',
  event_time: agora(),
  user: { email: 'a@b.com', phone: 'N/A', firstName: '-', lastName: '.' },
});
ok(eventoLixo.user_data.ph === undefined, 'telefone "N/A" fica fora do evento (nao vira hash de vazio)', JSON.stringify(eventoLixo.user_data.ph));
ok(eventoLixo.user_data.fn === undefined, 'firstName "-" fica fora do evento');
ok(eventoLixo.user_data.ln === undefined, 'lastName "." fica fora do evento');
ok(!JSON.stringify(eventoLixo.user_data).includes(HASH_VAZIO), 'nenhum campo leva o sha256 de string vazia');

// 6. fbc, fbp, ip e userAgent NUNCA sao hasheados — nem quando por acaso teriam 64 hex.
const eventoSemHash = montarEvento({
  event_name: 'Purchase',
  event_time: agora(),
  user: {
    fbc: 'fb.1.123456789.AbCdEf',
    fbp: 'fb.1.123456789.987654321',
    ip: '203.0.113.10',
    userAgent: 'Mozilla/5.0 Teste',
  },
});
ok(eventoSemHash.user_data.fbc === 'fb.1.123456789.AbCdEf', 'fbc continua sem hash');
ok(eventoSemHash.user_data.fbp === 'fb.1.123456789.987654321', 'fbp continua sem hash');
ok(eventoSemHash.user_data.client_ip_address === '203.0.113.10', 'client_ip_address continua sem hash');
ok(eventoSemHash.user_data.client_user_agent === 'Mozilla/5.0 Teste', 'client_user_agent continua sem hash');

// 7. parser.ts: telefone e nome ja hasheados nao sao destruidos antes de chegar em montarEvento.
const webhookComHash = JSON.stringify({
  event: 'precheckout_opened',
  event_id: 'evt_hash_teste',
  data: {
    lead: {
      email: HASH_EMAIL,
      name: HASH_NOME,
      phone: HASH_TELEFONE,
      phone_country_code: '55',
    },
  },
});
const parsedComHash = parseWebhook(webhookComHash);
ok(parsedComHash.fields.phone === HASH_TELEFONE, 'parser.ts: telefone ja hasheado sai intacto do parser (sem "55", sem perder digitos)', String(parsedComHash.fields.phone));
ok(parsedComHash.fields.firstName === HASH_NOME, 'parser.ts: nome ja hasheado sai intacto do parser (nao quebra por espaco)', String(parsedComHash.fields.firstName));
ok(parsedComHash.fields.lastName === undefined, 'parser.ts: nome hasheado nao gera lastName artificial');

// 8. parser.ts: telefone e nome em claro continuam funcionando como antes (formato A).
const webhookClaro = JSON.stringify({
  event: 'precheckout_opened',
  event_id: 'evt_claro_teste',
  data: {
    lead: {
      email: 'comprador@exemplo.com',
      name: 'Maria Exemplo Da Silva',
      phone: '11988887777',
      phone_country_code: '55',
    },
  },
});
const parsedClaro = parseWebhook(webhookClaro);
ok(parsedClaro.fields.phone === '5511988887777', 'parser.ts: telefone em claro continua juntando DDI + numero', String(parsedClaro.fields.phone));
ok(parsedClaro.fields.firstName === 'Maria', 'parser.ts: nome em claro continua quebrando por espaco (firstName)');
ok(parsedClaro.fields.lastName === 'Exemplo Da Silva', 'parser.ts: nome em claro continua quebrando por espaco (lastName)');

console.log(falhas === 0 ? '\n  Deteccao de SHA-256 funcionando.\n' : `\n  ${falhas} falha(s) na deteccao de SHA-256.\n`);
process.exit(falhas === 0 ? 0 : 1);
