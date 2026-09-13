#!/usr/bin/env node
/**
 * Testes automatizados do resumo do Painel de eventos (src/lib/inbox-resumo.ts).
 *
 * O que está sendo protegido aqui é a HONESTIDADE do número que o dono vê. Um
 * painel que conta teste da equipe como venda (regra 4 do CLAUDE.md) ou que
 * divide por uma base errada faz o dono decidir campanha em cima de mentira.
 * Por isso cada porcentagem é conferida com a conta na mão.
 *
 * Cobre:
 *  1. Lista vazia — nada quebra, tudo vira null
 *  2. Porcentagem simples sobre a base
 *  3. Teste da equipe fica FORA da base e vira card próprio
 *  4. Janela de período (7 / 30 / 90) inclui e exclui
 *  5. Data ilegível não derruba nem entra
 *  6. Um evento com dois sinais conta nos dois cards
 *  7. Sem atribuição é quem não tem NENHUM dos cinco sinais
 *  8. Situação: enviados, na fila, ignorados
 *  9. EMQ médio só dos enviados com nota
 * 10. Top de eventos ordenado e cortado em oito
 * 11. Receita só com moeda única
 * 12. periodoValido aceita três valores e cai em 30 no resto
 *
 * Uso: npm run test:inbox-resumo
 */

const { resumirInbox, periodoValido } = await import(
  new URL('../src/lib/inbox-resumo.ts', import.meta.url).href
);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

/** Relógio fixo: sem isto, um caso de "40 dias atrás" passa hoje e falha amanhã. */
const AGORA = '2026-09-13T12:00:00.000Z';
const diasAtras = (n) => new Date(Date.parse(AGORA) - n * 24 * 60 * 60 * 1000).toISOString();

/** Item real, na fila, sem nenhuma atribuição: o piso de tudo. */
const item = (extra = {}) => ({
  recebidoEm: diasAtras(1),
  status: 'novo',
  evento: 'Purchase',
  temFbc: false,
  temFbp: false,
  ...extra,
});

console.log('\n  Resumo do Painel de eventos\n');

/* ---------------- 1. Lista vazia ---------------- */
{
  const r = resumirInbox([], AGORA, 30);
  ok(r.base === 0, 'lista vazia: base zero');
  ok(r.amostra === 0, 'lista vazia: amostra zero');
  ok(r.volume.recebidos === 0, 'lista vazia: nenhum recebido');
  ok(r.volume.enviados.pct === null, 'lista vazia: porcentagem e null, nao NaN nem zero mentiroso');
  ok(r.atribuicao.metaFbclid.pct === null, 'lista vazia: atribuicao tambem e null');
  ok(r.qualidade.emqMedio === null, 'lista vazia: EMQ medio e null');
  ok(r.porEvento.length === 0, 'lista vazia: nenhum evento no topo');
  ok(r.receitaEnviada === null, 'lista vazia: nenhuma receita');
  ok(r.periodoDias === 30, 'lista vazia: o periodo pedido volta no resumo');
}

/* ---------------- 2. Porcentagem sobre a base ---------------- */
{
  const itens = [];
  for (let i = 0; i < 10; i++) itens.push(item({ temFbclid: i < 4 }));
  const r = resumirInbox(itens, AGORA, 30);
  ok(r.base === 10, 'dez eventos reais viram base dez');
  ok(r.atribuicao.metaFbclid.total === 4, 'quatro com fbclid');
  ok(r.atribuicao.metaFbclid.pct === 40, 'quatro em dez sao 40 por cento', String(r.atribuicao.metaFbclid.pct));
}

/* ---------------- 3. Teste da equipe fora da base ---------------- */
{
  const itens = [];
  for (let i = 0; i < 10; i++) itens.push(item({ temFbclid: i < 4 }));
  itens.push(item({ testeInterno: true, temFbclid: true }));
  itens.push(item({ testePlataforma: true, temFbclid: true }));
  const r = resumirInbox(itens, AGORA, 30);
  ok(r.base === 10, 'teste da equipe NAO entra na base', 'base=' + r.base);
  ok(r.volume.testesEquipe === 2, 'teste da equipe vira card proprio');
  ok(r.volume.recebidos === 12, 'mas o recebido no periodo conta todo mundo');
  ok(r.atribuicao.metaFbclid.total === 4, 'o fbclid do teste NAO infla a atribuicao');
  ok(r.atribuicao.metaFbclid.pct === 40, 'e a porcentagem continua 40, nao 50');
}

/* ---------------- 4. Janela de período ---------------- */
{
  const itens = [item({ recebidoEm: diasAtras(40) })];
  ok(resumirInbox(itens, AGORA, 30).base === 0, 'evento de 40 dias fica fora da janela de 30');
  ok(resumirInbox(itens, AGORA, 90).base === 1, 'e entra na janela de 90');
  ok(resumirInbox([item({ recebidoEm: diasAtras(3) })], AGORA, 7).base === 1, 'evento de 3 dias entra na de 7');
  ok(resumirInbox([item({ recebidoEm: diasAtras(9) })], AGORA, 7).base === 0, 'e o de 9 dias, nao');
}

/* ---------------- 5. Data ilegível ---------------- */
{
  const r = resumirInbox([item({ recebidoEm: 'ontem de tarde' }), item()], AGORA, 30);
  ok(r.base === 1, 'data ilegivel nao lanca e fica de fora', 'base=' + r.base);
}

/* ---------------- 6. Dois sinais no mesmo evento ---------------- */
{
  const r = resumirInbox([item({ temFbclid: true, temGclid: true })], AGORA, 30);
  ok(r.atribuicao.metaFbclid.total === 1, 'evento com fbclid e gclid conta na Meta');
  ok(r.atribuicao.google.total === 1, 'e conta no Google tambem');
  ok(r.atribuicao.semAtribuicao.total === 0, 'e nao conta como sem atribuicao');
  ok(
    r.atribuicao.metaFbclid.pct + r.atribuicao.google.pct > 100,
    '🔴 as porcentagens NAO somam 100 de proposito — a tela avisa isso'
  );
}

/* ---------------- 7. Sem atribuição ---------------- */
{
  const itens = [
    item(),
    item({ temFbc: true }),
    item({ temTtclid: true }),
    item({ temMsclkid: true }),
    item({ temGclid: true }),
    item({ temFbclid: true }),
  ];
  const r = resumirInbox(itens, AGORA, 30);
  ok(r.atribuicao.semAtribuicao.total === 1, 'so quem nao tem NENHUM dos cinco sinais e sem atribuicao');
  ok(r.atribuicao.tiktok.total === 1, 'ttclid vira card do TikTok');
  ok(r.atribuicao.microsoft.total === 1, 'msclkid vira card da Microsoft');
  ok(r.atribuicao.metaFbc.total === 1, 'o cookie _fbc tem card proprio, separado do fbclid');
}

/* ---------------- 8. Situação ---------------- */
{
  const itens = [
    item({ status: 'disparado' }),
    item({ status: 'disparado' }),
    item({ status: 'novo' }),
    item({ status: 'carregado' }),
    item({ status: 'ignorado' }),
  ];
  const r = resumirInbox(itens, AGORA, 30);
  ok(r.volume.enviados.total === 2, 'dois enviados a Meta');
  ok(r.volume.naFila.total === 2, 'novo e carregado contam juntos como fila');
  ok(r.volume.ignorados.total === 1, 'um ignorado');
  ok(r.volume.enviados.pct === 40, 'dois em cinco sao 40 por cento');
}

/* ---------------- 9. EMQ médio ---------------- */
{
  const itens = [
    item({ status: 'disparado', emq: 6 }),
    item({ status: 'disparado', emq: 9 }),
    item({ status: 'disparado' }),
    item({ status: 'novo', emq: 1 }),
  ];
  const r = resumirInbox(itens, AGORA, 30);
  ok(r.qualidade.enviadosComEmq === 2, 'so os enviados COM nota entram na media');
  ok(r.qualidade.emqMedio === 7.5, 'media de 6 e 9 e 7.5', String(r.qualidade.emqMedio));
  ok(
    resumirInbox([item({ status: 'disparado' })], AGORA, 30).qualidade.emqMedio === null,
    'enviado sem nota nenhuma deixa a media em null, nao em zero'
  );
}

/* ---------------- 10. Top de eventos ---------------- */
{
  const itens = [];
  for (let i = 0; i < 5; i++) itens.push(item({ eventoOrigem: 'order.paid' }));
  for (let i = 0; i < 3; i++) itens.push(item({ eventoOrigem: 'order.created' }));
  itens.push(item({ evento: 'Lead', eventoOrigem: undefined }));
  const r = resumirInbox(itens, AGORA, 30);
  ok(r.porEvento[0].evento === 'order.paid', 'o mais frequente vem primeiro');
  ok(r.porEvento[0].total === 5, 'com a contagem certa');
  ok(r.porEvento[0].pct === 55.6, 'cinco em nove sao 55.6 por cento', String(r.porEvento[0].pct));
  ok(r.porEvento[2].evento === 'Lead', 'sem eventoOrigem, vale o evento traduzido');

  const muitos = [];
  for (let i = 0; i < 12; i++) muitos.push(item({ eventoOrigem: 'evento-' + i }));
  ok(resumirInbox(muitos, AGORA, 30).porEvento.length === 8, 'o topo para em oito nomes');
}

/* ---------------- 11. Receita ---------------- */
{
  const mesmaMoeda = [
    item({ status: 'disparado', valor: 10.5, moeda: 'BRL' }),
    item({ status: 'disparado', valor: 4.5, moeda: 'BRL' }),
  ];
  const r1 = resumirInbox(mesmaMoeda, AGORA, 30);
  ok(r1.receitaEnviada?.total === 15, 'soma o valor dos enviados');
  ok(r1.receitaEnviada?.moeda === 'BRL', 'e diz a moeda');

  const misturada = [
    item({ status: 'disparado', valor: 10, moeda: 'BRL' }),
    item({ status: 'disparado', valor: 10, moeda: 'USD' }),
  ];
  ok(
    resumirInbox(misturada, AGORA, 30).receitaEnviada === null,
    '🔴 moeda misturada nao vira soma: somar real com dolar seria numero inventado'
  );
}

/* ---------------- 12. periodoValido ---------------- */
{
  ok(periodoValido('7') === 7, 'texto "7" vira 7');
  ok(periodoValido(30) === 30, 'numero 30 vira 30');
  ok(periodoValido('90') === 90, 'texto "90" vira 90');
  ok(periodoValido('abc') === 30, 'lixo cai no padrao de 30');
  ok(periodoValido(null) === 30, 'ausente cai no padrao de 30');
  ok(periodoValido(15) === 30, 'valor fora dos tres tambem cai em 30');
}

/* ---------------- Fechamento ---------------- */
console.log(
  falhas === 0
    ? '\n  O painel conta o que chegou sem contar teste da equipe, e nao divide por base errada.\n'
    : `\n  ${falhas} FALHA(S)\n`
);
process.exit(falhas ? 1 : 0);
