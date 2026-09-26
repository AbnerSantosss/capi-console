#!/usr/bin/env node
/**
 * Visão geral (V5 do plano v7): as contas de `src/lib/visao-geral-calculos.ts`
 * e, lendo os fontes, o que os blocos de `src/components/visao-geral/` mostram.
 *
 * Parte pura:
 *   (a) `percentual(3, 0)` → null; `percentual(1198, 1201)` → 99.8
 *   (b) `ticketMedio(61464, 312)` → 197; `ticketMedio(0, 0)` → null
 *   (c) `conversaoTotal(312, null)` → null
 *   (d) `variacao(10, 0)` e `variacao(10, undefined)` → null; `variacao(128, 100)` → 28
 *   (e) `pontosDaReceita` com um dia `receita: null` → lacuna (dois trechos), nunca zero
 *   (f) `resumoTextualDaReceita` de 7 dias: total em pt-BR e dias sem dado
 *   (g) `csvDaVisaoGeral` sem PII, com BOM, 4 seções, Cliques "indisponível" e `;`
 *   (h) `csvDaVisaoGeral` com `amostraCobreJanela: false` traz a linha de aviso
 *   (j) aceitação = aceitos ÷ (aceitos + recusados): 1 e 3 → 25; 0 e 0 → null (R3)
 *   (k) primeiro dia parcial: a frase diz "parcial" e ele não é o maior dia (R6)
 *   e mais: o espelho de status bate com `resumirInbox` na mesma fixture;
 *   `ultimasConversoes` tira teste, visita, outra empresa e PII; "Valor das
 *   compras" é só `Purchase`.
 *
 * Parte estática (lendo os fontes): (i)–(xi) do plano, blocos a blocos.
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/, e ele LANÇA para qualquer endereço, inclusive
 * graph.facebook.com e api.cloudflare.com. Sem ACCESS_TOKEN e sem PIXEL_ID. O
 * processo roda numa pasta temporária e não grava nada: nunca no config/ real.
 *
 * Uso: npm run test:visao-geral
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

const chamadas = [];
globalThis.fetch = async (entrada) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  chamadas.push(url);
  if (/graph\.facebook\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Meta');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Cloudflare');
  throw new Error(`rede bloqueada pelo teste: ${url}`);
};
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'visao-geral-'));
process.chdir(PASTA);

/* ---------------- Harness ---------------- */

let falhas = 0;
function ok(condicao, rotulo, detalhe = '') {
  if (condicao) {
    console.log(`  ok  ${rotulo}`);
  } else {
    falhas += 1;
    console.error(`  FALHOU  ${rotulo}${detalhe ? ` ${detalhe}` : ''}`);
  }
}
const mostra = (v) => JSON.stringify(v);

const calc = await import(new URL('../src/lib/visao-geral-calculos.ts', import.meta.url).href);
const { resumirInbox } = await import(new URL('../src/lib/inbox-resumo.ts', import.meta.url).href);
const {
  percentual,
  aceitacao,
  ticketMedio,
  conversaoTotal,
  variacao,
  pontosDaReceita,
  resumoTextualDaReceita,
  primeiroDiaParcial,
  degrausDoEixo,
  formatarMoeda,
  csvDaVisaoGeral,
  nomeDoCsv,
  numerosDaVisaoGeral,
  statusDaConversao,
  ultimasConversoes,
  AVISO_DE_AMOSTRA,
} = calc;

/* ---------------- Fixtures ---------------- */

/** 24/09/2026 10:15 em Brasília. */
const AGORA = '2026-09-24T13:15:00.000Z';
const HORA = 60 * 60 * 1000;
const haHoras = (h) => new Date(Date.parse(AGORA) - h * HORA).toISOString();

let seq = 0;
function item(parcial) {
  seq += 1;
  return {
    id: `it-${seq}`,
    recebidoEm: haHoras(1),
    origem: 'webhook',
    status: 'novo',
    temFbc: false,
    temFbp: false,
    ...parcial,
  };
}
const ACEITO = { status: 'enviado', httpStatus: 200, eventsReceived: 1 };
const ACEITO_TESTE = { status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste: true };
const RECUSADO = { status: 'erro', httpStatus: 400 };
const DUPLICADO = { status: 'duplicado' };

const HASH = 'ab'.repeat(32);
const TELEFONE = '5511987654321';
const PII = {
  email: 'maria.teste@exemplo.com.br',
  emailHash: HASH,
  telefone: TELEFONE,
  nomeCliente: 'Maria da Silva',
  emailMascarado: 'ma***@exemplo.com.br',
  payload: { email: 'maria.teste@exemplo.com.br', phone: TELEFONE, customer: { name: 'Maria da Silva' } },
};

/* ================================================================== */
console.log('\n(a)–(d) fórmulas com denominador explícito');

ok(percentual(3, 0) === null, '(a) percentual(3, 0) → null', mostra(percentual(3, 0)));
ok(percentual(1198, 1201) === 99.8, '(a) percentual(1198, 1201) → 99.8', mostra(percentual(1198, 1201)));
ok(ticketMedio(61464, 312) === 197, '(b) ticketMedio(61464, 312) → 197', mostra(ticketMedio(61464, 312)));
ok(ticketMedio(0, 0) === null, '(b) ticketMedio(0, 0) → null', mostra(ticketMedio(0, 0)));
ok(conversaoTotal(312, null) === null, '(c) conversaoTotal(312, null) → null');
ok(variacao(10, 0) === null, '(d) variacao(10, 0) → null');
ok(variacao(10, undefined) === null, '(d) variacao(10, undefined) → null');
ok(variacao(128, 100) === 28, '(d) variacao(128, 100) → 28', mostra(variacao(128, 100)));

/* ================================================================== */
console.log('\n(j) aceitação = aceitos ÷ respondidos (R3)');

ok(aceitacao(1, 3) === 25, '(j) aceitacao(1, 3) → 25', mostra(aceitacao(1, 3)));
ok(aceitacao(0, 0) === null, '(j) aceitacao(0, 0) → null', mostra(aceitacao(0, 0)));
{
  const itens = [
    item({ status: 'disparado', eventoMeta: 'Purchase', evento: 'Purchase', resultados: [ACEITO] }),
    item({ status: 'novo', eventoMeta: 'Purchase', evento: 'Purchase', resultados: [RECUSADO] }),
    item({ status: 'novo', eventoMeta: 'Purchase', evento: 'Purchase', resultados: [RECUSADO] }),
    item({ status: 'novo', eventoMeta: 'Purchase', evento: 'Purchase', resultados: [RECUSADO] }),
  ];
  const resumo = resumirInbox(itens, AGORA, 'hoje');
  const n = numerosDaVisaoGeral(resumo);
  ok(
    resumo.qualidade.aceitos === 1 && resumo.qualidade.recusados === 3 && resumo.volume.enviados.total === 1,
    '(j) fixture: 1 aceito, 3 recusados, 1 enviado',
    mostra(resumo.qualidade)
  );
  ok(n.aceitacao === 25, '(j) numerosDaVisaoGeral: aceitação 25, e não 100 (enviados no denominador)', mostra(n.aceitacao));
  ok(n.respondidos === 4, '(j) respondidos = aceitos + recusados = 4', mostra(n.respondidos));
}

/* ================================================================== */
console.log('\n(e) receita por dia: dia sem valor é lacuna');

{
  const porDia = [
    { dia: '2026-09-17', recebidos: 3, aceitos: 1, receita: 100, compras: 1 },
    { dia: '2026-09-18', recebidos: 3, aceitos: 1, receita: 200, compras: 1 },
    { dia: '2026-09-19', recebidos: 3, aceitos: 1, receita: null, compras: 2 },
    { dia: '2026-09-20', recebidos: 3, aceitos: 1, receita: 50, compras: 1 },
    { dia: '2026-09-21', recebidos: 3, aceitos: 1, receita: 80, compras: 1 },
  ];
  const g = pontosDaReceita(porDia, 400, 100);
  ok(g.segmentos.length === 2, '(e) dois trechos', mostra(g.segmentos.map((s) => s.map((p) => p.dia))));
  ok(g.pontos.length === 4, '(e) quatro pontos: o dia sem valor não tem ponto', mostra(g.pontos.length));
  ok(!g.pontos.some((p) => p.dia === '2026-09-19'), '(e) nenhum ponto no dia 19 (nem em zero)');
  ok(
    g.segmentos[0].map((p) => p.dia).join(',') === '2026-09-17,2026-09-18' &&
      g.segmentos[1].map((p) => p.dia).join(',') === '2026-09-20,2026-09-21',
    '(e) os trechos são 17–18 e 20–21'
  );
  ok(g.diasSemValor === 1 && g.xDosDias.length === 5, '(e) 1 dia sem valor e 5 posições no eixo X');
  ok(g.pontos.every((p) => p.y >= 0 && p.y <= 100 && p.x >= 0 && p.x <= 400), '(e) coordenadas dentro do SVG');
  const d = degrausDoEixo(12300);
  ok(d[0] === 0 && d.length >= 4 && d.length <= 5 && d[d.length - 1] >= 12300, '(e) 4–5 degraus redondos no eixo Y', mostra(d));
  ok(mostra(degrausDoEixo(0)) === '[0]', '(e) sem valor, um degrau só (0)');
}

/* ================================================================== */
console.log('\n(f) e (k) frase da receita');

{
  const dias = ['17', '18', '19', '20', '21', '22', '23'].map((d) => `2026-09-${d}`);
  const valores = [8000, 9000, null, 12300, 11000, 10164, 11000];
  const porDia = dias.map((dia, i) => ({ dia, recebidos: 10, aceitos: 5, receita: valores[i], compras: 2 }));
  const frase = resumoTextualDaReceita(porDia, 'BRL', { inicio: '2026-09-17T03:00:00.000Z' });
  ok(frase.includes('7 dias, de 17/09 a 23/09'), '(f) diz 7 dias, de 17/09 a 23/09', frase);
  ok(frase.includes(formatarMoeda(61464, 'BRL')) && frase.includes('61.464'), '(f) total formatado em pt-BR (R$ 61.464)', frase);
  ok(frase.includes('1 dia sem dado'), '(f) conta o dia sem dado', frase);
  ok(frase.includes('maior dia 20/09'), '(f) maior dia 20/09', frase);
  ok(!frase.includes('parcial'), '(f) janela à 00:00 de Brasília: nada de "parcial"', frase);
  ok(formatarMoeda(10.5, 'BRL').includes('10,50'), 'formatarMoeda com centavos: 10,50', formatarMoeda(10.5, 'BRL'));

  // (k) "Últimos 7 dias" às 10:15: a janela começa 17/09 às 10:15, e o
  // primeiro dia (o maior de todos, de propósito) só tem as horas finais.
  const oito = ['17', '18', '19', '20', '21', '22', '23', '24'].map((d) => `2026-09-${d}`);
  const receitas = [50000, 9000, 7000, 12300, 11000, 10164, 11000, 3000];
  const porDia8 = oito.map((dia, i) => ({ dia, recebidos: 10, aceitos: 5, receita: receitas[i], compras: 2 }));
  const janela = { inicio: '2026-09-17T13:15:00.000Z', fim: AGORA };
  const parcial = primeiroDiaParcial(janela, porDia8);
  ok(parcial !== null && parcial.desde === '10:15', '(k) primeiro dia parcial, desde 10:15', mostra(parcial));
  const fraseK = resumoTextualDaReceita(porDia8, 'BRL', janela);
  ok(fraseK.includes('parcial'), '(k) a frase diz "parcial"', fraseK);
  ok(!fraseK.includes('maior dia 17/09'), '(k) o dia parcial não é o maior dia', fraseK);
  ok(fraseK.includes('maior dia 20/09'), '(k) o maior dia é 20/09', fraseK);
  ok(primeiroDiaParcial({ inicio: '2026-09-17T03:00:00.000Z' }, porDia8) === null, '(k) janela à 00:00: não é parcial');
  ok(
    primeiroDiaParcial(janela, porDia8.slice(2)) === null,
    '(k) amostra que cortou o começo: o primeiro da lista não é o dia do início, não é parcial'
  );
}

/* ================================================================== */
console.log('\nespelho de status bate com resumirInbox');

const itensDoPeriodo = [
  item({ recebidoEm: haHoras(1), status: 'disparado', eventoMeta: 'Purchase', evento: 'Purchase', eventoOrigem: 'purchase_approved', valor: 197, moeda: 'BRL', resultados: [ACEITO], eventId: 'order_118', ...PII }),
  item({ recebidoEm: haHoras(2), status: 'disparado', eventoMeta: 'Purchase', evento: 'Purchase', eventoOrigem: 'purchase_approved', valor: 197, moeda: 'BRL', resultados: [ACEITO_TESTE], eventId: 'order_119', ...PII }),
  item({ recebidoEm: haHoras(3), status: 'disparado', eventoMeta: 'Purchase', evento: 'Purchase', eventoOrigem: 'purchase_approved', valor: 297, moeda: 'BRL', resultados: [DUPLICADO, ACEITO_TESTE], eventId: 'order_120', ...PII }),
  item({ recebidoEm: haHoras(4), status: 'novo', eventoMeta: 'Purchase', evento: 'Purchase', eventoOrigem: 'purchase_approved', valor: 197, moeda: 'BRL', resultados: [RECUSADO], eventId: 'order_121', ...PII }),
  item({ recebidoEm: haHoras(5), status: 'disparado', eventoMeta: 'AddPaymentInfo', evento: 'AddPaymentInfo', eventoOrigem: 'payment_generated', valor: 197, moeda: 'BRL', resultados: [ACEITO], eventId: 'pix_77', ...PII }),
  item({ recebidoEm: haHoras(6), status: 'disparado', eventoMeta: 'InitiateCheckout', evento: 'InitiateCheckout', eventoOrigem: 'checkout_session_opened', eventId: 'chk_1', ...PII }),
  item({ recebidoEm: haHoras(7), status: 'ignorado', evento: 'checkout_abandoned', eventoOrigem: 'checkout_abandoned', ...PII }),
  item({ recebidoEm: haHoras(8), status: 'novo', eventoMeta: 'InitiateCheckout', evento: 'InitiateCheckout', eventoOrigem: 'tag.initiatecheckout', origem: 'tag', eventId: 'chk_2' }),
  item({ recebidoEm: haHoras(9), status: 'disparado', eventoMeta: 'PageView', evento: 'PageView', eventoOrigem: 'tag.pageview', origem: 'tag', temFbclid: true, temFbc: true, resultados: [ACEITO], eventId: 'pv_1' }),
  item({ recebidoEm: haHoras(9.5), status: 'disparado', eventoMeta: 'PageView', evento: 'PageView', eventoOrigem: 'tag.pageview', origem: 'tag', temFbc: true, resultados: [ACEITO], eventId: 'pv_2' }),
  // Teste interno: fora de tudo.
  item({ recebidoEm: haHoras(0.5), status: 'disparado', eventoMeta: 'Purchase', evento: 'Purchase', eventoOrigem: 'purchase_approved', valor: 0.01, moeda: 'BRL', resultados: [ACEITO], testeInterno: true, eventId: 'order_teste', ...PII }),
  // Outra empresa: fora da lista desta.
  item({ recebidoEm: haHoras(0.2), empresaId: 'gtech', status: 'disparado', eventoMeta: 'Purchase', evento: 'Purchase', eventoOrigem: 'purchase_approved', valor: 50, moeda: 'BRL', resultados: [ACEITO], eventId: 'order_gtech' }),
  // Fora da janela de hoje (ontem): fora da lista.
  item({ recebidoEm: haHoras(30), status: 'disparado', eventoMeta: 'Purchase', evento: 'Purchase', eventoOrigem: 'purchase_approved', valor: 197, moeda: 'BRL', resultados: [ACEITO], eventId: 'order_ontem' }),
];

{
  const daEmpresa = itensDoPeriodo.filter((i) => (i.empresaId ?? 'default') === 'default');
  const resumo = resumirInbox(daEmpresa, AGORA, 'hoje');
  const inicio = Date.parse(resumo.janela.inicio);
  const reais = daEmpresa.filter(
    (i) => Date.parse(i.recebidoEm) >= inicio && i.testeInterno !== true && i.testePlataforma !== true
  );
  const conta = (s) => reais.filter((i) => statusDaConversao(i) === s).length;
  ok(conta('aceito') === resumo.qualidade.aceitos, 'aceitos: espelho = resumo', `${conta('aceito')} x ${resumo.qualidade.aceitos}`);
  ok(conta('recusado') === resumo.qualidade.recusados, 'recusados: espelho = resumo', `${conta('recusado')} x ${resumo.qualidade.recusados}`);
  ok(conta('teste') === resumo.volume.enviadosEmTeste, 'só em teste: espelho = resumo', `${conta('teste')} x ${resumo.volume.enviadosEmTeste}`);
  ok(
    conta('aceito') + conta('teste') + conta('enviado') === resumo.volume.enviados.total + resumo.volume.enviadosEmTeste,
    'disparados: espelho = resumo'
  );

  const n = numerosDaVisaoGeral(resumo);
  ok(
    resumo.receitaEnviada?.total === 197 + 297 + 197 && n.valorDasCompras === 197 + 197 + 297 + 197,
    '"Valor das compras" é só Purchase real (compras.valor), não a soma de todo evento enviado',
    `${mostra(resumo.receitaEnviada)} x ${n.valorDasCompras}`
  );
  ok(n.paginas === 2 && n.checkouts === 2 && n.compras === 4, 'KPIs: 2 páginas, 2 checkouts, 4 compras', mostra(n));
  ok(n.taxaCheckout === 100 && n.taxaCompra === 200, 'taxas: checkout ÷ página, compra ÷ checkout', mostra([n.taxaCheckout, n.taxaCompra]));
  ok(n.comFbclid === 1 && n.comFbc === 2, 'eventos com fbclid (1) e com fbc (2)', mostra([n.comFbclid, n.comFbc]));

  const vazio = numerosDaVisaoGeral(resumirInbox([], AGORA, 'hoje'));
  ok(
    !vazio.temDado &&
      [vazio.paginas, vazio.checkouts, vazio.compras, vazio.valorDasCompras, vazio.aceitacao, vazio.aceitos].every((v) => v === null),
    'base 0: toda contagem é null ("—"), nunca 0',
    mostra(vazio)
  );

  // R1 da V4: [produção erro 400, teste enviado] é recusa na lista e no resumo.
  // Fica fora da fixture acima: no volume ele é "só em teste", e a soma dos
  // disparados de lá deixaria de fechar.
  const misto = item({
    recebidoEm: haHoras(0.5),
    status: 'disparado',
    eventoMeta: 'Purchase',
    evento: 'Purchase',
    resultados: [
      { marcaId: 'a', status: 'erro', httpStatus: 400, modoTeste: false },
      { marcaId: 'b', status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste: true },
    ],
  });
  const resumoMisto = resumirInbox([misto], AGORA, 'hoje');
  ok(
    statusDaConversao(misto) === 'recusado' && resumoMisto.qualidade.recusados === 1,
    '🔴 R1 V4: recusa do Pixel real não some com aceite em teste (lista = resumo)',
    `${statusDaConversao(misto)} x ${resumoMisto.qualidade.recusados}`
  );

  /* ---------------- últimas conversões ---------------- */
  const linhas = ultimasConversoes(itensDoPeriodo, resumo.janela, 'default');
  ok(linhas.length === 5, 'últimas conversões: 5 linhas', mostra(linhas.length));
  ok(
    linhas.map((l) => l.eventId).join(',') === 'order_118,order_119,order_120,order_121,pix_77',
    'a mais nova primeiro; sem teste interno, sem outra empresa, sem ontem, sem PageView',
    mostra(linhas.map((l) => l.eventId))
  );
  ok(
    linhas.map((l) => l.status).join(',') === 'aceito,teste,aceito,recusado,aceito',
    'status: aceito, só em teste, duplicado real = aceito, recusado, aceito',
    mostra(linhas.map((l) => l.status))
  );
  ok(linhas[0].nomeDoEvento === 'purchase_approved', 'o nome do link é o da origem (R4)', mostra(linhas[0]));
  const CHAVES = 'eventId,evento,id,moeda,nomeDoEvento,recebidoEm,status,valor';
  ok(
    linhas.every((l) => Object.keys(l).sort().join(',') === CHAVES),
    'cada linha só leva as chaves sem PII',
    mostra(Object.keys(linhas[0]).sort())
  );
  const todas = ultimasConversoes(itensDoPeriodo, resumo.janela, 'default', 20);
  ok(!todas.some((l) => l.evento === 'PageView'), 'PageView nunca entra (visita não é conversão)');
  ok(ultimasConversoes(itensDoPeriodo, resumo.janela, 'gtech').map((l) => l.eventId).join(',') === 'order_gtech', 'a outra empresa só vê a dela');

  /* ================================================================== */
  console.log('\n(g) e (h) CSV do botão Exportar');

  const empresa = { nome: 'Código Vencedor', slug: 'codigo-vencedor' };
  const resumoComparado = resumirInbox(daEmpresa, AGORA, 'hoje', Number.POSITIVE_INFINITY, { comparar: true });
  const csv = csvDaVisaoGeral({ empresa, resumo: resumoComparado, linhas });
  // A MESMA conta com os itens crus (e a PII toda) no lugar das linhas: nada
  // de fora dos seis campos pode vazar para o arquivo.
  const csvCru = csvDaVisaoGeral({ empresa, resumo: resumoComparado, linhas: itensDoPeriodo });
  for (const [nome, texto] of [['linhas', csv], ['itens crus', csvCru]]) {
    ok(texto.startsWith('﻿'), `(g) ${nome}: começa com o BOM`);
    ok(!texto.includes('@'), `(g) ${nome}: nenhum @`);
    ok(!texto.includes('emailHash') && !/email/i.test(texto), `(g) ${nome}: nem "emailHash" nem e-mail`);
    ok(!/telefone|phone/i.test(texto), `(g) ${nome}: nem "telefone"`);
    ok(!texto.includes('987654321') && !texto.includes(TELEFONE), `(g) ${nome}: nenhum dígito do telefone`);
    ok(!/[0-9a-f]{64}/i.test(texto), `(g) ${nome}: nenhum hash de 64 hex`);
    ok(!texto.includes('Maria'), `(g) ${nome}: nenhum nome de cliente`);
  }
  const linhasDoCsv = csv.replace('﻿', '').split('\r\n');
  for (const secao of ['KPIs', 'Funil', 'Qualidade', 'Últimas conversões']) {
    ok(linhasDoCsv.includes(secao), `(g) seção "${secao}"`);
  }
  ok(linhasDoCsv.some((l) => l.startsWith('Cliques;indisponível')), '(g) a linha de Cliques traz "indisponível"');
  ok(linhasDoCsv.includes('hora;evento;valor;moeda;status;event_id'), '(g) separador ";" e as colunas das conversões');
  ok(linhasDoCsv.some((l) => l.includes(';order_118')), '(g) o event_id sai na coluna dele');
  ok(!csv.includes(AVISO_DE_AMOSTRA), '(h) amostra que cobre a janela: sem aviso');
  const csvIncompleto = csvDaVisaoGeral({ empresa, resumo: { ...resumoComparado, amostraCobreJanela: false }, linhas });
  ok(csvIncompleto.includes(`Aviso;${AVISO_DE_AMOSTRA}`), '(h) amostraCobreJanela false: a linha de aviso');
  ok(
    nomeDoCsv('codigo-vencedor', { inicio: '2026-09-17T13:15:00.000Z', fim: AGORA }) ===
      'visao-geral-codigo-vencedor-2026-09-17-2026-09-24.csv',
    'nome do arquivo: visao-geral-<slug>-<inicio>-<fim>.csv'
  );
}

/* ================================================================== */
/* Estáticos: lidos dos fontes de src/components/visao-geral/          */
/* ================================================================== */

const ler = (...partes) => {
  try {
    return fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
  } catch {
    return null;
  }
};
const PASTA_VG = ['src', 'components', 'visao-geral'];

/** Os literais em ordem: cada um aparece depois do anterior. */
function emOrdem(texto, termos) {
  let desde = 0;
  for (const t of termos) {
    const i = texto.indexOf(t, desde);
    if (i < 0) return false;
    desde = i + t.length;
  }
  return true;
}

console.log('\n(i)–(iii) estáticos da parte 5a');

{
  const kpis = ler(...PASTA_VG, 'Kpis.tsx');
  ok(kpis !== null, '(i) Kpis.tsx existe');
  if (kpis) {
    ok(
      emOrdem(kpis, ['"Cliques"', '"Visualizações de página"', '"Inícios de checkout"', '"Compras"', '"Valor das compras"']),
      '(i) os 5 KPIs, nesta ordem'
    );
    ok(kpis.includes('indisponível') && kpis.includes('fbclid'), '(i) "indisponível" e "fbclid"');
    ok(!/rotulo="(Recebidos|Recusados|Enviados)"/.test(kpis) && !/>(Recebidos|Recusados|Enviados)</.test(kpis), '(i) nenhum cartão chamado Recebidos, Recusados ou Enviados');
    ok(kpis.includes('surface-success'), '(i) o cartão de valor usa surface-success');
  }

  const funil = ler(...PASTA_VG, 'Funil.tsx');
  ok(funil !== null, '(ii) Funil.tsx existe');
  if (funil) {
    ok(funil.includes('<text'), '(ii) rótulos em <text> do SVG');
    ok(funil.includes('role="img"') && funil.includes('aria-describedby'), '(ii) role="img" e aria-describedby');
    ok(funil.includes('Conversão total') && funil.includes('indisponível'), '(ii) "Conversão total" e "indisponível"');
    ok(!funil.includes('<image'), '(ii) nenhuma <image>');
    ok(!/cliques\s*[:=]\s*\d/i.test(funil), '(ii) nenhum literal numérico de cliques');
  }

  const receita = ler(...PASTA_VG, 'Receita.tsx');
  ok(receita !== null, '(iii) Receita.tsx existe');
  if (receita) {
    for (const t of ['<svg', '<desc', 'role="tooltip"', 'aria-describedby', 'tabIndex']) {
      ok(receita.includes(t), `(iii) contém ${t}`);
    }
    ok(!receita.includes('<image'), '(iii) nenhuma <image>');
  }
}

console.log('\n(iv)–(xi) estáticos da parte 5b');

{
  const qualidade = ler(...PASTA_VG, 'Qualidade.tsx');
  ok(qualidade !== null, '(iv) Qualidade.tsx existe');
  if (qualidade) {
    ok(qualidade.includes('role="progressbar"') && qualidade.includes('aria-valuenow'), '(iv) role="progressbar" e aria-valuenow');
    // O traço da tela sai de `SEM_DADO`/`formatarPercentual`, que devolvem "—".
    ok(qualidade.includes('—') && qualidade.includes('SEM_DADO'), '(iv) "—" quando não há resposta');
    ok(qualidade.includes('recusados'), '(iv) "recusados"');
    ok(!/CAPI ativa|conectado|Conectado/.test(qualidade), '(iv) nem "CAPI ativa" nem "conectado"');
  }

  const fluxo = ler(...PASTA_VG, 'FluxoDoEvento.tsx');
  ok(fluxo !== null, '(v) FluxoDoEvento.tsx existe');
  if (fluxo) ok(!/conectado|Conectado/.test(fluxo), '(v) sem "conectado"');

  const atividade = ler(...PASTA_VG, 'AtividadeRecente.tsx');
  ok(atividade !== null, '(vi) AtividadeRecente.tsx existe');
  if (atividade) {
    ok(atividade.includes('?evento=') && atividade.includes('Ver todas'), '(vi) "?evento=" e "Ver todas"');
    ok(!/email|telefone|phone|Hash|Exportar/.test(atividade), '(vi) sem email, telefone, phone, Hash nem "Exportar"');
    // (xi) R4: o link filtra pelo NOME do evento, nunca pelo event_id.
    ok(!/\?evento=[^\n]*eventId/.test(atividade), '(xi) o "?evento=" não é montado com eventId');
    ok(/\?evento=\$\{encodeURIComponent\(l\.nomeDoEvento\)\}/.test(atividade), '(xi) o "?evento=" leva o nome do evento');
  }

  const exportar = ler(...PASTA_VG, 'ExportarCsv.tsx');
  ok(exportar !== null, '(vii) ExportarCsv.tsx existe');
  if (exportar) {
    for (const t of ['csvDaVisaoGeral', 'text/csv', 'disabled']) ok(exportar.includes(t), `(vii) contém ${t}`);
    ok(!exportar.includes('fetch(') && !exportar.includes('pedir('), '(vii) sem fetch( nem pedir(: gera no navegador');
  }

  const visao = ler(...PASTA_VG, 'VisaoGeral.tsx');
  ok(visao !== null, '(viii) VisaoGeral.tsx existe');
  if (visao) {
    for (const t of [
      'ExportarCsv',
      'SeletorDePeriodo',
      'janela',
      'Brasília',
      'Esqueleto',
      'Sem resposta do servidor',
      'Sessão expirada',
      '/login',
    ]) {
      ok(visao.includes(t), `(viii) contém ${t}`);
    }
    ok(visao.includes('amostraCobreJanela') && visao.includes('AVISO_DE_AMOSTRA'), '(x) a linha de amostra incompleta (R5) na tela');
    ok(visao.includes('respostaEhDoPeriodo') && /resumo\.value\.empresaId !== empresaId/.test(visao), '(viii) descarta outro período e outra empresa (T2)');
    ok(/'X-Empresa-Id': empresaId/.test(visao), '(viii) pede com a empresa do endereço');
    ok(visao.includes('comparar=1'), '(viii) pede o período anterior (variação)');
    ok(
      emOrdem(visao, ['<FluxoDoEvento', '<Kpis', '<Funil', '<Receita', '<AtividadeRecente', '<Qualidade', '<ChecklistEmpresa']),
      '(viii) os blocos na ordem da spec'
    );
  }

  // (ix) nenhum arquivo da pasta importa lucide (G9).
  const pasta = path.join(RAIZ, ...PASTA_VG);
  const arquivos = fs.readdirSync(pasta).filter((n) => /\.(tsx?|mjs|js)$/.test(n));
  const comLucide = arquivos.filter((n) => /lucide/.test(fs.readFileSync(path.join(pasta, n), 'utf8')));
  ok(arquivos.length >= 10 && comLucide.length === 0, '(ix) nenhum arquivo de visao-geral/ importa lucide', mostra(comLucide));

  // A página e a fronteira dos segredos (Desvio 1): o servidor lê, o navegador recebe só o derivado.
  const pagina = ler('src', 'app', '(console)', 'e', '[slug]', 'page.tsx');
  ok(pagina !== null && pagina.includes('<VisaoGeral') && pagina.includes('key={empresaId}'), 'a página monta <VisaoGeral key={empresaId}>');
  const servidor = ler(...PASTA_VG, 'checklist-do-servidor.ts');
  ok(
    servidor !== null && servidor.startsWith("import 'server-only'") && servidor.includes('publicarMarca'),
    'o checklist é lido só no servidor, com publicarMarca (só temToken)'
  );
  // O uso do campo, e não a palavra: os comentários citam a regra ("nenhum segredo desce").
  ok(
    ![visao, pagina, ler(...PASTA_VG, 'ChecklistEmpresa.tsx')].some(
      (t) => t && /\.segredo\b|\bsegredo\s*[:=?]|whsec_|accessToken|access_token/.test(t)
    ),
    'nenhum segredo do webhook nem token na tela nem na página'
  );

  const checklist = ler(...PASTA_VG, 'ChecklistEmpresa.tsx');
  ok(
    checklist !== null && checklist.includes('Configuração {checklist.contagem}') && checklist.includes('Ver configuração') && checklist.includes('aria-expanded'),
    'a faixa "Configuração x de 6 · … · Ver configuração" abre a lista dos 6 passos'
  );

  const cabecalho = ler('src', 'components', 'layout', 'Header.tsx');
  ok(
    cabecalho !== null && cabecalho.includes('useEstadoNoCabecalho') && cabecalho.includes('proximo.verbo') && cabecalho.includes("acao === 'copiar-tag'"),
    'o cabeçalho: selo medido e o verbo do próximo passo na Visão geral'
  );

  const empresas = ler('src', 'app', '(console)', 'empresas', 'page.tsx');
  ok(empresas !== null && empresas.includes('lerChecklistDaEmpresa') && empresas.includes('estado.rotulo'), '/empresas: a coluna Estado com estadoDaEmpresa');
}

/* ---------------- Fim ---------------- */

ok(chamadas.length === 0, 'nenhuma chamada de rede', mostra(chamadas));
process.chdir(RAIZ);
fs.rmSync(PASTA, { recursive: true, force: true });

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('\nVisão geral: tudo certo.');
