#!/usr/bin/env node
/**
 * Testes automatizados da elegibilidade para disparo em lote (src/lib/inbox-lote.ts).
 *
 * O que está sendo protegido aqui é dinheiro: um item que entra no lote sem
 * poder manda evento DUPLICADO ou evento de TESTE para a Meta, e evento enviado
 * não se apaga (regras 1 e 4 do CLAUDE.md). Por isso todo caso duvidoso é
 * testado pelo lado do "fica de fora".
 *
 * Cobre:
 *  1. Item normal e elegível
 *  2. Já enviado (status 'disparado' e resultados gravados) -> 'ja-enviado'
 *  3. Ignorado (status, modo e motivoIgnorar) -> 'ignorado'
 *  4. Teste interno e ping da plataforma -> 'teste-interno'
 *  5. Precedência quando mais de um motivo casa
 *  6. Campos que NÃO excluem (carregado, fila, sem fbc, desconhecido)
 *  7. separarParaLote: lista mista, lista vazia, ordem e identidade preservadas
 *
 * Uso: npm run test:inbox-lote
 */

const { motivoInelegivel, elegivelParaLote, separarParaLote } = await import(
  new URL('../src/lib/inbox-lote.ts', import.meta.url).href
);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

/** Item de venda real na fila: o único formato que PODE entrar num lote. */
const normal = (extra = {}) => ({
  id: 'i-' + Math.random().toString(36).slice(2, 8),
  evento: 'Purchase',
  eventoMeta: 'Purchase',
  status: 'novo',
  modo: 'fila',
  ...extra,
});

console.log('\n  Elegibilidade para disparo em lote\n');

/* ---------------- 1. Item normal ---------------- */
ok(motivoInelegivel(normal()) === null, 'item novo na fila nao tem motivo de exclusao');
ok(elegivelParaLote(normal()) === true, 'item novo na fila e elegivel');
ok(elegivelParaLote({ id: 'so-id' }) === true, 'item minimo (so id) e elegivel: nenhuma marca de bloqueio');

/* ---------------- 2. Ja enviado ---------------- */
ok(motivoInelegivel(normal({ status: 'disparado' })) === 'ja-enviado', "status 'disparado' -> ja-enviado");
ok(
  motivoInelegivel(normal({ resultados: [{ marcaId: 'default', status: 'ok' }] })) === 'ja-enviado',
  'resultados gravados -> ja-enviado mesmo com status ainda em novo'
);
ok(
  motivoInelegivel(normal({ status: 'disparado', resultados: [{ marcaId: 'default', status: 'erro' }] })) === 'ja-enviado',
  'resultado com ERRO tambem barra: o evento saiu, reenviar em lote e duplicar'
);
ok(motivoInelegivel(normal({ resultados: [] })) === null, 'resultados vazio nao barra (nada foi enviado ainda)');
ok(elegivelParaLote(normal({ status: 'disparado' })) === false, 'item ja disparado nao e elegivel');

/* ---------------- 3. Ignorado ---------------- */
ok(motivoInelegivel(normal({ status: 'ignorado' })) === 'ignorado', "status 'ignorado' -> ignorado");
ok(motivoInelegivel(normal({ modo: 'ignorar' })) === 'ignorado', "modo 'ignorar' -> ignorado");
ok(motivoInelegivel(normal({ motivoIgnorar: 'regra' })) === 'ignorado', 'motivoIgnorar preenchido -> ignorado');
ok(
  motivoInelegivel(normal({ status: 'ignorado', modo: 'ignorar', motivoIgnorar: 'sem-equivalente' })) === 'ignorado',
  'as tres marcas juntas continuam dando ignorado'
);
ok(
  motivoInelegivel({ id: 'nao-lido', status: 'ignorado', modo: 'ignorar', motivoIgnorar: 'nao-lido' }) === 'ignorado',
  'corpo nao lido (sem evento nenhum) ja chega como ignorado — nao precisa de motivo proprio'
);
ok(motivoInelegivel(normal({ motivoIgnorar: '' })) === null, 'motivoIgnorar vazio nao barra');

/* ---------------- 4. Teste ---------------- */
ok(motivoInelegivel(normal({ testeInterno: true })) === 'teste-interno', 'testeInterno -> teste-interno');
ok(motivoInelegivel(normal({ testePlataforma: true })) === 'teste-interno', 'testePlataforma (ping do botao Testar) -> teste-interno');
ok(motivoInelegivel(normal({ testeInterno: false, testePlataforma: false })) === null, 'as flags em false nao barram');
ok(elegivelParaLote(normal({ testeInterno: true })) === false, 'acesso de teste da equipe nunca entra em lote (regra 4)');

/* ---------------- 5. Precedencia ---------------- */
ok(
  motivoInelegivel(normal({ status: 'disparado', testeInterno: true, modo: 'ignorar' })) === 'ja-enviado',
  'ja-enviado tem precedencia de exibicao sobre ignorado e teste-interno'
);
ok(
  motivoInelegivel(normal({ status: 'ignorado', testeInterno: true })) === 'ignorado',
  'ignorado tem precedencia de exibicao sobre teste-interno'
);

/* ---------------- 6. O que NAO exclui ---------------- */
ok(motivoInelegivel(normal({ status: 'carregado' })) === null, "status 'carregado' (item aberto na tela) NAO exclui");
ok(motivoInelegivel(normal({ modo: 'auto' })) === null, "modo 'auto' nao exclui (pode ter ficado na fila pela trava do Pixel)");
ok(motivoInelegivel(normal({ conhecido: false })) === null, 'evento fora do catalogo nao e motivo de exclusao deste modulo');
ok(motivoInelegivel(normal({ emq: 2.5, temFbc: false, temFbp: false })) === null, 'EMQ baixo e sem cookies nao exclui: venda ruim ainda e venda');

/* ---------------- 7. separarParaLote ---------------- */
const vazio = separarParaLote([]);
ok(vazio.elegiveis.length === 0 && vazio.excluidos.length === 0, 'lista vazia devolve as duas listas vazias');
ok(Array.isArray(vazio.elegiveis) && Array.isArray(vazio.excluidos), 'lista vazia ainda devolve arrays de verdade');

const a = normal({ id: 'a' });
const b = normal({ id: 'b', status: 'disparado' });
const c = normal({ id: 'c', modo: 'ignorar' });
const d = normal({ id: 'd', testeInterno: true });
const e = normal({ id: 'e', status: 'carregado' });
const f = normal({ id: 'f', resultados: [{ marcaId: 'default', status: 'ok' }] });
const { elegiveis, excluidos } = separarParaLote([a, b, c, d, e, f]);

ok(elegiveis.length === 2, 'lista mista: 2 elegiveis', `(${elegiveis.map((i) => i.id).join(',')})`);
ok(elegiveis[0] === a && elegiveis[1] === e, 'elegiveis saem na ordem original e sao os MESMOS objetos');
ok(excluidos.length === 4, 'lista mista: 4 excluidos');
ok(excluidos[0].item === b && excluidos[0].motivo === 'ja-enviado', 'b excluido por ja-enviado');
ok(excluidos[1].item === c && excluidos[1].motivo === 'ignorado', 'c excluido por ignorado');
ok(excluidos[2].item === d && excluidos[2].motivo === 'teste-interno', 'd excluido por teste-interno');
ok(excluidos[3].item === f && excluidos[3].motivo === 'ja-enviado', 'f excluido por ja-enviado (resultados gravados)');
ok(
  elegiveis.length + excluidos.length === 6,
  'nenhum item some na separacao: elegiveis + excluidos = entrada'
);

// Campos extras sobrevivem: a tela precisa do item inteiro de volta, nao de uma copia magra.
const comPayload = { id: 'g', status: 'novo', payload: { event: 'purchase_approved' }, emailMascarado: 'ma****@x.com' };
const sep = separarParaLote([comPayload]);
ok(sep.elegiveis[0] === comPayload, 'separarParaLote devolve o objeto original, com payload e todos os campos');

console.log(
  falhas === 0 ? '\n  Elegibilidade de lote com 100% de cobertura e funcionando.\n' : `\n  ${falhas} falha(s).\n`
);
process.exit(falhas === 0 ? 0 : 1);
