#!/usr/bin/env node
/**
 * Por que o evento está parado na Fila (`src/lib/motivo-da-fila.ts`).
 *
 * A frase segue a ordem do servidor (`resolverModoPorMarca`): regra em Fila,
 * depois chave do Pixel desligada, depois Pixel sem token. A suspeita de teste
 * não tem chave a ligar. O aviso de modo teste aparece em qualquer evento que
 * ainda vai sair para um Pixel com Código de teste.
 *
 * Pura: nenhuma rede, nenhum disco.
 *
 * Uso: npm run test:motivo-fila
 */
import { explicarFila, modoEfetivoDoItem } from '../src/lib/motivo-da-fila.ts';

let falhas = 0;
function ok(cond, nome, extra) {
  if (cond) console.log(`  OK    ${nome}`);
  else {
    falhas++;
    console.log(`  FALHA ${nome}${extra !== undefined ? `  ${JSON.stringify(extra)}` : ''}`);
  }
}

const PIXELS = [
  { id: 'pasion', nome: 'Pasion', testCode: 'TEST123' },
  { id: 'prod', nome: 'Produção', testCode: '' },
];

const base = { status: 'novo', modo: 'fila' };

console.log('-- motivos, na ordem do servidor --');
{
  const e = explicarFila(
    { ...base, modoPorMarca: { prod: 'fila' }, motivoFila: { prod: 'regra-em-fila' } },
    PIXELS
  );
  ok(e?.frase.includes('regra deste evento estava em Fila'), 'regra em Fila: a frase diz a regra', e);
  ok(e?.acao?.aba === 'regras', 'regra em Fila: a ação leva a Regras', e?.acao);
  ok(e?.avisoTeste === undefined, 'Pixel de produção: sem aviso de teste', e?.avisoTeste);
}
{
  const e = explicarFila(
    { ...base, modo: 'auto', modoPorMarca: { prod: 'fila' }, motivoFila: { prod: 'auto-do-pixel-desligado' } },
    PIXELS
  );
  ok(e?.frase.includes('envio automático do Pixel Produção estava desligado'), 'Pixel desligado: diz qual Pixel', e?.frase);
  ok(e?.acao?.aba === 'pixels', 'Pixel desligado: a ação leva a Pixels', e?.acao);
}
{
  const e = explicarFila(
    { ...base, modo: 'auto', modoPorMarca: { prod: 'fila' }, motivoFila: { prod: 'sem-token' } },
    PIXELS
  );
  ok(e?.frase.includes('sem token de acesso'), 'sem token: a frase diz o token', e?.frase);
  ok(e?.acao?.aba === 'pixels', 'sem token: a ação leva a Pixels', e?.acao);
}
{
  const e = explicarFila(
    {
      ...base,
      modo: 'auto',
      modoPorMarca: { prod: 'fila', pasion: 'fila' },
      motivoFila: { prod: 'auto-do-pixel-desligado', pasion: 'regra-em-fila' },
    },
    PIXELS
  );
  ok(e?.acao?.aba === 'regras', 'regra em Fila vem antes do Pixel desligado', e?.acao);
}

console.log('-- modo teste --');
{
  const e = explicarFila(
    { ...base, modoPorMarca: { pasion: 'fila' }, motivoFila: { pasion: 'regra-em-fila' } },
    PIXELS
  );
  ok(e?.avisoTeste?.includes('Pasion está em modo teste'), 'Pixel com Código de teste: aviso com o nome', e?.avisoTeste);
  ok(e?.avisoTeste?.includes('não conta na campanha'), 'aviso diz a consequência', e?.avisoTeste);
}

console.log('-- suspeita de teste --');
{
  const e = explicarFila(
    {
      ...base,
      modo: 'auto',
      modoPorMarca: { prod: 'auto' },
      motivoFila: {},
      resultados: [{ marcaId: 'prod', status: 'suspeita-de-teste' }],
      explicacaoDeTeste: 'O mesmo e-mail em 4 compras.',
    },
    PIXELS
  );
  ok(e?.frase.includes('parece teste: O mesmo e-mail em 4 compras'), 'suspeita: diz o porquê do detector', e?.frase);
  ok(e?.acao === undefined, 'suspeita: não há chave a ligar', e?.acao);
}

console.log('-- nada a explicar --');
ok(explicarFila({ status: 'disparado', modo: 'fila' }, PIXELS) === null, 'enviado: null');
ok(explicarFila({ status: 'ignorado', modo: 'fila' }, PIXELS) === null, 'ignorado: null');
ok(explicarFila({ status: 'novo', modo: 'ignorar' }, PIXELS) === null, 'regra em Ignorar: null');
ok(
  explicarFila({ status: 'novo', modo: 'auto', modoPorMarca: { prod: 'auto' }, motivoFila: {} }, PIXELS) === null,
  'saiu sozinho para Pixel de produção: null'
);
{
  const e = explicarFila({ status: 'novo', modo: 'fila' }, PIXELS);
  ok(e?.acao?.aba === 'regras', 'item antigo sem motivoFila, regra em Fila: mesma resposta', e);
}
{
  const e = explicarFila(
    { ...base, modoPorMarca: { sumiu: 'fila' }, motivoFila: { sumiu: 'auto-do-pixel-desligado' }, modo: 'auto' },
    PIXELS
  );
  ok(e && !e.frase.includes('sumiu') && !e.frase.includes('  '), 'Pixel apagado: sem id cru na frase', e?.frase);
}

console.log('-- selo de modo --');
ok(modoEfetivoDoItem({ modo: 'auto', modoPorMarca: { prod: 'fila' } }) === 'fila', 'regra auto, Pixel desligado: selo "fila"');
ok(modoEfetivoDoItem({ modo: 'auto', modoPorMarca: { prod: 'auto', b: 'fila' } }) === 'auto', 'algum Pixel saiu: selo "auto"');
ok(modoEfetivoDoItem({ modo: 'auto' }) === 'auto', 'item antigo: selo da regra');
ok(modoEfetivoDoItem({ modo: 'ignorar', modoPorMarca: { prod: 'fila' } }) === 'ignorar', 'ignorar continua ignorar');

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('\nMotivo da fila: tudo certo.');
