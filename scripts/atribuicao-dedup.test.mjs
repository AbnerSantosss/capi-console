#!/usr/bin/env node
/**
 * Duas travas que, se quebrarem, custam dinheiro de verdade:
 *
 *  1. HERANCA DE ATRIBUICAO — o Purchase do PIX chega sem fbc/fbp (o comprador
 *     pagou no app do banco e nunca voltou ao navegador). Sem herdar o perfil
 *     do pre-checkout, a venda vai para a Meta orfa e nenhuma campanha recebe
 *     o credito. Este teste prova que o fbc atravessa do Lead ate a compra.
 *
 *  2. DEDUPLICACAO — a Meta deduplica Pixel x CAPI, mas nao CAPI x CAPI. Um
 *     retry da plataforma contaria a mesma compra duas vezes e inflaria o ROAS.
 *
 * Roda num diretorio temporario (nunca toca os logs reais) e sem rede.
 *
 * Uso: npm run test:atribuicao
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-teste-'));
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raiz = process.cwd();
// Os modulos resolvem os caminhos no import, entao a troca vem antes.
process.chdir(tmp);

const { guardarPerfil, enriquecer } = await import(
  new URL('../src/lib/perfil-atribuicao.ts', import.meta.url).href
);
const { jaEnviado, marcarEnviado, _limparCache } = await import(
  new URL('../src/lib/dedup.ts', import.meta.url).href
);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  Heranca de atribuicao e deduplicacao\n');

/* ---------------- 1. Heranca ---------------- */

// Pre-checkout: e o unico evento que traz o fbc.
await guardarPerfil({
  email: 'comprador.teste@dominio-ficticio.com.br',
  phone: '5511988887777',
  fbc: 'fb.1.1788449825431.EXEMPLO',
  fbp: 'fb.1.1788449825430.2324207034',
  ip: '187.10.20.30',
  userAgent: 'Mozilla/5.0 (Android)',
  sourceUrl: 'https://codigovencedor.com/?utm_campaign=52564275344761',
});

// Purchase do PIX: so tem e-mail, valor e pedido.
const compra = { email: 'comprador.teste@dominio-ficticio.com.br', value: '27.90', orderId: '6' };
const { campos, herdados } = await enriquecer(compra);

ok(campos.fbc === 'fb.1.1788449825431.EXEMPLO', 'a compra herda o fbc do pre-checkout');
ok(campos.fbp && campos.ip && campos.userAgent, 'herda tambem fbp, ip e user agent');
ok(herdados.includes('fbc'), 'a lista de herdados registra o fbc', herdados.join(','));
ok(campos.value === '27.90', 'o valor da propria compra e preservado');

// Pelo telefone tambem, quando o e-mail muda (comprou com outro e-mail).
const porTelefone = await enriquecer({ phone: '11988887777', value: '27.90' });
ok(porTelefone.campos.fbc === 'fb.1.1788449825431.EXEMPLO', 'acha o perfil pelo telefone sem DDI');

// O que o evento ja trouxe NUNCA e sobrescrito.
const proprio = await enriquecer({
  email: 'comprador.teste@dominio-ficticio.com.br',
  fbc: 'fb.1.9999999999999.DO_PROPRIO_EVENTO',
});
ok(proprio.campos.fbc === 'fb.1.9999999999999.DO_PROPRIO_EVENTO', 'o fbc do proprio evento vence o perfil');

// Comprador desconhecido nao herda nada de ninguem.
const outro = await enriquecer({ email: 'outra.pessoa@dominio-ficticio.com.br' });
ok(!outro.campos.fbc && outro.herdados.length === 0, 'comprador sem perfil nao herda dado de terceiro');

console.log('');

/* ---------------- 2. Deduplicacao ---------------- */

const PIXEL_A = '1624114999139319';
const PIXEL_B = '9999999999999';

ok((await jaEnviado(PIXEL_A, 'Purchase', 'evt_1')) === false, 'event_id novo nao aparece como enviado');
await marcarEnviado(PIXEL_A, 'Purchase', 'evt_1');
ok((await jaEnviado(PIXEL_A, 'Purchase', 'evt_1')) === true, 'o mesmo event_id no mesmo pixel e bloqueado');
ok((await jaEnviado(PIXEL_B, 'Purchase', 'evt_1')) === false, 'outro pixel ainda pode receber (multi-marca)');
ok((await jaEnviado(PIXEL_A, 'Lead', 'evt_1')) === false, 'outro evento do mesmo comprador nao e bloqueado');
ok((await jaEnviado(PIXEL_A, 'Purchase', undefined)) === false, 'sem event_id nao bloqueia');

// O indice se reconstroi do disparos.jsonl: so linhas que a Meta aceitou contam.
_limparCache();
fs.writeFileSync(
  path.join(tmp, 'logs', 'disparos.jsonl'),
  [
    JSON.stringify({ pixelId: PIXEL_A, eventName: 'Purchase', eventId: 'evt_aceito', httpStatus: 200, eventsReceived: 1 }),
    JSON.stringify({ pixelId: PIXEL_A, eventName: 'Purchase', eventId: 'evt_recusado', httpStatus: 400, eventsReceived: 0 }),
    '{linha corrompida',
  ].join('\n') + '\n',
  'utf8'
);
ok((await jaEnviado(PIXEL_A, 'Purchase', 'evt_aceito')) === true, 'reconstroi o indice do log de disparos');
ok((await jaEnviado(PIXEL_A, 'Purchase', 'evt_recusado')) === false, 'evento recusado pela Meta pode ser reenviado');

process.chdir(raiz);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(falhas === 0 ? '\n  Atribuicao herdada e dedup travando certo.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
