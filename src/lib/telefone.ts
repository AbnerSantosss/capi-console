import {
  parsePhoneNumberFromString,
  isSupportedCountry,
  type CountryCode,
} from 'libphonenumber-js/max';

/**
 * Telefone em qualquer formato -> E.164, com o pais descoberto sozinho.
 *
 * POR QUE EXISTE: a regra antiga (`normTelefone` em meta-capi.ts) so sabia
 * uma coisa — "10 ou 11 digitos sem 55 na frente ganha 55". Servia para o
 * Codigo Vencedor, que so vende no Brasil. Com a Gtech (Uruguai) o console
 * passou a receber `099 123 456`, `+598 99 123 456` e numeros de outros
 * paises, e a regra velha ou deixava sem DDI (a Meta nao acha ninguem) ou
 * colava 55 num numero uruguaio (a Meta acha a pessoa ERRADA, ou ninguem).
 *
 * COMO DECIDE, em ordem, e so aceita o que a tabela oficial de numeracao do
 * pais considera VALIDO (libphonenumber, metadados completos "max" — os
 * "min" so olham o tamanho e aceitam 59899123456 como celular de Porto
 * Alegre):
 *
 *   1. Hash SHA-256 (64 hex) passa intocado: normalizar um hash o destroi.
 *   2. DDI escrito no proprio numero (`+598...`, `00598...`).
 *   3. DDI informado a parte (o `phone_country_code` do checkout).
 *   4. Paises sugeridos pelos sinais do evento, nesta ordem: pais do
 *      visitante (cabecalho CF-IPCountry da Cloudflare), dominio da pagina
 *      (`.uy`, `.com.br`...) e moeda (UYU, BRL...).
 *   5. Brasil, que e de onde vem a maior parte do volume.
 *   6. O numero inteiro lido como DDI + numero sem o `+` (59899123456).
 *
 * O passo 6 vem DEPOIS do Brasil de proposito: 51987654321 e celular de Porto
 * Alegre (DDD 51) e tambem e um celular valido do Peru (+51). Sem sinal
 * nenhum, o Brasil ganha.
 *
 * NADA BATEU: devolve os digitos como vieram. Nunca inventa DDI — um DDI
 * errado casa o evento com outra pessoa, o que e pior do que nao casar.
 */

/** O que o evento sabe sobre o pais do comprador, alem do proprio numero. */
export interface SinaisDoTelefone {
  /** DDI informado a parte, como o `phone_country_code` do checkout ("598"). */
  ddi?: string;
  /** Pais do visitante em ISO 3166 alfa-2 (cabecalho CF-IPCountry). */
  paisVisitante?: string;
  /** URL da pagina onde o evento aconteceu; o dominio sugere o pais. */
  url?: string;
  /** Moeda do pedido (ISO 4217); so as moedas de um pais so entram. */
  moeda?: string;
}

/** De onde saiu o pais do numero. Serve para teste e para diagnostico. */
export type FonteDoPais =
  | 'ddi-no-numero'
  | 'ddi-informado'
  | 'pais-do-visitante'
  | 'dominio'
  | 'moeda'
  | 'padrao'
  | 'ddi-sem-mais';

export interface TelefoneDetectado {
  /** E.164 com `+` (ex.: +59899123456), ou '' quando nada validou. */
  e164: string;
  pais?: CountryCode;
  fonte?: FonteDoPais;
}

/** Pais usado quando nenhum sinal resolve: e de onde vem a maior parte das vendas. */
const PAIS_PADRAO: CountryCode = 'BR';

const RE_SHA256 = /^[a-f0-9]{64}$/;

/**
 * Moeda -> pais, so para moedas de UM pais. USD e EUR ficam de fora de
 * proposito: loja uruguaia cobra em dolar, e "USD" empurraria o numero para
 * os Estados Unidos.
 */
const PAIS_DA_MOEDA: Readonly<Record<string, CountryCode>> = {
  BRL: 'BR',
  UYU: 'UY',
  ARS: 'AR',
  PYG: 'PY',
  CLP: 'CL',
  COP: 'CO',
  MXN: 'MX',
  PEN: 'PE',
  BOB: 'BO',
  GTQ: 'GT',
  CRC: 'CR',
  DOP: 'DO',
  GBP: 'GB',
};

/**
 * Dominios de pais que o mercado usa como generico (.io de startup, .co de
 * "company", .tv de video...). Um site .io nao diz nada sobre o comprador.
 * Com segundo nivel de pais (`.com.co`) o dominio volta a valer.
 */
const TLD_GENERICO = new Set([
  'ac', 'ai', 'cc', 'co', 'fm', 'gg', 'gl', 'im', 'io', 'la', 'ly', 'me',
  'ms', 'nu', 'sh', 'so', 'tk', 'to', 'tv', 'vc', 'ws',
]);

const SEGUNDO_NIVEL_DE_PAIS = new Set(['com', 'net', 'org', 'gob', 'gov', 'edu', 'co']);

function paisSuportado(codigo: string | undefined): CountryCode | undefined {
  const c = String(codigo || '').trim().toUpperCase();
  if (c.length !== 2) return undefined;
  const ajustado = c === 'UK' ? 'GB' : c;
  return isSupportedCountry(ajustado) ? (ajustado as CountryCode) : undefined;
}

/** Pais sugerido pelo dominio da pagina (`https://gtech.uy/...` -> UY). */
export function paisDoDominio(url: string | undefined): CountryCode | undefined {
  let host = '';
  try {
    host = new URL(String(url || '')).hostname.toLowerCase().replace(/\.+$/, '');
  } catch {
    return undefined;
  }
  const partes = host.split('.');
  if (partes.length < 2) return undefined;
  const tld = partes[partes.length - 1];
  if (TLD_GENERICO.has(tld)) {
    const segundo = partes.length >= 3 ? partes[partes.length - 2] : '';
    if (!SEGUNDO_NIVEL_DE_PAIS.has(segundo)) return undefined;
  }
  return paisSuportado(tld);
}

/** Pais sugerido pela moeda do pedido, quando a moeda e de um pais so. */
export function paisDaMoeda(moeda: string | undefined): CountryCode | undefined {
  return PAIS_DA_MOEDA[String(moeda || '').trim().toUpperCase()];
}

/** Numero valido lido como internacional, ou undefined. */
function internacional(comMais: string): { e164: string; pais?: CountryCode } | undefined {
  const n = parsePhoneNumberFromString(comMais);
  if (!n || !n.isValid()) return undefined;
  return { e164: n.number, pais: n.country };
}

/** Numero valido lido como nacional do pais dado, ou undefined. */
function nacional(digitos: string, pais: CountryCode): { e164: string; pais?: CountryCode } | undefined {
  const n = parsePhoneNumberFromString(digitos, pais);
  if (!n || !n.isValid()) return undefined;
  return { e164: n.number, pais: n.country };
}

/**
 * Descobre o pais e devolve o E.164. `e164` vazio quando nada validou (o
 * chamador decide o que fazer com o numero cru; `normalizarTelefone` devolve
 * os digitos).
 */
export function detectarTelefone(bruto: string, sinais: SinaisDoTelefone = {}): TelefoneDetectado {
  const texto = String(bruto || '').trim();
  const digitos = texto.replace(/\D+/g, '');
  if (!digitos) return { e164: '' };

  // 2. DDI escrito no numero. Com `+` o DDI e explicito: se nao valida, nao
  // tentamos reinterpretar como numero nacional de outro pais.
  if (texto.startsWith('+')) {
    const r = internacional('+' + digitos);
    return r ? { ...r, fonte: 'ddi-no-numero' } : { e164: '' };
  }
  if (digitos.startsWith('00')) {
    const r = internacional('+' + digitos.slice(2));
    if (r) return { ...r, fonte: 'ddi-no-numero' };
  }

  // 3. DDI informado a parte. O checkout as vezes ja manda o numero com o DDI
  // na frente E o DDI separado; nao duplica.
  const ddi = String(sinais.ddi || '').replace(/\D+/g, '');
  if (ddi) {
    const r = internacional(
      '+' + (digitos.startsWith(ddi) ? digitos : ddi + digitos.replace(/^0+/, ''))
    );
    if (r) return { ...r, fonte: 'ddi-informado' };
  }

  // 4 e 5. Paises sugeridos, sem repetir, e o Brasil no fim.
  const candidatos: Array<[CountryCode | undefined, FonteDoPais]> = [
    [paisSuportado(sinais.paisVisitante), 'pais-do-visitante'],
    [paisDoDominio(sinais.url), 'dominio'],
    [paisDaMoeda(sinais.moeda), 'moeda'],
    [PAIS_PADRAO, 'padrao'],
  ];
  const tentados = new Set<CountryCode>();
  for (const [pais, fonte] of candidatos) {
    if (!pais || tentados.has(pais)) continue;
    tentados.add(pais);
    const r = nacional(digitos, pais);
    if (r) return { ...r, fonte };
  }

  // 6. DDI + numero sem o `+`.
  const r = internacional('+' + digitos);
  if (r) return { ...r, fonte: 'ddi-sem-mais' };

  return { e164: '' };
}

/**
 * Telefone pronto para guardar e para hashear.
 *
 *   - hash SHA-256      -> o mesmo hash, em minusculo
 *   - numero valido     -> E.164 com `+` (+5511987654321, +59899123456)
 *   - numero nao valido -> so os digitos, sem DDI inventado
 *
 * Idempotente: normalizar o resultado de novo devolve o mesmo valor, entao
 * pode ser chamado na entrada (tag) e de novo no disparo sem risco.
 */
export function normalizarTelefone(bruto: string, sinais: SinaisDoTelefone = {}): string {
  const texto = String(bruto || '').trim();
  if (!texto) return '';
  if (RE_SHA256.test(texto.toLowerCase())) return texto.toLowerCase();
  const r = detectarTelefone(texto, sinais);
  return r.e164 || texto.replace(/\D+/g, '');
}
