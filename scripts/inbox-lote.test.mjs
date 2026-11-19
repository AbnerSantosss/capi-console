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
 *  8. Reenvio das recusadas: so entra o Pixel que recusou, nunca o que ja aceitou
 *
 * Uso: npm run test:inbox-lote
 */

const { motivoInelegivel, elegivelParaLote, separarParaLote, pixelsRecusados, separarRecusadas } = await import(
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

/* ---------------- 8. Reenvio das recusadas (T-M10) ---------------- */
console.log('\n  Reenvio das recusadas\n');

// Dados inventados. Nenhum destes resultados foi a Meta: sao so objetos.
const recusa = (marcaId, pixelId, extra = {}) => ({ marcaId, pixelId, status: 'erro', httpStatus: 400, ...extra });
const aceite = (marcaId, pixelId, extra = {}) => ({
  marcaId,
  pixelId,
  status: 'enviado',
  httpStatus: 200,
  eventsReceived: 1,
  ...extra,
});
const igual = (x, y) => JSON.stringify(x) === JSON.stringify(y);

ok(igual(pixelsRecusados(normal({ resultados: [recusa('a', 'px1')] })), ['a']), 'so recusa: entra com o Pixel que recusou');
ok(
  igual(pixelsRecusados(normal({ resultados: [recusa('a', 'px1', { httpStatus: 190 })] })), ['a']),
  'qualquer httpStatus numerico sem aceite e recusa'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [recusa('a', 'px1', { httpStatus: 200, eventsReceived: 0 })] })), ['a']),
  'resposta 200 com zero eventos recebidos e recusa'
);
ok(
  igual(pixelsRecusados(normal({ status: 'disparado', resultados: [aceite('a', 'px1'), recusa('b', 'px2')] })), ['b']),
  'A aceitou e B recusou: vai so para o B'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [recusa('a', 'px1'), aceite('a', 'px1')] })), []),
  'enviado no MESMO Pixel: fica de fora'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [aceite('a', 'px1'), recusa('a', 'px1')] })), []),
  'enviado no mesmo Pixel, em qualquer ordem: fica de fora'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [recusa('a', 'px1'), { marcaId: 'a', pixelId: 'px1', status: 'duplicado' }] })), []),
  'duplicado no MESMO Pixel: fica de fora'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [aceite('a', 'px1'), recusa('b', 'px1')] })), []),
  'o mesmo pixelId ja aceito em outro cadastro: fica de fora'
);
ok(
  igual(
    pixelsRecusados(
      normal({ resultados: [recusa('a', 'px1'), { marcaId: 'a', pixelId: 'px1', status: 'erro', httpStatus: 200, eventsReceived: 1 }] })
    ),
    []
  ),
  'aceite so pelos numeros (200 com 1 recebido) tambem trava'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [aceite('a', 'px1', { modoTeste: true }), recusa('a', 'px1')] })), []),
  'aceite em modo de teste tambem trava (na duvida, nao manda)'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [recusa('a', 'px1', { modoTeste: true })] })), ['a']),
  'recusa em modo de teste entra (reenviar a Pixel em teste nao conta nas campanhas)'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [{ marcaId: 'a', pixelId: 'px1', status: 'erro', erro: 'fetch failed' }] })), []),
  'erro SEM httpStatus (a Meta nao respondeu) nao e recusa'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [{ marcaId: 'a', status: 'sem-token' }] })), []),
  'sem-token nao e recusa'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [{ marcaId: 'a', status: 'invalido' }, { marcaId: 'b', status: 'pixel-desligado' }] })), []),
  'invalido e pixel-desligado nao sao recusa'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [{ pixelId: 'px1', status: 'erro', httpStatus: 400 }] })), []),
  'resultado sem marcaId fica de fora (nao ha para onde mandar)'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [recusa('b', 'px2'), recusa('a', 'px1'), recusa('b', 'px2')] })), ['b', 'a']),
  'sem repeticao e na ordem dos resultados'
);
ok(
  igual(pixelsRecusados(normal({ resultados: [null, 'texto', 7, [], recusa('a', 'px1')] })), ['a']),
  'lixo no meio dos resultados nao quebra'
);
ok(igual(pixelsRecusados(normal()), []), 'item sem resultados fica de fora');
ok(igual(pixelsRecusados(normal({ resultados: [] })), []), 'resultados vazio fica de fora');
ok(igual(pixelsRecusados(normal({ resultados: 'nao e lista' })), []), 'resultados que nao e lista fica de fora');
ok(igual(pixelsRecusados(null), []) && igual(pixelsRecusados(undefined), []), 'null e undefined nao quebram');

// Ignorado e teste nunca entram, mesmo com recusa gravada (regras 1 e 4 do CLAUDE.md).
ok(igual(pixelsRecusados(normal({ status: 'ignorado', resultados: [recusa('a', 'px1')] })), []), 'ignorado (status) fica de fora');
ok(igual(pixelsRecusados(normal({ modo: 'ignorar', resultados: [recusa('a', 'px1')] })), []), 'ignorado (modo) fica de fora');
ok(
  igual(pixelsRecusados(normal({ motivoIgnorar: 'pedido estornado', resultados: [recusa('a', 'px1')] })), []),
  'ignorado (motivoIgnorar) fica de fora'
);
ok(igual(pixelsRecusados(normal({ testeInterno: true, resultados: [recusa('a', 'px1')] })), []), 'teste interno fica de fora');
ok(igual(pixelsRecusados(normal({ testePlataforma: true, resultados: [recusa('a', 'px1')] })), []), 'ping da plataforma fica de fora');

// separarRecusadas: ordem, identidade e entrada torta.
const r1 = normal({ id: 'r1', resultados: [recusa('a', 'px1')] });
const r2 = normal({ id: 'r2' });
const r3 = normal({ id: 'r3', status: 'disparado', resultados: [aceite('a', 'px1'), recusa('b', 'px2')] });
const r4 = normal({ id: 'r4', status: 'disparado', resultados: [aceite('a', 'px1')] });
const sepRec = separarRecusadas([r1, r2, r3, r4]);
ok(sepRec.length === 2, 'separarRecusadas: so os 2 itens com Pixel a reenviar', String(sepRec.length));
ok(sepRec[0]?.item === r1 && sepRec[1]?.item === r3, 'separarRecusadas: ordem original e os MESMOS objetos');
ok(igual(sepRec[0]?.marcas, ['a']) && igual(sepRec[1]?.marcas, ['b']), 'separarRecusadas: cada item com os seus Pixels');
ok(igual(separarRecusadas([]), []) && igual(separarRecusadas(null), []), 'separarRecusadas: lista vazia e nao-lista devolvem vazio');

// O lote normal NAO afrouxou: item com recusa gravada segue fora do "Enviar filtrados".
ok(motivoInelegivel(r1) === 'ja-enviado', 'lote normal continua barrando item que ja tem resultado');
ok(separarParaLote([r1]).elegiveis.length === 0, 'separarParaLote nao passa a aceitar item recusado');

console.log(
  falhas === 0 ? '\n  Elegibilidade de lote com 100% de cobertura e funcionando.\n' : `\n  ${falhas} falha(s).\n`
);
process.exit(falhas === 0 ? 0 : 1);
