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
 * 19. Envio em modo teste fica FORA de "Enviados à Meta", do valor enviado, do
 *     EMQ e das compras aceitas, e aparece à parte (C9, D20)
 * 20. `duplicado` de Pixel real prova envio real (R1 da C9, V4)
 * 21. qualidade.aceitos / qualidade.recusados, com os nomes reais do log (V4)
 * 22. porEventoMeta: PageView, InitiateCheckout, Purchase, sem teste (V4)
 * 23. porDia no fuso de Brasília, moeda misturada, amostra incompleta (V4)
 * 24. anterior só com comparar, e a janela certa de cada período (V4)
 * 25. As rotas: comparar e empresaId no resumo; eventId e nunca emailHash na
 *     lista de /api/inbox (V4) — num diretório temporário, sem rede
 *
 * Uso: npm run test:inbox-resumo
 */

/**
 * Rede proibida (trava do pacote 16, §2.2). O resumo é função pura e não
 * deveria chamar ninguém; se um dia chamar, o teste quebra aqui, e não na
 * Meta. Vale para qualquer endereço, inclusive graph.facebook.com e
 * api.cloudflare.com. Instalado ANTES do import, e sem credencial nenhuma no
 * ambiente.
 */
let chamadasDeRede = 0;
globalThis.fetch = async (alvo) => {
  chamadasDeRede++;
  const url = String(alvo?.url ?? alvo);
  throw new Error(`[inbox-resumo.test] chamada de rede proibida: ${url}`);
};
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const { resumirInbox, periodoValido, enviadoSoEmTeste } = await import(
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
  ok(periodoValido('abc') === 'hoje', 'lixo cai no padrao de hoje');
  ok(periodoValido(null) === 'hoje', 'ausente cai no padrao de hoje');
  ok(periodoValido(15) === 'hoje', 'valor fora dos cinco tambem cai em hoje');
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
    'ordem invertida e desentortada em vez de virar o padrao de hoje'
  );

  ok(
    periodoValido('7', '2026-09-01', '2026-09-10').de === '2026-09-01',
    'as datas mandam mais que o ?dias= que ficou para tras'
  );
  ok(periodoValido('7', '2026-09-01', null) === 7, 'uma data so nao faz intervalo: vale o ?dias=');
  ok(periodoValido(null, '2026-09-01') === 'hoje', 'uma data so e sem dias cai no padrao de hoje');
  ok(periodoValido(null, '2026-02-30', '2026-03-01') === 'hoje', '🔴 30 de fevereiro nao existe: cai no padrao');
  ok(periodoValido(null, '2026-13-01', '2026-13-02') === 'hoje', 'mes 13 nao existe: cai no padrao');
  ok(periodoValido(null, '01/09/2026', '10/09/2026') === 'hoje', 'formato brasileiro na URL nao passa');
  ok(periodoValido(null, "2026-09-01'; DROP", '2026-09-10') === 'hoje', 'lixo com aspas nao vira data');
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

  // R2 da V4: a memoria e de TODAS as empresas. Empresa quieta com 5 itens
  // (lista bem abaixo do teto), mas a memoria global esta no teto e comeca ha
  // 2 dias: os itens dela de antes disso sairam. A janela de 30 dias NAO esta
  // coberta, e o dia de ha 10 dias nao pode virar "0".
  const memoriaNoTeto = Date.parse(diasAtras(2));
  const quieta = resumirInbox(dentro, AGORA, 30, 1000, { memoriaComecaEm: memoriaNoTeto });
  ok(
    quieta.amostraCobreJanela === false,
    '🔴 R2 V4: lista curta com a memoria global no teto dentro da janela NAO cobre a janela'
  );
  const memoriaAntiga = resumirInbox(dentro, AGORA, 30, 1000, { memoriaComecaEm: Date.parse(diasAtras(40)) });
  ok(
    memoriaAntiga.amostraCobreJanela === true,
    'R2 V4: memoria global no teto mas comecando antes da janela: cobre'
  );
  const semTeto = resumirInbox(dentro, AGORA, 30, 1000, { memoriaComecaEm: null });
  ok(semTeto.amostraCobreJanela === true, 'R2 V4: memoria fora do teto (null) nao muda nada');
  const vaziaNoTeto = resumirInbox([], AGORA, 30, 1000, { memoriaComecaEm: memoriaNoTeto });
  ok(
    vaziaNoTeto.amostraCobreJanela === false,
    'R2 V4: empresa sem item nenhum na memoria cheia tambem nao "cobre" (pode ter saido tudo)'
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

/* ---------------- 19. Modo teste fora de "Enviados à Meta" (C9, D20) ---------------- */
{
  // O resultado por Pixel tem os nomes REAIS de `ResultadoPorPixel`
  // (`inbox.ts:57-69`): `status: 'enviado'` quando a Meta aceitou, com
  // `httpStatus` e `eventsReceived` em camelCase. Um Pixel com código de teste
  // grava `modoTeste: true` — o evento foi para o "Testar eventos", que não é
  // conversão nenhuma.
  const aceitoEmTeste = { marcaId: 'gtech', status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste: true };
  const aceitoReal = { marcaId: 'cv', status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste: false };

  // Uma venda real enviada só com o Pixel em teste, e uma enviada de verdade.
  const soTeste = item({
    evento: 'Purchase',
    status: 'disparado',
    valor: 197,
    moeda: 'BRL',
    emq: 3,
    resultados: [aceitoEmTeste],
  });
  const real = item({
    evento: 'Purchase',
    status: 'disparado',
    valor: 97,
    moeda: 'BRL',
    emq: 9,
    resultados: [aceitoReal],
  });

  const r = resumirInbox([soTeste, real], AGORA, 30);
  ok(r.volume.enviados.total === 1, '🔴 envio so em modo teste NAO conta em "Enviados a Meta"', String(r.volume.enviados.total));
  ok(r.volume.enviadosEmTeste === 1, 'e aparece a parte, em enviadosEmTeste', String(r.volume.enviadosEmTeste));
  ok(r.base === 2, 'a venda continua sendo evento real: fica na base das porcentagens', 'base=' + r.base);
  ok(r.volume.enviados.pct === 50, 'um enviado de verdade em dois reais sao 50 por cento', String(r.volume.enviados.pct));
  ok(
    r.receitaEnviada?.total === 97,
    '🔴 o valor enviado a Meta NAO soma o envio de teste (97, nao 294)',
    String(r.receitaEnviada?.total)
  );
  ok(r.qualidade.emqMedio === 9, 'o EMQ medio olha so o envio real', String(r.qualidade.emqMedio));
  ok(r.qualidade.enviadosComEmq === 1, 'e conta so um evento com nota');
  ok(r.compras.total === 2, 'as duas compras continuam contadas como compra');
  ok(r.compras.enviadas === 1, '🔴 "Ja aceitas pela Meta" conta so a compra enviada de verdade', String(r.compras.enviadas));
  ok(r.compras.enviadasEmTeste === 1, 'e a compra so de teste aparece a parte', String(r.compras.enviadasEmTeste));

  // Só teste, sozinho: nada foi para a Meta de verdade, e a receita não é zero
  // inventado — é "nada enviado".
  const sozinho = resumirInbox([soTeste], AGORA, 30);
  ok(sozinho.volume.enviados.total === 0, 'so teste: enviados.total e 0');
  ok(sozinho.volume.enviadosEmTeste === 1, 'so teste: enviadosEmTeste e 1');
  ok(sozinho.receitaEnviada === null, 'so teste: nenhuma receita enviada, em vez de somar o valor do teste');
  ok(sozinho.qualidade.emqMedio === null, 'so teste: EMQ medio e null, nao a nota do teste');

  // Item antigo, gravado antes de `resultados` existir: não há como saber, e a
  // ausência vale como envio real (a mesma regra do dedup, P6).
  const antigo = resumirInbox([item({ status: 'disparado', valor: 10, moeda: 'BRL' })], AGORA, 30);
  ok(antigo.volume.enviados.total === 1, 'item antigo sem resultados segue contando como enviado real');
  ok(antigo.volume.enviadosEmTeste === 0, 'e nao vira teste');
  ok(antigo.receitaEnviada?.total === 10, 'e o valor dele continua no valor enviado');

  // O `anotarResultado` sobrescreve os resultados a cada disparo: uma venda
  // real disparada de novo fica só com `duplicado`. Sem nenhum resultado
  // aceito na lista, não há prova de teste, e ela segue real.
  const reenviado = resumirInbox(
    [item({ status: 'disparado', resultados: [{ marcaId: 'cv', status: 'duplicado', modoTeste: false }] })],
    AGORA,
    30
  );
  ok(reenviado.volume.enviados.total === 1, '🔴 disparado sem nenhum aceito na lista (duplicado) NAO vira teste');
  ok(reenviado.volume.enviadosEmTeste === 0, 'e enviadosEmTeste fica em 0');

  // Dois Pixels: um em teste, outro em produção. Um aceite real basta.
  const misto = resumirInbox(
    [item({ status: 'disparado', resultados: [aceitoEmTeste, aceitoReal] })],
    AGORA,
    30
  );
  ok(misto.volume.enviados.total === 1, 'um Pixel em teste e outro em producao: conta como enviado real');
  ok(misto.volume.enviadosEmTeste === 0, 'e nao conta como teste');

  // Falha no Pixel de produção e aceite só no de teste: nada chegou de verdade.
  const falhouReal = resumirInbox(
    [
      item({
        status: 'disparado',
        resultados: [aceitoEmTeste, { marcaId: 'cv', status: 'erro', httpStatus: 400, modoTeste: false }],
      }),
    ],
    AGORA,
    30
  );
  ok(falhouReal.volume.enviados.total === 0, '🔴 aceito so no Pixel de teste e erro no real: NAO e envio real');
  ok(falhouReal.volume.enviadosEmTeste === 1, 'e conta como envio em modo teste');

  // Aceite gravado só com os números da Meta (sem `status`): mesma régua de
  // `auto-dispatch.ts`, `httpStatus 200` com `eventsReceived > 0`.
  const soNumeros = resumirInbox(
    [item({ status: 'disparado', resultados: [{ marcaId: 'g', httpStatus: 200, eventsReceived: 1, modoTeste: true }] })],
    AGORA,
    30
  );
  ok(soNumeros.volume.enviadosEmTeste === 1, 'aceite medido por httpStatus 200 e eventsReceived tambem separa o teste');

  // `resultados` vem de arquivo em disco (`unknown[]` em `ItemInbox`): lixo na
  // lista não derruba a conta, e `modoTeste` em texto não prova teste nenhum.
  const lixo = resumirInbox(
    [
      item({ status: 'disparado', resultados: [null, 'enviado', 42] }),
      item({ status: 'disparado', resultados: [{ status: 'enviado', modoTeste: 'true' }] }),
    ],
    AGORA,
    30
  );
  ok(lixo.volume.enviados.total === 2, 'resultado ilegivel nao lanca e o item segue como envio real');
  ok(lixo.volume.enviadosEmTeste === 0, 'modoTeste em texto ("true") nao vira teste');

  // Teste da equipe já sai inteiro da conta e tem card próprio: não entra
  // também em enviadosEmTeste, senão o mesmo item apareceria em dois lugares.
  const equipe = resumirInbox(
    [item({ status: 'disparado', testeInterno: true, resultados: [aceitoEmTeste] })],
    AGORA,
    30
  );
  ok(equipe.volume.enviadosEmTeste === 0, 'teste da equipe nao entra em enviadosEmTeste: ja tem card proprio');
  ok(equipe.volume.testesEquipe === 1, 'e continua no card de testes da equipe');

  // Item na fila com resultado de teste antigo não é enviado de jeito nenhum.
  const naFila = resumirInbox([item({ status: 'novo', resultados: [aceitoEmTeste] })], AGORA, 30);
  ok(naFila.volume.enviadosEmTeste === 0, 'item fora de "disparado" nunca conta como enviado em teste');

  ok(resumirInbox([], AGORA, 30).volume.enviadosEmTeste === 0, 'lista vazia: enviadosEmTeste e 0');
  ok(resumirInbox([], AGORA, 30).compras.enviadasEmTeste === 0, 'lista vazia: compras.enviadasEmTeste e 0');
}

/* ---------------- 20. "duplicado" real prova envio real (R1 da C9, V4 passo 6) ---------------- */
{
  // Uma regra com dois Pixels: A em producao, B com codigo de teste. A venda
  // saiu de verdade por A; quando foi disparada de novo, A respondeu
  // `duplicado` ("ja foi aceito pela Meta neste Pixel") e B aceitou em teste.
  // Os resultados sao sobrescritos a cada disparo, entao o item fica com
  // [A duplicado real, B enviado teste]. Antes da V4 isso virava "so teste":
  // sumia de "Enviados a Meta" e do valor por uma venda que ja contou.
  const reenviadaComTeste = item({
    evento: 'Purchase',
    status: 'disparado',
    valor: 197,
    moeda: 'BRL',
    resultados: [
      { marcaId: 'a', status: 'duplicado', modoTeste: false },
      { marcaId: 'b', status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste: true },
    ],
  });
  ok(
    enviadoSoEmTeste(reenviadaComTeste) === false,
    '🔴 R1: [duplicado real, enviado em teste] NAO e "so teste": o duplicado real prova que a venda ja contou'
  );
  const r = resumirInbox([reenviadaComTeste], AGORA, 30);
  ok(r.volume.enviados.total === 1, 'R1: entra em "Enviados a Meta"', String(r.volume.enviados.total));
  ok(r.volume.enviadosEmTeste === 0, 'R1: e nao entra em enviadosEmTeste', String(r.volume.enviadosEmTeste));
  ok(r.receitaEnviada?.total === 197, 'R1: os R$ 197 ficam no valor enviado', String(r.receitaEnviada?.total));
  ok(r.compras.enviadas === 1, 'R1: e a compra conta como aceita pela Meta', String(r.compras.enviadas));

  // O caso vizinho continua como era: so o aceite em teste, nada real.
  const soTeste = item({
    status: 'disparado',
    resultados: [{ marcaId: 'b', status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste: true }],
  });
  ok(enviadoSoEmTeste(soTeste) === true, 'R1: so [enviado em teste] continua "so teste"');

  // `duplicado` de um Pixel EM TESTE nao prova envio real (so `modoTeste !== true`
  // prova), e `duplicado` com `modoTeste` ausente vale como real (ausencia = real, P6).
  ok(
    enviadoSoEmTeste(
      item({
        status: 'disparado',
        resultados: [
          { marcaId: 'b', status: 'duplicado', modoTeste: true },
          { marcaId: 'b', status: 'enviado', modoTeste: true },
        ],
      })
    ) === true,
    'R1: duplicado de Pixel em teste nao prova envio real'
  );
  ok(
    enviadoSoEmTeste(
      item({
        status: 'disparado',
        resultados: [{ marcaId: 'a', status: 'duplicado' }, { marcaId: 'b', status: 'enviado', modoTeste: true }],
      })
    ) === false,
    'R1: duplicado sem modoTeste gravado vale como real (ausencia = real)'
  );
}

/* ---------------- 21. qualidade.aceitos / qualidade.recusados (V4 passo 2) ---------------- */
{
  // Os nomes sao os de `ResultadoPorPixel` (`inbox.ts`): `httpStatus` e
  // `eventsReceived`, em camelCase, como o disparo grava.
  const aceitoReal = item({
    status: 'disparado',
    resultados: [{ marcaId: 'a', httpStatus: 200, eventsReceived: 1 }],
  });
  const recusadoReal = item({ status: 'disparado', resultados: [{ marcaId: 'a', httpStatus: 400 }] });
  const aceitoEmTeste = item({
    status: 'disparado',
    resultados: [{ marcaId: 'b', httpStatus: 200, eventsReceived: 1, modoTeste: true }],
  });
  // So-teste (M8): TODOS os resultados com `modoTeste: true`, inclusive a recusa.
  const soTeste = item({
    status: 'disparado',
    resultados: [
      { marcaId: 'b', status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste: true },
      { marcaId: 'c', status: 'erro', httpStatus: 400, modoTeste: true },
    ],
  });
  const r = resumirInbox([aceitoReal, recusadoReal, aceitoEmTeste, soTeste], AGORA, 30);
  ok(r.qualidade.aceitos === 1, 'qualidade: 1 aceito real (httpStatus 200 + eventsReceived 1)', String(r.qualidade.aceitos));
  ok(r.qualidade.recusados === 1, 'qualidade: 1 recusado real (httpStatus 400)', String(r.qualidade.recusados));
  ok(r.volume.enviadosEmTeste === 2, 'qualidade: enviadosEmTeste da C9 continua 2', String(r.volume.enviadosEmTeste));
  ok(r.volume.enviados.total === 2, 'qualidade: `enviados` nao muda de conta (os 2 disparados reais)', String(r.volume.enviados.total));
  const soOTeste = resumirInbox([aceitoEmTeste, soTeste], AGORA, 30);
  ok(
    soOTeste.qualidade.aceitos === 0 && soOTeste.qualidade.recusados === 0,
    'qualidade: so-teste nao entra em aceitos nem em recusados',
    JSON.stringify(soOTeste.qualidade)
  );

  // Nome errado (snake_case) nao existe no log: nao pode virar aceite.
  const nomeErrado = item({ status: 'disparado', resultados: [{ marcaId: 'a', httpStatus: 200, events_received: 1 }] });
  ok(
    resumirInbox([nomeErrado], AGORA, 30).qualidade.aceitos === 0,
    'qualidade: `events_received` (snake_case) NAO conta como aceito — o teste le o nome real'
  );

  // Teste da equipe aceito fica fora (regra 4 do CLAUDE.md).
  const internoAceito = item({
    testeInterno: true,
    status: 'disparado',
    resultados: [{ marcaId: 'a', httpStatus: 200, eventsReceived: 1 }],
  });
  ok(resumirInbox([internoAceito], AGORA, 30).qualidade.aceitos === 0, 'qualidade: teste interno aceito NAO entra em aceitos');

  // A recusa da Meta NAO vira `disparado` (`auto-dispatch.ts`: so marca quando
  // algum Pixel deu `enviado`): o item fica na fila com o 400 gravado. E
  // recusa do mesmo jeito — senao a qualidade diria "0 recusados" com a fila
  // cheia de 400.
  const recusadoNaFila = item({
    status: 'novo',
    resultados: [{ marcaId: 'a', status: 'erro', httpStatus: 400, modoTeste: false }],
  });
  const rf = resumirInbox([recusadoNaFila], AGORA, 30);
  ok(rf.qualidade.recusados === 1, 'qualidade: recusa que deixou o item na fila conta como recusado', String(rf.qualidade.recusados));
  ok(rf.qualidade.aceitos === 0 && rf.volume.naFila.total === 1, 'qualidade: e ele segue na fila, sem aceite');

  // Resposta da Meta sem evento recebido tambem e recusa.
  ok(
    resumirInbox([item({ status: 'novo', resultados: [{ marcaId: 'a', status: 'erro', httpStatus: 200, eventsReceived: 0 }] })], AGORA, 30)
      .qualidade.recusados === 1,
    'qualidade: httpStatus 200 com eventsReceived 0 e recusa'
  );

  // O que NAO e resposta da Meta nao e recusa: falta de token, Pixel desligado,
  // erro de rede (sem httpStatus). Item antigo sem `resultados` nao e nada.
  const semResposta = [
    item({ status: 'novo', resultados: [{ marcaId: 'a', status: 'sem-token' }] }),
    item({ status: 'novo', resultados: [{ marcaId: 'a', status: 'pixel-desligado' }] }),
    item({ status: 'novo', resultados: [{ marcaId: 'a', status: 'erro', erro: 'fetch failed' }] }),
    item({ status: 'disparado' }),
  ];
  const rs = resumirInbox(semResposta, AGORA, 30);
  ok(
    rs.qualidade.aceitos === 0 && rs.qualidade.recusados === 0,
    'qualidade: falha que nao e resposta da Meta e item sem registro nao sao aceito nem recusado',
    JSON.stringify(rs.qualidade)
  );
  ok(rs.volume.enviados.total === 1, 'qualidade: o disparado antigo sem registro continua em `enviados`');

  // Um aceite real em qualquer Pixel basta; `duplicado` real prova aceite (R1).
  const umAceitaOutroRecusa = item({
    status: 'disparado',
    resultados: [
      { marcaId: 'a', status: 'enviado', httpStatus: 200, eventsReceived: 1 },
      { marcaId: 'b', status: 'erro', httpStatus: 400 },
    ],
  });
  const soDuplicadoReal = item({ status: 'disparado', resultados: [{ marcaId: 'a', status: 'duplicado', modoTeste: false }] });
  const rm = resumirInbox([umAceitaOutroRecusa, soDuplicadoReal], AGORA, 30);
  ok(rm.qualidade.aceitos === 2, 'qualidade: aceite real em um Pixel e duplicado real contam como aceitos', String(rm.qualidade.aceitos));
  ok(rm.qualidade.recusados === 0, 'qualidade: e nenhum dos dois vira recusado', String(rm.qualidade.recusados));

  // R1 da V4: aceite em Pixel de TESTE nao apaga a recusa do Pixel real. Com
  // o token de producao vencido, a Qualidade diria "0 recusados".
  const producaoRecusaTesteAceita = item({
    status: 'disparado',
    resultados: [
      { marcaId: 'a', status: 'erro', httpStatus: 400, modoTeste: false },
      { marcaId: 'b', status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste: true },
    ],
  });
  const rp = resumirInbox([producaoRecusaTesteAceita], AGORA, 30);
  ok(
    rp.qualidade.recusados === 1 && rp.qualidade.aceitos === 0,
    '🔴 R1 V4: [producao erro 400, teste enviado] conta 1 recusado e 0 aceito',
    JSON.stringify(rp.qualidade)
  );
  ok(rp.volume.enviadosEmTeste === 1, 'R1 V4: no volume ele continua "so em teste"', String(rp.volume.enviadosEmTeste));

  // Os campos que ja existiam continuam.
  ok('emqMedio' in r.qualidade && 'enviadosComEmq' in r.qualidade, 'qualidade: emqMedio e enviadosComEmq continuam');
  const vazio = resumirInbox([], AGORA, 30).qualidade;
  ok(vazio.aceitos === 0 && vazio.recusados === 0, 'qualidade: lista vazia da 0 e 0 (contagem real, nao dado inventado)');
}

/** Resultado de Pixel real aceito, como o disparo grava. */
const ACEITO = [{ marcaId: 'a', status: 'enviado', httpStatus: 200, eventsReceived: 1 }];

/* ---------------- 22. porEventoMeta (V4 passo 3) ---------------- */
{
  // Nomes reais da Meta (`parser.ts`, catalogo da tag): PageView,
  // InitiateCheckout, Purchase. Nada de `page_view` inventado.
  const itens = [
    item({ evento: 'PageView', eventoOrigem: 'tag.pageview', eventoMeta: 'PageView' }),
    item({ evento: 'PageView', eventoOrigem: 'tag.pageview', eventoMeta: 'PageView', recebidoEm: diasAtras(2) }),
    item({ evento: 'PageView', eventoOrigem: 'tag.pageview', eventoMeta: 'PageView', status: 'ignorado' }),
    item({ evento: 'InitiateCheckout', eventoOrigem: 'checkout_started', eventoMeta: 'InitiateCheckout' }),
    item({
      evento: 'InitiateCheckout',
      eventoOrigem: 'checkout_started',
      eventoMeta: 'InitiateCheckout',
      status: 'disparado',
      resultados: ACEITO,
    }),
    item({ evento: 'Purchase', eventoOrigem: 'purchase_approved', eventoMeta: 'Purchase', status: 'disparado', resultados: ACEITO }),
    // Compra sem `eventoMeta` gravado (a mesma regua de `ehCompra`): conta como Purchase.
    item({ evento: 'Purchase', eventoOrigem: 'Purchase' }),
    // Nome cru sem evento da Meta: nao entra.
    item({ evento: 'evento_desconhecido', eventoOrigem: 'evento_desconhecido' }),
    // Teste da equipe aceito e sonda da plataforma: fora.
    item({ evento: 'Purchase', eventoMeta: 'Purchase', testeInterno: true, status: 'disparado', resultados: ACEITO }),
    item({ evento: 'ViewContent', eventoMeta: 'ViewContent', testePlataforma: true }),
    // Fora da janela de 7 dias.
    item({ evento: 'PageView', eventoMeta: 'PageView', recebidoEm: diasAtras(20) }),
  ];
  const r = resumirInbox(itens, AGORA, 7);
  const por = Object.fromEntries(r.porEventoMeta.map((e) => [e.eventoMeta, e]));
  ok(por.PageView?.recebidos === 3 && por.PageView?.aceitos === 0, 'porEventoMeta: PageView 3 recebidos, 0 aceitos', JSON.stringify(por.PageView));
  ok(
    por.InitiateCheckout?.recebidos === 2 && por.InitiateCheckout?.aceitos === 1,
    'porEventoMeta: InitiateCheckout 2 recebidos, 1 aceito',
    JSON.stringify(por.InitiateCheckout)
  );
  ok(por.Purchase?.recebidos === 2 && por.Purchase?.aceitos === 1, 'porEventoMeta: Purchase 2 recebidos, 1 aceito (teste interno fora)', JSON.stringify(por.Purchase));
  ok(por.Purchase?.recebidos === r.compras.total, 'porEventoMeta: Purchase bate com compras.total (mesma regua)');
  ok(!('ViewContent' in por), 'porEventoMeta: evento so de teste nao aparece');
  ok(!('evento_desconhecido' in por), 'porEventoMeta: nome cru sem evento da Meta nao aparece');
  ok(r.porEventoMeta.every((e) => e.recebidos > 0), 'porEventoMeta: nenhum evento sem recebido');
  ok(
    r.porEventoMeta.map((e) => e.eventoMeta).join(',') === 'PageView,InitiateCheckout,Purchase',
    'porEventoMeta: do mais recebido para o menos, empate por nome',
    r.porEventoMeta.map((e) => e.eventoMeta).join(',')
  );
  ok(resumirInbox([], AGORA, 7).porEventoMeta.length === 0, 'porEventoMeta: lista vazia da lista vazia');
}

/* ---------------- 23. porDia (V4 passo 3) ---------------- */
{
  const itens = [
    // 10/09 02:30Z = 09/09 23:30 em Brasilia: cai no dia 09.
    item({ recebidoEm: '2026-09-10T02:30:00.000Z', status: 'disparado', resultados: ACEITO, valor: 97, moeda: 'BRL' }),
    // 11/09: duas compras enviadas, em duas moedas.
    item({ recebidoEm: '2026-09-11T15:00:00.000Z', status: 'disparado', resultados: ACEITO, valor: 100, moeda: 'BRL' }),
    item({ recebidoEm: '2026-09-11T16:00:00.000Z', status: 'disparado', resultados: ACEITO, valor: 50, moeda: 'USD' }),
    // 12/09: uma compra na fila (conta em compras, nao na receita), um PageView,
    // e um teste da equipe aceito que NAO entra.
    item({ recebidoEm: '2026-09-12T15:00:00.000Z', valor: 300, moeda: 'BRL' }),
    item({ recebidoEm: '2026-09-12T15:30:00.000Z', evento: 'PageView', eventoMeta: 'PageView' }),
    item({
      recebidoEm: '2026-09-12T16:00:00.000Z',
      testeInterno: true,
      status: 'disparado',
      resultados: ACEITO,
      valor: 0.01,
      moeda: 'BRL',
    }),
    // 12/09: enviado so em teste — fora da receita e dos aceitos.
    item({
      recebidoEm: '2026-09-12T17:00:00.000Z',
      status: 'disparado',
      resultados: [{ marcaId: 'b', status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste: true }],
      valor: 197,
      moeda: 'BRL',
    }),
  ];
  const r = resumirInbox(itens, AGORA, 7);
  const dia = Object.fromEntries(r.porDia.map((d) => [d.dia, d]));
  ok(dia['2026-09-09']?.recebidos === 1, 'porDia: 10/09 02:30Z cai em 2026-09-09 (fuso de Brasilia)', JSON.stringify(dia['2026-09-09']));
  ok(!dia['2026-09-10'] || dia['2026-09-10'].recebidos === 0, 'porDia: e nao em 2026-09-10');
  ok(dia['2026-09-09']?.aceitos === 1, 'porDia: aceito do dia 09');
  ok(dia['2026-09-11']?.receita === null, 'porDia: dia com duas moedas tem receita null', JSON.stringify(dia['2026-09-11']));
  // A janela mistura moedas (`receitaEnviada` null): a receita de cada dia so
  // sai na moeda UNICA da janela, senao um dia em real e outro em dolar
  // cairiam no mesmo eixo do grafico. O dia 09, so em BRL, tambem fica null.
  ok(r.receitaEnviada === null && dia['2026-09-09']?.receita === null, 'porDia: janela com moeda misturada nao soma dinheiro em dia nenhum');
  // Sem o item em dolar, a janela e so BRL e cada dia tem a sua receita.
  const soReal = resumirInbox(itens.filter((i) => i.moeda !== 'USD'), AGORA, 7);
  const diaR = Object.fromEntries(soReal.porDia.map((d) => [d.dia, d]));
  ok(diaR['2026-09-09']?.receita === 97, 'porDia: receita do dia 09 em BRL', JSON.stringify(diaR['2026-09-09']));
  ok(diaR['2026-09-11']?.receita === 100, 'porDia: receita do dia 11 em BRL', JSON.stringify(diaR['2026-09-11']));
  ok(
    soReal.receitaEnviada?.total === soReal.porDia.reduce((s, d) => s + (d.receita ?? 0), 0),
    'porDia: a soma da receita por dia bate com receitaEnviada'
  );
  ok(dia['2026-09-11']?.compras === 2, 'porDia: e as compras do dia continuam contadas', JSON.stringify(dia['2026-09-11']));
  ok(dia['2026-09-12']?.recebidos === 3, 'porDia: teste da equipe fora dos recebidos do dia', JSON.stringify(dia['2026-09-12']));
  ok(dia['2026-09-12']?.aceitos === 0, 'porDia: teste interno aceito e so-teste fora dos aceitos do dia');
  ok(dia['2026-09-12']?.receita === 0, 'porDia: compra na fila e so-teste fora da receita do dia (0 real)', JSON.stringify(dia['2026-09-12']));
  ok(dia['2026-09-12']?.compras === 2, 'porDia: compras do dia contam a da fila e a so-teste (recebidas), sem a da equipe');
  // Todo dia da janela aparece, em ordem: 7 dias corridos a partir de 06/09 09:00 de Brasilia.
  ok(
    r.porDia.length === 8 && r.porDia[0].dia === '2026-09-06' && r.porDia[7].dia === '2026-09-13',
    'porDia: todos os dias da janela, do mais antigo ao mais novo',
    r.porDia.map((d) => d.dia).join(',')
  );
  ok(
    dia['2026-09-07']?.recebidos === 0 && dia['2026-09-07']?.receita === 0 && dia['2026-09-07']?.compras === 0,
    'porDia: dia sem evento dentro da janela lida e 0 de verdade'
  );
  ok(r.porDia.reduce((s, d) => s + d.recebidos, 0) === r.base, 'porDia: a soma dos recebidos do dia e a base (sem teste)');

  // Amostra no teto sem alcancar o inicio: o dia que a leitura nao cobriu
  // inteiro SAI da lista, em vez de aparecer como 0 inventado.
  const amostra = [
    item({ recebidoEm: '2026-09-12T15:00:00.000Z' }),
    item({ recebidoEm: '2026-09-11T15:00:00.000Z' }),
    item({ recebidoEm: '2026-09-10T15:00:00.000Z' }),
  ];
  const ra = resumirInbox(amostra, AGORA, 7, 3);
  ok(ra.amostraCobreJanela === false, 'porDia: (pre-condicao) a amostra nao cobre a janela');
  ok(
    ra.porDia.map((d) => d.dia).join(',') === '2026-09-11,2026-09-12,2026-09-13',
    'porDia: sem a amostra cobrir, so os dias lidos por inteiro',
    ra.porDia.map((d) => d.dia).join(',')
  );

  ok(resumirInbox([], AGORA, 'hoje').porDia.length === 1, 'porDia: "hoje" tem um dia');
  ok(resumirInbox([], AGORA, 'hoje').porDia[0].dia === '2026-09-13', 'porDia: e e o hoje de Brasilia');
}

/* ---------------- 24. anterior, so com comparar (V4 passo 4) ---------------- */
{
  const itens = [
    // Janela atual (7 dias corridos): [diasAtras(7), agora].
    item({ recebidoEm: diasAtras(1), status: 'disparado', resultados: ACEITO, valor: 100, moeda: 'BRL' }),
    item({ recebidoEm: diasAtras(2), evento: 'PageView', eventoMeta: 'PageView' }),
    item({ recebidoEm: diasAtras(7) }), // exatamente no inicio: e da ATUAL
    // Janela anterior: [diasAtras(14), diasAtras(7)).
    item({ recebidoEm: diasAtras(8), status: 'disparado', resultados: ACEITO, valor: 50, moeda: 'BRL' }),
    item({
      recebidoEm: diasAtras(9),
      evento: 'InitiateCheckout',
      eventoMeta: 'InitiateCheckout',
      status: 'disparado',
      resultados: ACEITO,
    }),
    item({ recebidoEm: diasAtras(10), evento: 'PageView', eventoMeta: 'PageView' }),
    item({ recebidoEm: diasAtras(10), testeInterno: true, status: 'disparado', resultados: ACEITO, valor: 0.01 }),
    item({ recebidoEm: diasAtras(14) }), // exatamente no inicio da anterior: e dela
    // Antes da anterior: fora das duas.
    item({ recebidoEm: diasAtras(15), status: 'disparado', resultados: ACEITO, valor: 999 }),
  ];
  const r = resumirInbox(itens, AGORA, 7, Number.POSITIVE_INFINITY, { comparar: true });
  const a = r.anterior;
  ok(a !== undefined && a !== null, 'anterior: com comparar, vem calculado');
  ok(a?.janela.inicio === diasAtras(14), 'anterior: comeca 7 dias antes do inicio da atual', a?.janela.inicio);
  ok(
    a?.janela.fim === new Date(Date.parse(diasAtras(7)) - 1).toISOString(),
    'anterior: termina 1 ms antes de a atual comecar — [inicio-7d, inicio)',
    a?.janela.fim
  );
  ok(a?.recebidos === 5, 'anterior: recebidos no mesmo sentido de volume.recebidos (com o teste da equipe)', String(a?.recebidos));
  ok(a?.enviados === 2 && a?.aceitos === 2, 'anterior: enviados e aceitos proprios, sem o teste da equipe', JSON.stringify({ e: a?.enviados, a: a?.aceitos }));
  ok(a?.receitaEnviada?.total === 50 && a?.receitaEnviada?.moeda === 'BRL', 'anterior: receitaEnviada propria', JSON.stringify(a?.receitaEnviada));
  const porA = Object.fromEntries((a?.porEventoMeta ?? []).map((e) => [e.eventoMeta, e]));
  ok(
    porA.Purchase?.recebidos === 2 && porA.Purchase?.aceitos === 1 && porA.InitiateCheckout?.aceitos === 1 && porA.PageView?.recebidos === 1,
    'anterior: porEventoMeta proprio',
    JSON.stringify(a?.porEventoMeta)
  );
  // A atual nao muda por causa do comparar.
  ok(r.volume.recebidos === 3 && r.receitaEnviada?.total === 100, 'anterior: a janela atual segue com os proprios numeros');
  const porR = Object.fromEntries(r.porEventoMeta.map((e) => [e.eventoMeta, e]));
  ok(porR.Purchase?.recebidos === 2 && !('InitiateCheckout' in porR), 'anterior: porEventoMeta da atual nao mistura com o da anterior');

  // Sem comparar, nada e calculado.
  ok(resumirInbox(itens, AGORA, 7).anterior === undefined, 'anterior: sem comparar, e undefined');
  ok(resumirInbox(itens, AGORA, 7, Number.POSITIVE_INFINITY, { comparar: false }).anterior === undefined, 'anterior: comparar false, undefined');
  ok(!('anterior' in resumirInbox(itens, AGORA, 7)), 'anterior: sem comparar, a chave nem existe na resposta');

  // A amostra lida nao alcanca a janela anterior: null, nao numero incompleto.
  const soAtual = itens.slice(0, 3);
  ok(
    resumirInbox(soAtual, AGORA, 7, soAtual.length, { comparar: true }).anterior === null,
    'anterior: amostra no teto sem alcancar a janela anterior da null'
  );
  ok(
    resumirInbox(soAtual, AGORA, 7, Number.POSITIVE_INFINITY, { comparar: true }).anterior?.recebidos === 0,
    'anterior: abaixo do teto, a leitura e completa e janela vazia e 0 de verdade'
  );

  // Dia de calendario: "hoje" (09:00 em Brasilia) compara com ontem ate a mesma hora.
  const h = resumirInbox([], AGORA, 'hoje', Number.POSITIVE_INFINITY, { comparar: true }).anterior;
  ok(
    h?.janela.inicio === '2026-09-12T03:00:00.000Z' && h?.janela.fim === '2026-09-12T12:00:00.000Z',
    'anterior: "hoje" compara com ontem da meia-noite ate a mesma hora',
    JSON.stringify(h?.janela)
  );
  const o = resumirInbox([], AGORA, 'ontem', Number.POSITIVE_INFINITY, { comparar: true }).anterior;
  ok(
    o?.janela.inicio === '2026-09-11T03:00:00.000Z' && o?.janela.fim === '2026-09-12T02:59:59.999Z',
    'anterior: "ontem" compara com anteontem inteiro',
    JSON.stringify(o?.janela)
  );
  const p = resumirInbox([], AGORA, { de: '2026-09-10', ate: '2026-09-12' }, Number.POSITIVE_INFINITY, { comparar: true }).anterior;
  ok(
    p?.janela.inicio === '2026-09-07T03:00:00.000Z' && p?.janela.fim === '2026-09-10T02:59:59.999Z',
    'anterior: periodo livre de 3 dias compara com os 3 dias antes dele',
    JSON.stringify(p?.janela)
  );
}

/* ---------------- 25. As rotas: comparar, empresaId e eventId (V4 passo 5) ---------------- */
{
  // Tudo num diretorio temporario: `empresas.ts`, `config-store.ts` e
  // `inbox.ts` resolvem `<cwd>/config` e `<cwd>/logs` no import, entao o
  // `chdir` vem ANTES de importar as rotas. O `config/` e o `logs/` reais nunca
  // sao abertos. O `fetch` falso do topo continua valendo (lanca sempre, e
  // `graph.facebook.com`/`api.cloudflare.com` inclusive); sem ACCESS_TOKEN.
  const fs = (await import('node:fs')).default;
  const os = (await import('node:os')).default;
  const path = (await import('node:path')).default;

  process.env.CONSOLE_USER = 'admin';
  process.env.CONSOLE_PASSWORD = 'senha-super-segura-com-mais-de-12-chars';
  process.env.SESSION_SECRET = 'segredo-de-sessao-muito-seguro-com-mais-de-32-caracteres-para-teste';

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-inbox-resumo-v4-'));
  fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
  const raizAnterior = process.cwd();
  process.chdir(tmp);
  try {
    const CRIADO = '2026-09-01T00:00:00.000Z';
    fs.writeFileSync(
      path.join(tmp, 'config', 'empresas.json'),
      JSON.stringify({
        empresas: [
          { id: 'default', nome: 'Empresa Padrao (teste)', slug: 'padrao-teste', criadoEm: CRIADO },
          { id: 'emp_a', nome: 'Empresa A', slug: 'empresa-a', criadoEm: CRIADO },
        ],
      }),
      'utf8'
    );

    // A rota usa o relogio de verdade: as datas saem de agora.
    const DIA = 24 * 60 * 60 * 1000;
    const haDias = (n) => new Date(Date.now() - n * DIA).toISOString();
    // Hash fictício, so para provar que ele nao sai. Nenhum e-mail real.
    const HASH = 'a'.repeat(64);
    const base = {
      origem: 'webhook',
      temFbc: false,
      temFbp: false,
      temFbclid: false,
      temGclid: false,
      temTtclid: false,
      temMsclkid: false,
      status: 'novo',
      emailHash: HASH,
    };
    const linhas = [
      // emp_a, janela atual: compra com id canonico, enviada e aceita.
      { ...base, id: 'v4-a1', empresaId: 'emp_a', recebidoEm: haDias(1), evento: 'Purchase', eventoMeta: 'Purchase', valor: 197, moeda: 'BRL', payload: { event: 'purchase_approved', eventId: 'evt_v4_rota_123' } },
      // emp_a: sem id canonico, com pedido → `order_<pedido>`, a mesma regra do disparo.
      { ...base, id: 'v4-a2', empresaId: 'emp_a', recebidoEm: haDias(2), evento: 'Purchase', eventoMeta: 'Purchase', payload: { event: 'purchase_approved', order_id: '9876' } },
      // emp_a: sem id nenhum, e um com payload nulo — nada de id inventado, nada de erro.
      { ...base, id: 'v4-a3', empresaId: 'emp_a', recebidoEm: haDias(3), evento: 'PageView', eventoMeta: 'PageView', payload: { event: 'purchase_approved' } },
      { ...base, id: 'v4-a4', empresaId: 'emp_a', recebidoEm: haDias(3), evento: 'PageView', eventoMeta: 'PageView', payload: null },
      // emp_a, janela anterior (8 a 14 dias): compra enviada de R$ 50.
      { ...base, id: 'v4-a5', empresaId: 'emp_a', recebidoEm: haDias(10), evento: 'Purchase', eventoMeta: 'Purchase', valor: 50, moeda: 'BRL', payload: { event: 'purchase_approved', eventId: 'evt_v4_rota_antigo' } },
      // Outra empresa: nao pode aparecer na lista nem no resumo de emp_a.
      { ...base, id: 'v4-d1', empresaId: 'default', recebidoEm: haDias(1), evento: 'Purchase', eventoMeta: 'Purchase', valor: 999, moeda: 'BRL', payload: { event: 'purchase_approved', eventId: 'evt_v4_outra_empresa' } },
    ];
    fs.writeFileSync(path.join(tmp, 'logs', 'inbox.jsonl'), linhas.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
    // Status e resultados vao para o segundo arquivo, como o disparo grava.
    const eventos = ['v4-a1', 'v4-a5', 'v4-d1'].flatMap((id) => [
      { tipo: 'status', id, status: 'disparado' },
      { tipo: 'resultado', id, resultados: ACEITO },
    ]);
    fs.writeFileSync(path.join(tmp, 'logs', 'inbox-resultados.jsonl'), eventos.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');

    const { NextRequest } = await import('next/server.js');
    const { assinarSessao, COOKIE_SESSAO } = await import(new URL('../src/lib/sessao.ts', import.meta.url).href);
    const rotaResumo = await import(new URL('../src/app/api/inbox/resumo/route.ts', import.meta.url).href);
    const rotaInbox = await import(new URL('../src/app/api/inbox/route.ts', import.meta.url).href);

    const COOKIE = `${COOKIE_SESSAO}=${assinarSessao('admin', 12)}`;
    const pedido = (caminho, empresa) =>
      new NextRequest('http://localhost:3333' + caminho, {
        method: 'GET',
        headers: empresa ? { cookie: COOKIE, 'x-empresa-id': empresa } : { cookie: COOKIE },
      });

    // Resumo com comparar, empresa pelo header.
    const res = await rotaResumo.GET(pedido('/api/inbox/resumo?dias=7&comparar=1', 'emp_a'));
    const corpo = await res.json();
    ok(res.status === 200, 'rota resumo: 200', String(res.status));
    ok(corpo.empresaId === 'emp_a', 'rota resumo: a resposta traz o empresaId resolvido (emp_a)', String(corpo.empresaId));
    ok(corpo.resumo?.receitaEnviada?.total === 197, 'rota resumo: so a empresa pedida (197, sem os 999 da outra)', JSON.stringify(corpo.resumo?.receitaEnviada));
    const ant = corpo.resumo?.anterior;
    ok(ant !== undefined && ant !== null, 'rota resumo: comparar=1 traz anterior');
    ok(ant?.receitaEnviada?.total === 50, 'rota resumo: anterior com a receita propria', JSON.stringify(ant?.receitaEnviada));
    ok(
      Date.parse(corpo.resumo?.janela?.inicio) - Date.parse(ant?.janela?.inicio) === 7 * DIA &&
        Date.parse(corpo.resumo?.janela?.inicio) - Date.parse(ant?.janela?.fim) === 1,
      'rota resumo: dias=7 → anterior em [inicio-7d, inicio)',
      JSON.stringify({ atual: corpo.resumo?.janela, anterior: ant?.janela })
    );
    ok(
      Array.isArray(corpo.resumo?.porEventoMeta) && Array.isArray(corpo.resumo?.porDia) && typeof corpo.resumo?.qualidade?.aceitos === 'number',
      'rota resumo: porEventoMeta, porDia e qualidade.aceitos chegam na resposta'
    );

    // Sem comparar: a chave nem vem.
    const semComparar = await (await rotaResumo.GET(pedido('/api/inbox/resumo?dias=7', 'emp_a'))).json();
    ok(semComparar.resumo && !('anterior' in semComparar.resumo), 'rota resumo: sem comparar, sem anterior');
    const comparar0 = await (await rotaResumo.GET(pedido('/api/inbox/resumo?dias=7&comparar=0', 'emp_a'))).json();
    ok(comparar0.resumo && !('anterior' in comparar0.resumo), 'rota resumo: comparar=0 tambem nao calcula');

    // Sem header nem cookie de empresa: a padrao, e o id diz isso.
    const padrao = await (await rotaResumo.GET(pedido('/api/inbox/resumo?dias=7'))).json();
    ok(padrao.empresaId === 'default', 'rota resumo: sem empresa escolhida, empresaId = default', String(padrao.empresaId));
    ok(padrao.resumo?.receitaEnviada?.total === 999, 'rota resumo: e os numeros sao os da padrao');

    // A lista: eventId em cada item que tem, e nunca emailHash.
    const resLista = await rotaInbox.GET(pedido('/api/inbox?limite=1000', 'emp_a'));
    const txtLista = await resLista.text();
    const lista = JSON.parse(txtLista).itens ?? [];
    const porId = Object.fromEntries(lista.map((i) => [i.id, i]));
    ok(resLista.status === 200 && lista.length === 5, 'rota inbox: 200 com os 5 itens de emp_a', `status=${resLista.status} n=${lista.length}`);
    ok(porId['v4-a1']?.eventId === 'evt_v4_rota_123', 'rota inbox: eventId canonico do payload', String(porId['v4-a1']?.eventId));
    ok(porId['v4-a2']?.eventId === 'order_9876', 'rota inbox: sem id canonico, order_<pedido> (a mesma regra do disparo)', String(porId['v4-a2']?.eventId));
    ok(
      porId['v4-a3'] && !('eventId' in porId['v4-a3']) && porId['v4-a4'] && !('eventId' in porId['v4-a4']),
      'rota inbox: sem id no payload (ou payload nulo), sem eventId — nada inventado'
    );
    ok(!('v4-d1' in porId) && !txtLista.includes('evt_v4_outra_empresa'), 'rota inbox: item de outra empresa fora');
    ok(!txtLista.includes('emailHash') && !txtLista.includes(HASH), '🔴 rota inbox: a lista NAO tem emailHash (C7)');

    const resUm = await rotaInbox.GET(pedido('/api/inbox?id=v4-a1', 'emp_a'));
    const txtUm = await resUm.text();
    ok(resUm.status === 200 && JSON.parse(txtUm).item?.eventId === 'evt_v4_rota_123', 'rota inbox ?id=: tambem traz o eventId');
    ok(!txtUm.includes('emailHash') && !txtUm.includes(HASH), '🔴 rota inbox ?id=: sem emailHash');
    const alheio = await rotaInbox.GET(pedido('/api/inbox?id=v4-d1', 'emp_a'));
    ok(alheio.status === 404, 'rota inbox ?id=: item de outra empresa continua 404', String(alheio.status));

    // Sem sessao, nada.
    const semSessao = await rotaResumo.GET(new NextRequest('http://localhost:3333/api/inbox/resumo?dias=7&comparar=1'));
    ok(semSessao.status === 401, 'rota resumo: sem sessao, 401', String(semSessao.status));
  } finally {
    process.chdir(raizAnterior);
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

ok(chamadasDeRede === 0, 'nenhuma chamada de rede durante a suite', String(chamadasDeRede));

/* ---------------- Fechamento ---------------- */
console.log(
  falhas === 0
    ? '\n  O painel conta o que chegou sem contar teste da equipe, e nao divide por base errada.\n'
    : `\n  ${falhas} FALHA(S)\n`
);
process.exit(falhas ? 1 : 0);
