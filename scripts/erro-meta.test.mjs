#!/usr/bin/env node
/**
 * Testes do erro da Meta em texto de gente (src/lib/erro-meta.ts) e da contagem
 * de recusas por Pixel (resumirInbox().recusasPorPixel), da M-01.
 *
 * O que está sendo protegido: o aviso "a Meta recusou" só pode aparecer com
 * recusa REAL (sem teste da equipe, sem modo teste), tem de dizer o próximo
 * passo e tem de sumir quando a Meta volta a aceitar.
 *
 * Tudo com dado inventado e rede proibida: nenhum evento sai daqui.
 *
 * Cobre:
 *  1. lerErroDaMeta lê code e error_subcode e ignora o resto
 *  2. A tabela: 190, 10, 200, 100 e o genérico
 *  3. Os textos seguem o glossário e sempre dizem o próximo passo
 *  4. avisoDeRecusa: singular, plural, nome do Pixel, janela incompleta
 *  5. avisoDoPixel: acha o Pixel certo ou devolve null
 *  6. recusasPorPixel: conta por Pixel, pega o código mais recente
 *  7. recusasPorPixel: teste, modo teste e "sem resposta da Meta" ficam fora
 *  8. recusasPorPixel: aceitouDepois
 *
 * Uso: npm run test:erro-meta
 */

let chamadasDeRede = 0;
globalThis.fetch = async (alvo) => {
  chamadasDeRede++;
  throw new Error(`[erro-meta.test] chamada de rede proibida: ${String(alvo?.url ?? alvo)}`);
};
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const {
  DIAS_DO_AVISO,
  lerErroDaMeta,
  traduzirErroDaMeta,
  textoDoErroDaMeta,
  avisoDeRecusa,
  avisoDoPixel,
} = await import(new URL('../src/lib/erro-meta.ts', import.meta.url).href);
const { resumirInbox } = await import(new URL('../src/lib/inbox-resumo.ts', import.meta.url).href);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  Erro da Meta em texto de gente\n');

/* ---------------- 1. lerErroDaMeta ---------------- */
{
  const lido = lerErroDaMeta({ error: { message: 'x', type: 'OAuthException', code: 190, error_subcode: 463 } });
  ok(lido.codigo === 190 && lido.subcodigo === 463, '1a: lê code e error_subcode', JSON.stringify(lido));
  ok(Object.keys(lerErroDaMeta({ events_received: 1 })).length === 0, '1b: resposta de sucesso vira {}');
  ok(Object.keys(lerErroDaMeta(null)).length === 0, '1c: null vira {}');
  ok(Object.keys(lerErroDaMeta('texto')).length === 0, '1d: texto solto vira {}');
  ok(Object.keys(lerErroDaMeta({ error: { code: '190' } })).length === 0, '1e: código em texto não é número: vira {}');
  const soCodigo = lerErroDaMeta({ error: { code: 100 } });
  ok(soCodigo.codigo === 100 && !('subcodigo' in soCodigo), '1f: sem subcódigo, o campo nem existe');
}

/* ---------------- 2. A tabela ---------------- */
{
  const t190 = traduzirErroDaMeta({ codigo: 190 });
  ok(t190.tipo === 'token' && t190.trocarToken === true && t190.acao === 'Trocar o token', '2a: 190 = token, ação Trocar o token');
  ok(/venceu ou foi revogado/.test(t190.frase), '2b: 190 diz que o token venceu ou foi revogado', t190.frase);
  for (const codigo of [10, 200]) {
    const t = traduzirErroDaMeta({ codigo });
    ok(t.tipo === 'permissao' && t.trocarToken === true && t.acao === 'Trocar o token', `2c: ${codigo} = sem permissão, ação Trocar o token`);
  }
  const t100 = traduzirErroDaMeta({ codigo: 100 });
  ok(t100.tipo === 'dado' && t100.trocarToken === false && t100.acao === 'Conferir o Pixel', '2d: 100 = dado errado, sem pedir token novo');
  const t999 = traduzirErroDaMeta({ codigo: 999 });
  ok(t999.tipo === 'outro' && t999.frase.includes('(código 999)'), '2e: código fora da tabela = genérico, com o código', t999.frase);
  const semCodigo = traduzirErroDaMeta({});
  ok(semCodigo.tipo === 'outro' && !semCodigo.frase.includes('código'), '2f: sem código = genérico, sem inventar número', semCodigo.frase);
  ok(textoDoErroDaMeta({ codigo: 190 }) === `${t190.frase} ${t190.oQueFazer}`, '2g: textoDoErroDaMeta junta a frase e o próximo passo');
}

/* ---------------- 3. Glossário e próximo passo ---------------- */
{
  const PROIBIDAS = /dispar|\bmarcas?\b|\bdestinos?\b|caixa de entrada|roteamento|integra[cç][oõ]es|conectad/i;
  for (const codigo of [190, 10, 200, 100, 999, undefined]) {
    const t = traduzirErroDaMeta(codigo === undefined ? {} : { codigo });
    const tudo = `${t.frase} ${t.oQueFazer} ${t.acao}`;
    ok(!PROIBIDAS.test(tudo), `3a: texto do código ${codigo} sem palavra proibida`, tudo);
    ok(t.frase.endsWith('.') && t.oQueFazer.endsWith('.') && t.oQueFazer.length > 10, `3b: código ${codigo} tem frase e próximo passo`);
    ok(tudo !== tudo.toUpperCase(), `3c: código ${codigo} sem caixa-alta`);
  }
}

/* ---------------- 4. avisoDeRecusa ---------------- */
{
  ok(DIAS_DO_AVISO === 7, '4a: a janela do aviso é de 7 dias');
  const um = avisoDeRecusa({ marcaId: 'default', recusados: 1, codigo: 190 }, 'Loja A', true);
  ok(um.titulo === 'A Meta recusou 1 envio do Pixel Loja A nos últimos 7 dias.', '4b: singular com nome', um.titulo);
  const varios = avisoDeRecusa({ marcaId: 'default', recusados: 7, codigo: 190 }, null, true);
  ok(varios.titulo === 'A Meta recusou 7 envios nos últimos 7 dias.', '4c: plural sem nome', varios.titulo);
  ok(varios.acao === 'Trocar o token' && varios.marcaId === 'default', '4d: leva a ação e o id do Pixel');
  ok(varios.texto.includes('venceu ou foi revogado') && varios.texto.includes('troque aqui'), '4e: o texto traz o motivo e o próximo passo', varios.texto);
  const piso = avisoDeRecusa({ marcaId: 'default', recusados: 3 }, null, false);
  ok(piso.titulo === 'A Meta recusou 3 envios nos eventos mais recentes.', '4f: janela incompleta não diz "7 dias"', piso.titulo);
}

/* ---------------- 5. avisoDoPixel ---------------- */
{
  const recusas = [
    { marcaId: 'marca_a', recusados: 4, codigo: 190 },
    { marcaId: 'marca_b', recusados: 1, codigo: 100 },
  ];
  ok(avisoDoPixel(recusas, 'marca_b', true)?.acao === 'Conferir o Pixel', '5a: acha o Pixel certo');
  ok(avisoDoPixel(recusas, 'marca_c', true) === null, '5b: Pixel sem recusa = null');
  ok(avisoDoPixel([], 'marca_a', true) === null, '5c: lista vazia = null');
}

/* ---------------- 6 a 8. recusasPorPixel ---------------- */
const AGORA = '2026-09-13T12:00:00.000Z';
const horasAtras = (n) => new Date(Date.parse(AGORA) - n * 60 * 60 * 1000).toISOString();
const item = (extra = {}) => ({
  recebidoEm: horasAtras(1),
  status: 'novo',
  eventoMeta: 'Purchase',
  temFbc: false,
  temFbp: false,
  ...extra,
});
const recusa = (marcaId, codigo, extra = {}) => ({
  marcaId,
  status: 'erro',
  httpStatus: 400,
  modoTeste: false,
  ...(codigo === undefined ? {} : { codigoMeta: codigo }),
  ...extra,
});
const aceite = (marcaId, extra = {}) => ({
  marcaId,
  status: 'enviado',
  httpStatus: 200,
  eventsReceived: 1,
  modoTeste: false,
  ...extra,
});
const recusasDe = (itens) => resumirInbox(itens, AGORA, 7).recusasPorPixel;

{
  const r = recusasDe([
    item({ recebidoEm: horasAtras(30), resultados: [recusa('default', 100)] }),
    item({ recebidoEm: horasAtras(2), resultados: [recusa('default', 190, { subcodigoMeta: 463 })] }),
    item({ recebidoEm: horasAtras(40), status: 'disparado', resultados: [aceite('default')] }),
  ]);
  ok(Array.isArray(r) && r.length === 1, '6a: um Pixel com recusa = uma linha', JSON.stringify(r));
  ok(r[0]?.marcaId === 'default' && r[0]?.recusados === 2, '6b: duas recusas no mesmo Pixel');
  ok(r[0]?.codigo === 190 && r[0]?.subcodigo === 463, '6c: fica o código da recusa MAIS RECENTE', JSON.stringify(r[0]));
  ok(r[0]?.ultimaRecusaEm === horasAtras(2), '6d: ultimaRecusaEm é a chegada do evento mais recente');
  ok(r[0]?.aceitouDepois === false, '6e: aceite ANTES da recusa não apaga o aviso');
}
{
  const r = recusasDe([
    item({ status: 'disparado', resultados: [aceite('marca_a'), recusa('marca_b', 190)] }),
    item({ resultados: [recusa('marca_a', 10)] }),
    item({ resultados: [recusa('marca_a', 10)] }),
  ]);
  ok(r.length === 2 && r[0].marcaId === 'marca_a' && r[0].recusados === 2, '6f: o Pixel com mais recusas vem primeiro', JSON.stringify(r));
  ok(r[1].marcaId === 'marca_b' && r[1].recusados === 1, '6g: evento aceito em um Pixel e recusado no outro conta recusa só no outro');
}
{
  const r = recusasDe([item({ resultados: [recusa('default', undefined)] })]);
  ok(r.length === 1 && r[0].recusados === 1 && !('codigo' in r[0]), '6h: registro antigo, sem código, conta e fica sem o campo', JSON.stringify(r));
}
{
  const r = recusasDe([
    item({ testeInterno: true, resultados: [recusa('default', 190)] }),
    item({ testePlataforma: true, resultados: [recusa('default', 190)] }),
    item({ resultados: [recusa('default', 190, { modoTeste: true })] }),
    item({ resultados: [{ marcaId: 'default', status: 'sem-token', modoTeste: false }] }),
    item({ resultados: [{ marcaId: 'default', status: 'duplicado', modoTeste: false }] }),
    item({ resultados: [{ marcaId: 'default', status: 'erro', modoTeste: false, erro: 'fetch failed' }] }),
    item({ resultados: [{ status: 'erro', httpStatus: 400, modoTeste: false }] }),
    item({ recebidoEm: horasAtras(24 * 10), resultados: [recusa('default', 190)] }),
    item({}),
  ]);
  ok(Array.isArray(r) && r.length === 0, '7a: teste, modo teste, sem resposta da Meta, sem Pixel e fora da janela não contam', JSON.stringify(r));
}
{
  const r = recusasDe([
    item({ recebidoEm: horasAtras(5), resultados: [recusa('default', 190)] }),
    item({ recebidoEm: horasAtras(1), status: 'disparado', resultados: [aceite('default')] }),
  ]);
  ok(r.length === 1 && r[0].aceitouDepois === true, '8a: aceite DEPOIS da recusa marca aceitouDepois', JSON.stringify(r));
  const soTeste = recusasDe([
    item({ recebidoEm: horasAtras(5), resultados: [recusa('default', 190)] }),
    item({ recebidoEm: horasAtras(1), status: 'disparado', resultados: [aceite('default', { modoTeste: true })] }),
  ]);
  ok(soTeste.length === 1 && soTeste[0].aceitouDepois === false, '8b: aceite em modo teste não apaga o aviso');
  const outroPixel = recusasDe([
    item({ recebidoEm: horasAtras(5), resultados: [recusa('marca_a', 190)] }),
    item({ recebidoEm: horasAtras(1), status: 'disparado', resultados: [aceite('marca_b')] }),
  ]);
  ok(outroPixel.length === 1 && outroPixel[0].aceitouDepois === false, '8c: aceite de OUTRO Pixel não apaga o aviso');
}

ok(chamadasDeRede === 0, 'nenhuma chamada de rede foi feita');

console.log(falhas === 0 ? '\n  Tudo certo.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
