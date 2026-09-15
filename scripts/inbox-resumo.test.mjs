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
 * 12. periodoValido aceita os cinco valores e cai em 30 no resto
 * 13. Hoje e Ontem são dia de calendário no fuso de Brasília
 * 14. Período livre: duas datas, inclusivo nas duas pontas, sem futuro
 * 15. periodoValido com de/ate — data impossível e lixo caem no padrão
 * 16. A amostra pode ser menor que a janela, e o resumo diz isso
 * 17. O destaque de compras: quantidade, valor e a divisão da campanha da Meta
 * 18. Compras com moeda misturada e com nome de evento traduzido
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
  ok(r.periodo === 30, 'lista vazia: o periodo pedido volta no resumo');
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
  ok(periodoValido('hoje') === 'hoje', 'texto "hoje" passa inteiro');
  ok(periodoValido('ontem') === 'ontem', 'texto "ontem" passa inteiro');
  ok(periodoValido('abc') === 30, 'lixo cai no padrao de 30');
  ok(periodoValido(null) === 30, 'ausente cai no padrao de 30');
  ok(periodoValido(15) === 30, 'valor fora dos cinco tambem cai em 30');
}

/* ---------------- 13. Hoje e Ontem sao dia de calendario ---------------- */
{
  // AGORA e 13/09 12:00 UTC = 13/09 09:00 em Brasilia. As horas abaixo sao
  // escolhidas para cair dos dois lados da meia-noite BRASILEIRA, que e o
  // ponto do teste: 03:00 UTC ainda e ONTEM aqui.
  const emUtc = (iso) => item({ recebidoEm: iso });
  const hojeDeManha = emUtc('2026-09-13T11:00:00.000Z'); // 08:00 BRT de hoje
  const hojeDeMadrugada = emUtc('2026-09-13T04:00:00.000Z'); // 01:00 BRT de hoje
  const ontemANoite = emUtc('2026-09-13T02:00:00.000Z'); // 23:00 BRT de ONTEM
  const ontemDeDia = emUtc('2026-09-12T15:00:00.000Z'); // 12:00 BRT de ontem
  const anteontem = emUtc('2026-09-11T15:00:00.000Z');

  const hoje = resumirInbox([hojeDeManha, hojeDeMadrugada, ontemANoite, ontemDeDia], AGORA, 'hoje');
  ok(hoje.base === 2, 'hoje conta so o que entrou depois da meia-noite de Brasilia');
  ok(hoje.periodo === 'hoje', 'e devolve o periodo pedido, sem virar numero');

  const ontem = resumirInbox([hojeDeManha, ontemANoite, ontemDeDia, anteontem], AGORA, 'ontem');
  ok(ontem.base === 2, 'ontem e o dia fechado: nao pega hoje nem anteontem');

  ok(
    resumirInbox([ontemANoite], AGORA, 'hoje').base === 0,
    '🔴 evento das 23h de ontem (02h UTC de hoje) NAO conta como hoje: o fuso e de Brasilia'
  );
}

/* ---------------- 14. Periodo livre: duas datas, inclusivo nas pontas ------ */
{
  const emUtc = (iso) => item({ recebidoEm: iso });
  // Meia-noite de Brasilia do dia 11 e 03:00 UTC do dia 11.
  const dia10Tarde = emUtc('2026-09-10T20:00:00.000Z'); // 17:00 BRT do dia 10
  const dia11Comeco = emUtc('2026-09-11T03:00:00.000Z'); // 00:00 BRT do dia 11
  const dia11Fim = emUtc('2026-09-12T02:59:59.000Z'); // 23:59 BRT do dia 11
  const dia12 = emUtc('2026-09-12T15:00:00.000Z'); // 12:00 BRT do dia 12
  const todos = [dia10Tarde, dia11Comeco, dia11Fim, dia12];

  const soDia11 = resumirInbox(todos, AGORA, { de: '2026-09-11', ate: '2026-09-11' });
  ok(soDia11.base === 2, 'um dia so pega o dia inteiro: da meia-noite as 23h59', String(soDia11.base));
  ok(
    soDia11.periodo.de === '2026-09-11' && soDia11.periodo.ate === '2026-09-11',
    'e devolve o intervalo pedido, para a tela conferir que a resposta e desta janela'
  );

  ok(
    resumirInbox(todos, AGORA, { de: '2026-09-10', ate: '2026-09-12' }).base === 4,
    'o intervalo e INCLUSIVO nas duas pontas'
  );
  ok(
    resumirInbox(todos, AGORA, { de: '2026-09-12', ate: '2026-09-12' }).base === 1,
    '🔴 evento das 23h59 do dia 11 (02h59 UTC do dia 12) NAO cai no dia 12'
  );

  // A janela volta em ISO para a lista do recorte filtrar pelo MESMO corte.
  const j = soDia11.janela;
  ok(
    j.inicio === '2026-09-11T03:00:00.000Z' && j.fim === '2026-09-12T02:59:59.999Z',
    'a janela devolvida e a meia-noite de Brasilia das duas pontas',
    `${j.inicio} -> ${j.fim}`
  );

  // Futuro nao existe: pedir ate uma data adiante para em AGORA.
  ok(
    resumirInbox([], AGORA, { de: '2026-09-13', ate: '2026-12-31' }).janela.fim === AGORA,
    'a ponta final nunca passa de agora'
  );
}

/* ---------------- 15. periodoValido com de/ate ---------------- */
{
  const p = periodoValido(null, '2026-09-01', '2026-09-10');
  ok(p.de === '2026-09-01' && p.ate === '2026-09-10', 'duas datas validas viram periodo livre');

  const trocado = periodoValido(null, '2026-09-10', '2026-09-01');
  ok(
    trocado.de === '2026-09-01' && trocado.ate === '2026-09-10',
    'ordem invertida e desentortada em vez de virar o padrao de 30'
  );

  ok(
    periodoValido('7', '2026-09-01', '2026-09-10').de === '2026-09-01',
    'as datas mandam mais que o ?dias= que ficou para tras'
  );
  ok(periodoValido('7', '2026-09-01', null) === 7, 'uma data so nao faz intervalo: vale o ?dias=');
  ok(periodoValido(null, '2026-09-01') === 30, 'uma data so e sem dias cai no padrao de 30');
  ok(periodoValido(null, '2026-02-30', '2026-03-01') === 30, '🔴 30 de fevereiro nao existe: cai no padrao');
  ok(periodoValido(null, '2026-13-01', '2026-13-02') === 30, 'mes 13 nao existe: cai no padrao');
  ok(periodoValido(null, '01/09/2026', '10/09/2026') === 30, 'formato brasileiro na URL nao passa');
  ok(periodoValido(null, "2026-09-01'; DROP", '2026-09-10') === 30, 'lixo com aspas nao vira data');
}

/* ---------------- 16. A amostra pode ser menor que a janela ---------------- */
{
  const dentro = Array.from({ length: 5 }, () => item({ recebidoEm: diasAtras(1) }));

  const folgado = resumirInbox(dentro, AGORA, 30, 1000);
  ok(folgado.amostraCobreJanela === true, 'amostra longe do teto cobre a janela');

  // Amostra NO teto e o item mais antigo dela ja dentro do periodo: existe
  // evento na janela que a leitura nao alcancou.
  const noTeto = resumirInbox(dentro, AGORA, 30, 5);
  ok(
    noTeto.amostraCobreJanela === false,
    '🔴 amostra no teto com o mais antigo dentro do periodo NAO cobre a janela'
  );

  const alcanca = resumirInbox([...dentro, item({ recebidoEm: diasAtras(40) })], AGORA, 30, 6);
  ok(
    alcanca.amostraCobreJanela === true,
    'se a leitura alcanca algo ANTERIOR ao inicio, a contagem esta fechada'
  );
}

/* ---------------- 17. O destaque de compras ---------------- */
{
  // Quatro compras reais, duas com clique da Meta, uma outra coisa qualquer e
  // um teste da equipe que NAO pode entrar em lugar nenhum da conta.
  const itens = [
    item({ evento: 'Purchase', valor: 100, moeda: 'BRL', temFbclid: true, status: 'disparado' }),
    item({ evento: 'Purchase', valor: 50.5, moeda: 'BRL', temFbc: true, status: 'disparado' }),
    item({ evento: 'Purchase', valor: 20, moeda: 'BRL' }),
    item({ evento: 'Purchase', valor: 9.5, moeda: 'BRL', temGclid: true }),
    item({ evento: 'Lead' }),
    item({ evento: 'Purchase', valor: 999, moeda: 'BRL', testeInterno: true, temFbclid: true }),
  ];
  const r = resumirInbox(itens, AGORA, 30);

  ok(r.compras.total === 4, 'quatro compras reais', String(r.compras.total));
  ok(r.compras.valor === 180, 'a soma e 100 + 50,50 + 20 + 9,50', String(r.compras.valor));
  ok(r.compras.moeda === 'BRL', 'moeda unica volta nomeada');
  ok(r.compras.enviadas === 2, 'duas ja aceitas pela Meta', String(r.compras.enviadas));

  // 🔴 O teste da equipe nao aparece em NENHUMA das linhas: nem no total, nem
  // no valor, nem nas duas metades. Se entrasse, o painel diria que entraram
  // R$ 999 que nunca existiram.
  ok(r.compras.valor !== 1179, '🔴 teste da equipe fica fora do valor das compras');

  // A divisao da campanha e META-ONLY: fbclid ou fbc. O gclid de 9,50 cai no
  // lado SEM atribuicao da Meta de proposito — a campanha desta tela e a da
  // Meta, e cobrar dela uma venda que veio do Google seria inventar resultado.
  ok(r.compras.atribuidasMeta.total === 2, 'duas compras com clique da Meta');
  ok(
    r.compras.atribuidasMeta.valor === 150.5,
    'valor atribuido a Meta e 150,50',
    String(r.compras.atribuidasMeta.valor)
  );
  ok(r.compras.semAtribuicaoMeta.total === 2, '🔴 a compra com gclid conta como SEM atribuicao da Meta');
  ok(
    r.compras.semAtribuicaoMeta.valor === 29.5,
    'valor sem atribuicao da Meta e 29,50',
    String(r.compras.semAtribuicaoMeta.valor)
  );

  // As duas metades fecham o total: nenhuma compra some no meio da divisao.
  ok(
    r.compras.atribuidasMeta.total + r.compras.semAtribuicaoMeta.total === r.compras.total,
    '🔴 as duas metades somam o total de compras'
  );
  ok(
    Math.round((r.compras.atribuidasMeta.valor + r.compras.semAtribuicaoMeta.valor) * 100) / 100 ===
      r.compras.valor,
    '🔴 as duas metades somam o valor total'
  );
}

/* ---------------- 18. Compras: moeda misturada e nome traduzido ---------------- */
{
  // Duas moedas na mesma janela: somar seria inventar um numero. O total de
  // QUANTIDADE continua valendo — o que morre e so o dinheiro.
  const r = resumirInbox(
    [
      item({ evento: 'Purchase', valor: 100, moeda: 'BRL' }),
      item({ evento: 'Purchase', valor: 100, moeda: 'USD' }),
    ],
    AGORA,
    30
  );
  ok(r.compras.total === 2, 'moeda misturada: a quantidade continua de pe');
  ok(r.compras.valor === null, '🔴 moeda misturada: valor e null, nunca uma soma de laranja com maca');
  ok(r.compras.moeda === null, 'moeda misturada: nenhuma moeda para nomear');
  ok(r.compras.atribuidasMeta.valor === null, 'moeda misturada: as metades tambem ficam sem valor');

  // O nome da origem pode ser qualquer coisa; quem manda e o `eventoMeta`,
  // porque e ele que a Meta vai receber.
  const traduzido = resumirInbox(
    [item({ evento: 'compra_aprovada', eventoMeta: 'Purchase', valor: 10, moeda: 'BRL' })],
    AGORA,
    30
  );
  ok(traduzido.compras.total === 1, '🔴 evento traduzido para Purchase conta como compra');
}

/* ---------------- Fechamento ---------------- */
console.log(
  falhas === 0
    ? '\n  O painel conta o que chegou sem contar teste da equipe, e nao divide por base errada.\n'
    : `\n  ${falhas} FALHA(S)\n`
);
process.exit(falhas ? 1 : 0);
