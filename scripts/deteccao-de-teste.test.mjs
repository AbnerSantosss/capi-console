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
 *  4. Suspeita por e-mail repetido: só compra, só a partir do limite
 *  5. Suspeito NÃO é teste — a distinção que impede o descarte silencioso
 *  6. limiteDeCompras: padrão, piso de 2 e lixo
 *  7. Entrada podre não derruba e não vira teste por acidente
 *
 * Uso: npm run test:deteccao-teste
 */

const { avaliarTeste, padraoConhecido, limiteDeCompras, COMPRAS_PARA_SUSPEITAR } = await import(
  new URL('../src/lib/deteccao-de-teste.ts', import.meta.url).href
);

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
