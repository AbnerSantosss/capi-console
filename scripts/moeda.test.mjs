// Moeda e dado sensível: os dois pontos que derrubaram ou sujaram a caixa de
// entrada em 06/10/2026 (UX-01 e UX-14). Roda sem servidor.
import { normalizarMoeda, formatarDinheiro, ehCodigoDeMoeda } from '../src/lib/moeda.ts';
import { limparPayload, MARCA_REMOVIDO } from '../src/lib/payload-sensivel.ts';
import { readFileSync } from 'node:fs';

let falhas = 0;
const ok = (cond, nome, detalhe = '') => {
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${nome}${cond || !detalhe ? '' : ' -> ' + detalhe}`);
};

// 1. Normalização
const casos = [
  ['R$', 'BRL'],
  ['BRL', 'BRL'],
  ['brl', 'BRL'],
  [' brl ', 'BRL'],
  ['', 'BRL'],
  [null, 'BRL'],
  [undefined, 'BRL'],
  ['US$', 'USD'],
  ['reais', 'BRL'],
  ['€', 'EUR'],
  ['UYU', 'UYU'],
  ['XYZ', null],
  ['$', null],
  ['pesos', null],
  [10, null],
  [{}, null],
];
for (const [entrada, esperado] of casos) {
  const r = normalizarMoeda(entrada);
  ok(r.codigo === esperado, `normalizarMoeda(${JSON.stringify(entrada)}) -> ${esperado}`, String(r.codigo));
}
ok(normalizarMoeda('R$').convertida === true, '"R$" fica marcado como convertido');
ok(normalizarMoeda(undefined).ausente === true, 'moeda ausente fica marcada como ausente');
ok(normalizarMoeda('XYZ').reconhecida === false && normalizarMoeda('XYZ').original === 'XYZ', 'moeda desconhecida guarda o texto original');
ok(ehCodigoDeMoeda('BRL') && !ehCodigoDeMoeda('XYZ') && !ehCodigoDeMoeda('R$'), 'ehCodigoDeMoeda separa BRL de XYZ e de R$');

// 2. Formatação: nunca lança, com nada
const espaco = (s) => s.replace(/ /g, ' ');
for (const moeda of ['R$', 'BRL', 'brl', '', null, undefined, 'US$', 'XYZ', '$', 'qualquer coisa', 42, {}]) {
  let saida = null;
  try {
    saida = formatarDinheiro(10, moeda);
  } catch {
    saida = null;
  }
  ok(typeof saida === 'string' && saida.length > 0, `formatarDinheiro(10, ${JSON.stringify(moeda)}) não lança`, String(saida));
}
ok(espaco(formatarDinheiro(10, 'R$')) === 'R$ 10,00', '10 em "R$" aparece como R$ 10,00', formatarDinheiro(10, 'R$'));
ok(espaco(formatarDinheiro(10, undefined)) === 'R$ 10,00', '10 sem moeda aparece como R$ 10,00');
ok(espaco(formatarDinheiro(10, 'XYZ')) === '10,00 XYZ', 'moeda desconhecida mostra o texto original', formatarDinheiro(10, 'XYZ'));
ok(formatarDinheiro(undefined, 'BRL') === '—' && formatarDinheiro(NaN, 'BRL') === '—', 'valor ausente vira travessão');
ok(espaco(formatarDinheiro(1234.5, 'USD')).includes('1.234,50'), 'número em pt-BR também em outra moeda', formatarDinheiro(1234.5, 'USD'));

// 3. Nenhuma tela chama o Intl de moeda por conta própria
const TELAS = [
  'src/components/integrations/InboxList.tsx',
  'src/components/painel/ListaDePessoas.tsx',
  'src/components/painel/PainelDeEventos.tsx',
  'src/components/dispatch/ConfirmDialog.tsx',
  'src/lib/attribution-log.ts',
];
for (const f of TELAS) {
  const t = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  ok(!/style:\s*'currency'/.test(t), `${f} formata dinheiro só pelo formatarDinheiro`);
}

// 4. Dado sensível não é gravado (fixtures fictícios)
const criado = JSON.parse(readFileSync(new URL('./exemplos/G-DEPOSIT_CREATED.json', import.meta.url), 'utf8'));
const limpo = limparPayload(criado);
const textoLimpo = JSON.stringify(limpo);
ok(!textoLimpo.includes('TOKEN-FICTICIO-NAO-GRAVAR'), 'user_token não é gravado');
ok(!textoLimpo.includes('QRCODE-FICTICIO-NAO-GRAVAR'), 'qrcode não é gravado');
ok(limpo.user_token === MARCA_REMOVIDO && limpo.qrcode === MARCA_REMOVIDO, 'a chave fica, com o aviso de removido');
ok(limpo.user_document === '*********00', 'documento fica só com o final', String(limpo.user_document));
ok(limpo.user_email === criado.user_email && limpo.user_phone === criado.user_phone, 'e-mail e telefone continuam (o disparo relê o payload)');
ok(limpo.tracker.fbp === criado.tracker.fbp && limpo.deposit_id === 900001 && limpo.amount === 10, 'fbp, pedido e valor continuam');
ok(criado.user_token === 'TOKEN-FICTICIO-NAO-GRAVAR', 'o original não é alterado');
const xw = limparPayload({ data: { lead: { taxId: '00000000000', email: 'a@exemplo.test' }, card: { token: 'tok_x' }, senha: '123' } });
ok(xw.data.lead.taxId === '00000000000', 'taxId do xWinner fica (vira external_id no disparo manual)');
ok(xw.data.card.token === MARCA_REMOVIDO && xw.data.senha === MARCA_REMOVIDO, 'token e senha aninhados saem');
ok(limparPayload(null) === null && limparPayload('texto') === 'texto' && Array.isArray(limparPayload([{ api_key: 'k' }])), 'null, texto e lista não quebram');

console.log(falhas === 0 ? '\n  Moeda e dado sensível certos.' : `\n  ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
