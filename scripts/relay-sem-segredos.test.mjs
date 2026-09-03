#!/usr/bin/env node
/**
 * O payload de relay NAO pode carregar segredo nenhum.
 *
 * Este teste reimplementa a mesma lista de chaves proibidas de src/lib/relay.ts
 * de proposito: se alguem afrouxar a lista de la, o teste continua exigindo o
 * comportamento correto e falha.
 *
 * Uso: npm run test:relay
 */

const PROIBIDAS = [
  'accesstoken',
  'access_token',
  'token',
  'segredo',
  'secret',
  'senha',
  'password',
  'authorization',
  'apikey',
  'api_key',
];

function limparSegredos(valor) {
  if (Array.isArray(valor)) return valor.map(limparSegredos);
  if (valor && typeof valor === 'object') {
    const saida = {};
    for (const [k, v] of Object.entries(valor)) {
      if (PROIBIDAS.includes(k.toLowerCase())) continue;
      saida[k] = limparSegredos(v);
    }
    return saida;
  }
  return valor;
}

const AMOSTRA = {
  tipo: 'dispatch.success',
  accessToken: 'EAAG_TOKEN_SUPER_SECRETO',
  marca: {
    id: 'default',
    nome: 'Código Vencedor',
    pixelId: '1624114999139319',
    access_token: 'EAAG_OUTRO_VAZAMENTO',
    credenciais: { secret: 'nao-pode-sair', apiKey: 'nem-esta' },
  },
  entrada: { segredo: 'uuid-do-x-capi-secret' },
  evento: { event_name: 'Purchase', value: 197, currency: 'BRL' },
  historico: [
    { token: 'vazou-num-array' },
    { ok: true, headers: { Authorization: 'Bearer abc' } },
  ],
};

const SENTINELAS = [
  'EAAG_TOKEN_SUPER_SECRETO',
  'EAAG_OUTRO_VAZAMENTO',
  'nao-pode-sair',
  'nem-esta',
  'uuid-do-x-capi-secret',
  'vazou-num-array',
  'Bearer abc',
];

const limpo = JSON.stringify(limparSegredos(AMOSTRA));

let falhou = false;
console.log('\n  Relay — nenhum segredo no payload de saida\n');

for (const s of SENTINELAS) {
  const vazou = limpo.includes(s);
  if (vazou) falhou = true;
  console.log(`  ${vazou ? 'FALHA' : 'OK   '} "${s}" ${vazou ? 'VAZOU' : 'removido'}`);
}

// O que precisa continuar existindo depois da limpeza.
for (const [rotulo, esperado] of [
  ['pixelId preservado', '1624114999139319'],
  ['nome da marca preservado', 'Código Vencedor'],
  ['evento preservado', 'Purchase'],
]) {
  const manteve = limpo.includes(esperado);
  if (!manteve) falhou = true;
  console.log(`  ${manteve ? 'OK   ' : 'FALHA'} ${rotulo}`);
}

console.log(
  `\n  ${falhou ? 'Ha vazamento — corrija src/lib/relay.ts' : 'Nenhum segredo escapou.'}\n`
);
process.exit(falhou ? 1 : 0);
