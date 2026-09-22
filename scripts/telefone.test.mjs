#!/usr/bin/env node
/**
 * Telefone -> E.164 com o pais descoberto sozinho (src/lib/telefone.ts).
 *
 * O que protege: a regra antiga so sabia colar "55" em numero de 10/11
 * digitos. Numero uruguaio ia sem DDI (a Meta nao acha ninguem) ou com 55
 * inventado (a Meta acha a pessoa errada). Aqui cada caso real de Brasil,
 * Uruguai e vizinhos tem de sair no DDI certo — e o que nao valida tem de
 * sair SEM DDI inventado.
 *
 * Nada de rede. Uso: npm run test:telefone
 */
import crypto from 'node:crypto';
import {
  detectarTelefone,
  normalizarTelefone,
  paisDoDominio,
  paisDaMoeda,
} from '../src/lib/telefone.ts';

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};
const igual = (obtido, esperado, texto) =>
  ok(obtido === esperado, texto, obtido === esperado ? '' : `(veio ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`);

console.log('\n  Telefone com pais automatico\n');

// 1. DDI escrito no numero.
igual(normalizarTelefone('+598 99 123 456'), '+59899123456', 'UY com + e espacos');
igual(normalizarTelefone('00598 99 123 456'), '+59899123456', 'UY com 00 na frente');
igual(normalizarTelefone('+55 (11) 98765-4321'), '+5511987654321', 'BR com + e mascara');
igual(normalizarTelefone('+54 9 11 2345-6789'), '+5491123456789', 'AR celular com + e o 9');
igual(normalizarTelefone('+1 415 555 2671'), '+14155552671', 'EUA com +1');
igual(normalizarTelefone('+33 6 12 34 56 78'), '+33612345678', 'Franca com +33');
igual(normalizarTelefone('+351 912 345 678'), '+351912345678', 'Portugal com +351');
igual(normalizarTelefone('+598 099 123 456'), '+59899123456', 'UY com + e o 0 de tronco no meio');

// 2. Sem DDI, Brasil (padrao, sem sinal nenhum).
igual(normalizarTelefone('11987654321'), '+5511987654321', 'BR celular SP so digitos');
igual(normalizarTelefone('(11) 98765-4321'), '+5511987654321', 'BR celular com mascara');
igual(normalizarTelefone('5511987654321'), '+5511987654321', 'BR ja com 55 sem +: nao duplica o 55');
igual(normalizarTelefone('55991234567'), '+5555991234567', 'BR com DDD 55 (Santa Maria/RS): o 55 e DDD, nao DDI');
igual(normalizarTelefone('51987654321'), '+5551987654321', 'BR DDD 51 sem sinal fica Brasil (tambem seria celular do Peru)');
igual(normalizarTelefone('1133334444'), '+551133334444', 'BR fixo SP sem sinal');

// 3. Sem DDI, pais pelos sinais.
igual(normalizarTelefone('099 123 456', { paisVisitante: 'UY' }), '+59899123456', 'UY com 0 de tronco, visitante no Uruguai');
igual(normalizarTelefone('99123456', { paisVisitante: 'UY' }), '+59899123456', 'UY 8 digitos, visitante no Uruguai');
igual(normalizarTelefone('2915 1234', { url: 'https://gtech.uy/contacto' }), '+59829151234', 'UY fixo pelo dominio .uy');
igual(normalizarTelefone('099123456', { url: 'https://www.gtech.com.uy/' }), '+59899123456', 'UY pelo dominio .com.uy');
igual(normalizarTelefone('099123456', { moeda: 'UYU' }), '+59899123456', 'UY pela moeda UYU');
igual(normalizarTelefone('011 15 2345-6789', { paisVisitante: 'AR' }), '+5491123456789', 'AR formato local antigo (0 + area + 15)');
igual(normalizarTelefone('0981 123456', { paisVisitante: 'PY' }), '+595981123456', 'Paraguai com 0');
igual(normalizarTelefone('1133334444', { paisVisitante: 'AR' }), '+541133334444', 'numero que existe nos dois paises: o sinal decide (AR)');

// 4. Sinal errado nao estraga numero de outro pais.
igual(normalizarTelefone('11987654321', { paisVisitante: 'UY', url: 'https://gtech.uy/' }), '+5511987654321', 'brasileiro no site uruguaio: UY nao valida, cai no Brasil');
igual(normalizarTelefone('5511987654321', { paisVisitante: 'US' }), '+5511987654321', 'BR com 55 visto dos EUA');
igual(normalizarTelefone('59899123456'), '+59899123456', 'UY com DDI sem + e sem sinal: Brasil nao valida, le como DDI');
igual(normalizarTelefone('59899123456', { paisVisitante: 'BR', moeda: 'BRL' }), '+59899123456', 'UY com DDI sem + e sinais do Brasil');
igual(normalizarTelefone('5491123456789'), '+5491123456789', 'AR com DDI sem +');
igual(normalizarTelefone('99123456'), '99123456', 'UY de 8 digitos SEM sinal nenhum: nao inventa DDI');

// 5. DDI informado a parte.
igual(normalizarTelefone('099123456', { ddi: '598' }), '+59899123456', 'DDI 598 separado, numero com 0 de tronco');
igual(normalizarTelefone('59899123456', { ddi: '598' }), '+59899123456', 'DDI separado e ja no numero: nao duplica');
igual(normalizarTelefone('11987654321', { ddi: '+55' }), '+5511987654321', 'DDI "+55" separado');

// 6. O que nao valida sai como veio, so digitos.
igual(normalizarTelefone('12345'), '12345', 'curto demais: digitos crus');
igual(normalizarTelefone('+11987654321'), '11987654321', '+ explicito invalido: nao reinterpreta como Brasil');
igual(normalizarTelefone('abc'), '', 'sem digito nenhum: vazio');
igual(normalizarTelefone(''), '', 'vazio: vazio');
igual(normalizarTelefone(undefined), '', 'undefined: vazio');

// 7. Hash passa intocado.
const hash = crypto.createHash('sha256').update('5511987654321').digest('hex');
igual(normalizarTelefone(hash), hash, 'SHA-256 passa intocado');
igual(normalizarTelefone(hash.toUpperCase()), hash, 'SHA-256 maiusculo desce para minusculo');

// 8. Idempotencia: a tag normaliza na entrada e o disparo normaliza de novo.
for (const [cru, sinais] of [
  ['099 123 456', { paisVisitante: 'UY' }],
  ['11987654321', {}],
  ['55991234567', {}],
  ['011 15 2345-6789', { paisVisitante: 'AR' }],
  ['99123456', {}],
]) {
  const uma = normalizarTelefone(cru, sinais);
  igual(normalizarTelefone(uma, { moeda: 'BRL' }), uma, `idempotente: ${cru} -> ${uma}`);
}
// O parser tira o + (so digitos). O disparo tem de reconhecer o DDI de novo.
igual(normalizarTelefone('59899123456', { url: 'https://gtech.uy/', moeda: 'BRL' }), '+59899123456', 'UY sem + depois do parser, com a moeda padrao BRL do parser');

// 9. Fonte da decisao.
igual(detectarTelefone('099123456', { paisVisitante: 'UY' }).fonte, 'pais-do-visitante', 'fonte: pais do visitante');
igual(detectarTelefone('099123456', { url: 'https://gtech.uy' }).fonte, 'dominio', 'fonte: dominio');
igual(detectarTelefone('11987654321').fonte, 'padrao', 'fonte: padrao Brasil');
igual(detectarTelefone('59899123456').fonte, 'ddi-sem-mais', 'fonte: DDI sem o +');
igual(detectarTelefone('+59899123456').pais, 'UY', 'pais: UY');

// 10. Dominio e moeda.
igual(paisDoDominio('https://gtech.uy/x'), 'UY', 'dominio .uy');
igual(paisDoDominio('https://loja.com.br'), 'BR', 'dominio .com.br');
igual(paisDoDominio('https://exemplo.co.uk'), 'GB', 'dominio .co.uk vira GB');
igual(paisDoDominio('https://startup.io'), undefined, '.io e generico: nao diz pais');
igual(paisDoDominio('https://empresa.co'), undefined, '.co sozinho e generico');
igual(paisDoDominio('https://empresa.com.co'), 'CO', '.com.co e Colombia');
igual(paisDoDominio('https://codigovencedor.com'), undefined, '.com nao diz pais');
igual(paisDoDominio('nao e url'), undefined, 'texto que nao e URL');
igual(paisDaMoeda('uyu'), 'UY', 'moeda uyu (minusculo)');
igual(paisDaMoeda('USD'), undefined, 'USD nao diz pais (loja uruguaia cobra em dolar)');

console.log(falhas ? `\n  ${falhas} FALHA(S)\n` : '\n  Tudo certo.\n');
process.exit(falhas ? 1 : 0);
