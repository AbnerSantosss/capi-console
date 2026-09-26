#!/usr/bin/env node
/**
 * Testes automatizados da detecção de lead de teste (src/lib/deteccao-de-teste.ts).
 *
 * O que está sendo protegido aqui são os DOIS erros caros, um de cada lado:
 *
 *   Errar para mais — tratar venda real como teste e descartá-la sozinha. O
 *   produto inteiro existe para não perder venda PIX; um falso positivo aqui
 *   apaga exatamente a venda que ele deveria salvar.
 *
 *   Errar para menos — deixar a compra de teste do próprio operador ir para a
 *   Meta. Isso é evento fictício no Pixel (regra 1 do CLAUDE.md): suja o
 *   aprendizado da campanha e é justamente o que o pedido mandou impedir.
 *
 * Por isso a fronteira entre `ehTeste` (decidido, nunca vai à Meta) e
 * `bloqueiaAutomatico` sozinho (suspeito, fica na fila esperando um humano) é
 * afirmada caso a caso, nos dois sentidos.
 *
 * Cobre:
 *  1. Evento comum não é teste nem suspeito
 *  2. Lista do operador: e-mail exato, nome por conter, acento e caixa
 *  3. Padrão conhecido: domínio de exemplo, evt_preview, cupom de centavos
 *  3-B. A explicação diz QUAL padrão bateu (C12, D13); a régua fica igual
 *  4. Suspeita por e-mail repetido: só compra, só a partir do limite
 *  5. Suspeito NÃO é teste — a distinção que impede o descarte silencioso
 *  6. limiteDeCompras: padrão, piso de 2 e lixo
 *  7. Entrada podre não derruba e não vira teste por acidente
 *
 * Uso: npm run test:deteccao-teste
 */

const { avaliarTeste, padraoConhecido, qualPadraoConhecido, limiteDeCompras, COMPRAS_PARA_SUSPEITAR } =
  await import(new URL('../src/lib/deteccao-de-teste.ts', import.meta.url).href);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  Detecção de lead de teste\n');

/* ---------------- 1. O evento comum ---------------- */
{
  const v = avaliarTeste({
    email: 'maria.souza@gmail.com',
    nome: 'Maria Souza',
    valor: 497,
    ehCompra: true,
    comprasDoMesmoEmail: 1,
  });
  ok(v.ehTeste === false, 'compra normal nao e teste');
  ok(v.bloqueiaAutomatico === false, '🔴 compra normal sai sozinha: nenhuma trava');
  ok(v.motivo === undefined, 'compra normal nao tem motivo para exibir');
}

/* ---------------- 2. A lista do operador ---------------- */
{
  const lista = { emails: ['Testador@Empresa.com.br'], nomes: ['Jôao Testes'] };

  const porEmail = avaliarTeste({ email: '  TESTADOR@empresa.com.BR ' }, lista);
  ok(porEmail.ehTeste === true, 'e-mail da lista e teste, mesmo em outra caixa e com espacos');
  ok(porEmail.motivo === 'email-cadastrado', 'motivo do e-mail cadastrado');
  ok(typeof porEmail.explicacao === 'string' && porEmail.explicacao.length > 0, 'a decisao vem com frase pronta para a tela');

  // Nome casa por CONTER e sem acento: e o unico jeito de pegar o sufixo que
  // cada plataforma inventa ("Joao Testes - Simulacao").
  const porNome = avaliarTeste({ email: 'x@dominio.com', nome: 'Joao Testes - Simulacao' }, lista);
  ok(porNome.ehTeste === true, '🔴 nome da lista casa por conter e sem acento');
  ok(porNome.motivo === 'nome-cadastrado', 'motivo do nome cadastrado');

  // E o de fora continua de fora: lista nao pode virar rede de arrasto.
  const forade = avaliarTeste({ email: 'outro@dominio.com', nome: 'Ana Paula' }, lista);
  ok(forade.ehTeste === false, 'quem nao esta na lista nao e teste');

  // Lista ausente e lista com lixo dentro valem o mesmo: vazia.
  ok(avaliarTeste({ email: 'a@b.com' }).ehTeste === false, 'sem lista, nada e teste por lista');
  ok(
    avaliarTeste({ email: 'a@b.com' }, { emails: 'nao-e-array', nomes: [null, 42, ''] }).ehTeste === false,
    '🔴 lista com tipo errado nao lanca e nao marca ninguem'
  );
}

/* ---------------- 3. O padrão conhecido ---------------- */
{
  ok(padraoConhecido({ email: 'alguem@example.com' }), 'dominio de exemplo e padrao conhecido');
  ok(padraoConhecido({ eventId: 'evt_preview_123' }), 'evt_preview e padrao conhecido');
  ok(padraoConhecido({ email: 'teste@dominioreal.com.br' }), 'e-mail comecando em teste@');
  ok(padraoConhecido({ nome: 'Jairo Silva' }), 'o testador da equipe, pelo nome');
  ok(padraoConhecido({ firstName: 'Jairo', lastName: 'Silva' }), 'nome em pedacos tambem casa');
  ok(padraoConhecido({ valor: 0.01 }), 'cupom de um centavo e teste');

  ok(!padraoConhecido({ email: 'cliente@gmail.com', valor: 497 }), 'compra real nao e padrao conhecido');
  // 🔴 Zero NAO e cupom de centavos: Lead e ViewContent chegam com valor 0 o
  // tempo todo, e marca-los como teste apagaria o topo do funil inteiro.
  ok(!padraoConhecido({ email: 'cliente@gmail.com', valor: 0 }), '🔴 valor zero nao e cupom de teste');
  ok(!padraoConhecido({ email: 'cliente@gmail.com', valor: 1 }), 'R$ 1,00 ja esta acima do piso de centavos');

  const v = avaliarTeste({ email: 'qa@example.com' });
  ok(v.ehTeste === true && v.motivo === 'padrao-conhecido', 'padrao conhecido vira veredicto de teste');
}

/* ---------------- 3-B. A explicação diz qual padrão bateu (C12, D13) ---------------- */
{
  // D13: a régua fica como está; só a frase muda. Antes ela dizia "(domínio de
  // exemplo, evt_preview ou cupom de centavos)" para TUDO, inclusive para o
  // "jairo", que é o que mais pega — e o operador ficava sem saber por que uma
  // venda tinha virado teste.
  const temQual = typeof qualPadraoConhecido === 'function';
  ok(temQual, 'qualPadraoConhecido existe e e exportada');
  const qual = (ev) => (temQual ? qualPadraoConhecido(ev) : undefined);
  const frase = (ev) => String(avaliarTeste(ev).explicacao ?? '');

  // O caso que mais pega: o e-mail com o padrao da equipe.
  const jairo = frase({ email: 'jairo.silva@x.com' });
  ok(jairo.includes('jairo'), '🔴 e-mail com "jairo": a frase cita o jairo', JSON.stringify(jairo));
  ok(jairo.includes('padrão da equipe de testes'), 'e-mail com "jairo": a frase diz que e o padrao da equipe', JSON.stringify(jairo));
  ok(jairo.includes('e-mail'), 'e-mail com "jairo": a frase diz que foi pelo e-mail', JSON.stringify(jairo));
  // A frase vai para a tela e para a caixa de entrada: o e-mail inteiro do
  // comprador nao pode sair nela.
  ok(!jairo.includes('jairo.silva@x.com') && !jairo.includes('silva'), '🔴 a frase nao repete o e-mail do comprador', JSON.stringify(jairo));

  // O mesmo padrao pelo nome, em pedacos.
  const jairoNome = frase({ email: 'cliente@gmail.com', firstName: 'Jairo', lastName: 'Silva' });
  ok(jairoNome.includes('jairo') && jairoNome.includes('nome'), 'nome com "jairo": a frase diz que foi pelo nome', JSON.stringify(jairoNome));
  ok(!jairoNome.includes('Silva') && !jairoNome.includes('silva'), 'a frase nao repete o nome do comprador', JSON.stringify(jairoNome));

  const exemplo = frase({ email: 'lead@example.com' });
  ok(exemplo.includes('domínio de exemplo'), 'lead@example.com: a frase diz "domínio de exemplo"', JSON.stringify(exemplo));
  ok(exemplo.includes('@example.com'), 'lead@example.com: a frase diz qual dominio', JSON.stringify(exemplo));
  ok(!exemplo.includes('lead@'), 'lead@example.com: a frase nao repete o e-mail inteiro', JSON.stringify(exemplo));

  const centavos = frase({ email: 'cliente@gmail.com', valor: 0.05 });
  ok(centavos.includes('centavos'), 'valor 0.05: a frase diz "centavos"', JSON.stringify(centavos));
  ok(centavos.includes('R$ 0,05'), 'valor 0.05: a frase diz o valor em reais', JSON.stringify(centavos));

  const preview = frase({ eventId: 'evt_preview_123' });
  ok(preview.includes('evt_preview'), 'evt_preview: a frase cita evt_preview', JSON.stringify(preview));

  const prefixo = frase({ email: 'teste@dominioreal.com.br' });
  ok(prefixo.includes('"teste@"'), 'teste@: a frase diz qual comeco de e-mail', JSON.stringify(prefixo));
  const testador = frase({ email: 'testador@dominioreal.com.br' });
  ok(testador.includes('"testador@"'), 'testador@: a frase diz qual comeco de e-mail', JSON.stringify(testador));

  const convidado = frase({ nome: 'Lead Convidado' });
  ok(convidado.includes('lead convidado'), 'nome "Lead Convidado": a frase cita o nome de teste', JSON.stringify(convidado));
  const simulacao = frase({ nome: 'Simulação Teste Checkout' });
  ok(simulacao.includes('simulação teste'), 'nome "Simulação Teste": a frase cita o nome de teste', JSON.stringify(simulacao));

  // Formato: sempre o mesmo comeco e o mesmo fim, e nunca mais a frase generica.
  for (const [rotulo, f] of [
    ['jairo', jairo],
    ['jairo pelo nome', jairoNome],
    ['example.com', exemplo],
    ['centavos', centavos],
    ['evt_preview', preview],
    ['teste@', prefixo],
    ['testador@', testador],
    ['lead convidado', convidado],
    ['simulacao teste', simulacao],
  ]) {
    ok(
      f.startsWith('Padrão de teste conhecido: ') && f.endsWith('. Nada é enviado à Meta.'),
      `formato da frase (${rotulo})`,
      JSON.stringify(f)
    );
    ok(!f.includes('evt_preview ou cupom de centavos'), `a frase generica antiga sumiu (${rotulo})`, JSON.stringify(f));
  }

  // qualPadraoConhecido: texto quando bate, null quando nao bate.
  ok(typeof qual({ email: 'jairo@gmail.com' }) === 'string', 'qualPadraoConhecido devolve texto quando bate');
  for (const caso of [
    { email: 'cliente@gmail.com', valor: 497 },
    { email: 'cliente@gmail.com', valor: 0 },
    { email: 'cliente@gmail.com', valor: 1 },
    { valor: -5 },
    {},
  ]) {
    ok(qual(caso) === null, 'qualPadraoConhecido devolve null quando nada bate', JSON.stringify(caso));
  }

  // Mesma ordem de antes: quando dois padroes batem, vale o primeiro da regua
  // (evt_preview > dominio > comeco/jairo no e-mail > nome > valor).
  const dois = frase({ eventId: 'evt_preview_1', email: 'x@example.com', valor: 0.01 });
  ok(dois.includes('evt_preview') && !dois.includes('domínio'), 'dois padroes: vale o primeiro da regua', JSON.stringify(dois));
  const emailENome = frase({ email: 'y@example.org', nome: 'Jairo' });
  ok(emailENome.includes('@example.org') && !emailENome.includes('jairo'), 'e-mail antes do nome, como sempre foi', JSON.stringify(emailENome));

  // 🔴 A regua NAO mudou (D13): a copia da funcao de antes, aqui dentro, tem
  // que concordar com `padraoConhecido` e com `qualPadraoConhecido` em todos os
  // casos — os que batem, os que nao batem e os podres.
  const achatarAntigo = (v) =>
    typeof v !== 'string' ? '' : v.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  const reguaAntiga = (ev) => {
    const email = achatarAntigo(ev.email);
    const nome = achatarAntigo(ev.nome || `${ev.firstName ?? ''} ${ev.lastName ?? ''}`);
    const valor = Number(ev.valor ?? 0);
    if (typeof ev.eventId === 'string' && /^evt_preview/i.test(ev.eventId)) return true;
    if (/@(example\.com|exemplo\.com\.br|example\.org|test\.com)$/.test(email)) return true;
    if (email.startsWith('teste@') || email.startsWith('testador@') || email.includes('jairo')) return true;
    if (nome.includes('jairo') || nome === 'lead convidado' || nome.includes('simulacao teste')) return true;
    if (Number.isFinite(valor) && valor > 0 && valor <= 0.1) return true;
    return false;
  };
  const bateria = [
    { email: 'alguem@example.com' },
    { email: 'a@exemplo.com.br' },
    { email: 'a@example.org' },
    { email: 'a@test.com' },
    { email: 'a@test.com.br' },
    { email: 'a@example.com.br' },
    { eventId: 'evt_preview_123' },
    { eventId: 'EVT_PREVIEW' },
    { eventId: 'evt_real_1' },
    { email: 'teste@dominioreal.com.br' },
    { email: 'meuteste@dominio.com' },
    { email: 'testador@x.com' },
    { email: 'JAIRO.silva@x.com' },
    { email: 'x@jairo.com.br' },
    { nome: 'Jairo Silva' },
    { nome: 'JÁIRO' },
    { firstName: 'Jairo', lastName: 'Silva' },
    { nome: 'Lead Convidado' },
    { nome: 'Lead Convidado Extra' },
    { nome: 'Simulação Teste' },
    { nome: 'simulacao teste 2' },
    { valor: 0.01 },
    { valor: 0.1 },
    { valor: 0.11 },
    { valor: 0 },
    { valor: -5 },
    { valor: 'quinhentos' },
    { email: 'cliente@gmail.com', nome: 'Maria Souza', valor: 497 },
    {},
    { email: null },
    { email: 12345 },
    { nome: {} },
    { eventId: [] },
  ];
  for (const caso of bateria) {
    const antes = reguaAntiga(caso);
    let lancou = false;
    let agora;
    let texto;
    try {
      agora = padraoConhecido(caso);
      texto = qual(caso);
    } catch {
      lancou = true;
    }
    ok(!lancou, 'regua: entrada nao lanca', JSON.stringify(caso));
    ok(agora === antes, '🔴 padraoConhecido continua dando o mesmo resultado de antes', JSON.stringify(caso));
    ok((texto !== null && texto !== undefined) === antes, 'qualPadraoConhecido bate exatamente onde a regua antiga batia', JSON.stringify(caso));
    ok(avaliarTeste(caso).ehTeste === antes, 'avaliarTeste (sem lista) marca teste nos mesmos casos de antes', JSON.stringify(caso));
  }
}

/* ---------------- 4. Suspeita por e-mail repetido ---------------- */
{
  const base = { email: 'comprador@gmail.com', nome: 'Carlos Lima', ehCompra: true };

  ok(avaliarTeste({ ...base, comprasDoMesmoEmail: 1 }).bloqueiaAutomatico === false, 'primeira compra passa');
  ok(avaliarTeste({ ...base, comprasDoMesmoEmail: 2 }).bloqueiaAutomatico === false, 'segunda compra ainda pode ser upsell');

  const terceira = avaliarTeste({ ...base, comprasDoMesmoEmail: 3 });
  ok(terceira.bloqueiaAutomatico === true, 'terceira compra do mesmo e-mail levanta suspeita');
  ok(terceira.motivo === 'email-repetido', 'motivo da repeticao');
  ok(terceira.explicacao.includes('3'), 'a frase diz quantas compras foram', terceira.explicacao);

  // 🔴 So COMPRA conta. O mesmo e-mail em dez Lead e uma pessoa que voltou ao
  // site — barrar isso seria inventar suspeita em cima de interesse.
  ok(
    avaliarTeste({ ...base, ehCompra: false, comprasDoMesmoEmail: 9 }).bloqueiaAutomatico === false,
    '🔴 repeticao fora de compra nao levanta suspeita'
  );
  // Sem e-mail nao ha chave de juncao: nada a suspeitar.
  ok(
    avaliarTeste({ ehCompra: true, comprasDoMesmoEmail: 9 }).bloqueiaAutomatico === false,
    'sem e-mail nao ha do que suspeitar'
  );
  // Ninguem contou = undefined: ausencia de contagem nao e contagem alta.
  ok(
    avaliarTeste({ ...base, comprasDoMesmoEmail: undefined }).bloqueiaAutomatico === false,
    '🔴 contagem ausente nao vira suspeita'
  );

  // O limite e configuravel pelo operador.
  ok(
    avaliarTeste({ ...base, comprasDoMesmoEmail: 2 }, { comprasParaSuspeitar: 2 }).bloqueiaAutomatico === true,
    'o operador pode apertar o limite para 2'
  );
  ok(
    avaliarTeste({ ...base, comprasDoMesmoEmail: 4 }, { comprasParaSuspeitar: 5 }).bloqueiaAutomatico === false,
    'o operador pode afrouxar o limite para 5'
  );
}

/* ---------------- 5. Suspeito NÃO é teste ---------------- */
{
  // A distincao inteira deste arquivo em uma asserção: a compra repetida PARA
  // de sair sozinha, mas continua sendo uma venda possivelmente real — ela nao
  // some da caixa, nao sai das porcentagens e ainda pode ser enviada por
  // clique. Descartar sozinho o que o console so ACHA que e teste seria perder
  // a venda que o produto existe para salvar.
  const v = avaliarTeste({
    email: 'comprador@gmail.com',
    ehCompra: true,
    comprasDoMesmoEmail: 5,
  });
  ok(v.bloqueiaAutomatico === true, 'suspeito perde o automatico');
  ok(v.ehTeste === false, '🔴 suspeito NAO e teste: nao pode ser descartado sozinho');

  // E a reciproca: todo teste decidido tambem bloqueia. Um `ehTeste` que
  // deixasse o automatico passar mandaria evento ficticio para a Meta.
  for (const caso of [
    { email: 'qa@example.com' },
    { eventId: 'evt_preview_9' },
    { valor: 0.01, email: 'a@b.com' },
  ]) {
    const t = avaliarTeste(caso);
    ok(
      t.ehTeste === true && t.bloqueiaAutomatico === true,
      '🔴 todo teste tambem bloqueia o automatico',
      JSON.stringify(caso)
    );
  }
}

/* ---------------- 6. limiteDeCompras ---------------- */
{
  ok(limiteDeCompras() === COMPRAS_PARA_SUSPEITAR, 'sem lista, vale o padrao');
  ok(limiteDeCompras({}) === COMPRAS_PARA_SUSPEITAR, 'lista sem o campo, vale o padrao');
  ok(limiteDeCompras({ comprasParaSuspeitar: 5 }) === 5, 'o numero do operador vale');
  ok(limiteDeCompras({ comprasParaSuspeitar: 2.7 }) === 2, 'fracao e truncada para baixo');
  // 🔴 O piso de 2 e o que impede o operador de travar o produto inteiro sem
  // perceber: com 1, TODA primeira compra viraria suspeita.
  ok(limiteDeCompras({ comprasParaSuspeitar: 1 }) === COMPRAS_PARA_SUSPEITAR, '🔴 1 cai no padrao: piso de 2');
  ok(limiteDeCompras({ comprasParaSuspeitar: 0 }) === COMPRAS_PARA_SUSPEITAR, '0 cai no padrao');
  ok(limiteDeCompras({ comprasParaSuspeitar: -4 }) === COMPRAS_PARA_SUSPEITAR, 'negativo cai no padrao');
  ok(limiteDeCompras({ comprasParaSuspeitar: 'tres' }) === COMPRAS_PARA_SUSPEITAR, 'texto cai no padrao');
  ok(limiteDeCompras({ comprasParaSuspeitar: NaN }) === COMPRAS_PARA_SUSPEITAR, 'NaN cai no padrao');
}

/* ---------------- 7. Entrada podre ---------------- */
{
  // Regra de ouro: no caminho do webhook, uma excecao custa uma venda PIX real.
  // Nenhuma destas chamadas pode lancar, e nenhuma pode virar teste por acaso.
  for (const caso of [
    {},
    { email: null },
    { email: 12345 },
    { nome: {} },
    { valor: 'quinhentos' },
    { eventId: [] },
    { comprasDoMesmoEmail: 'muitas', ehCompra: true, email: 'a@b.com' },
  ]) {
    let lancou = false;
    let v = null;
    try {
      v = avaliarTeste(caso);
    } catch {
      lancou = true;
    }
    ok(!lancou, '🔴 entrada podre nao lanca', JSON.stringify(caso));
    ok(v && v.ehTeste === false, 'entrada podre nao vira teste por acidente', JSON.stringify(caso));
  }

  // Valor negativo nao e cupom de centavos: `> 0` na regra existe para isto.
  ok(!padraoConhecido({ valor: -5 }), 'valor negativo nao e cupom de centavos');
}

/* ---------------- Fechamento ---------------- */
console.log(
  falhas === 0
    ? '\n  Teste da equipe nao chega a Meta, e venda real nao e descartada sozinha.\n'
    : `\n  ${falhas} FALHA(S)\n`
);
process.exit(falhas ? 1 : 0);
