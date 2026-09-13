#!/usr/bin/env node
/**
 * A fundação multi-empresa (FASE D do plano `wiki/plano-multi-empresa-instalacao.md`).
 *
 * Este arquivo existe para travar três coisas que, se soltarem, custam caro:
 *
 *   🔴 1. `config/empresas.json` NÃO NASCE SOZINHO. Ausência do arquivo é a
 *         instalação de hoje, com a empresa padrão e mais nada (D-2/D-3). Uma
 *         leitura que gravasse no boot seria o mesmo padrão de defeito do B1 —
 *         e lá o preço foi o segredo de entrada trocando sozinho e as vendas
 *         PIX parando de entrar em silêncio.
 *
 *   🔴 2. TOKEN NUNCA ENTRA EM `empresas.json` (D-19 + regra 2 do CLAUDE.md).
 *         O token da Meta continua só em `marcas.json`, pelo caminho que já
 *         existe. `salvarEmpresa` monta a empresa campo a campo justamente
 *         para que uma chave a mais vinda da rede não tenha por onde entrar.
 *
 *   🔴 3. APAGAR EMPRESA NÃO APAGA POR BAIXO DE UM AUTOMÁTICO LIGADO (D-17).
 *         Empresa com Pixel em `autoDisparo === true` é recusada: desligar o
 *         Switch é um clique consciente, e ele vem antes.
 *
 * O que cada bloco prova (letras da §D.3 do plano):
 *
 *   (a)  sem `empresas.json` → só a padrão, e o arquivo NÃO é criado
 *   (b)  `salvarEmpresa` cria o arquivo com a padrão + a nova; `.bak` no 2º save
 *   (c)  empresa de um Pixel: ausente = padrão; `default` é sempre da padrão
 *   (d)  `removerEmpresa('default')` lança
 *   (e)  `removerEmpresa` com Pixel `autoDisparo: true` lança e não apaga nada
 *   (f)  slug duplicado lança
 *   (g)  a 21ª empresa lança
 *   (h)  arquivo quebrado com `.bak` bom → lê do `.bak`; sem `.bak` → 503
 *   (i)  D-19: nenhum campo de credencial atravessa até o disco
 *   (j)  D-13: teto e formato do logo
 *   (k)  travessia de caminho no id é recusada (o id vira nome de arquivo na E)
 *   (l)  empresa ativa: header → cookie → 'default' (D-4)
 *   (m)  a rota: 401 sem sessão, e 400 explícito quando mandam token
 *
 * Roda num diretório temporário (nunca toca `config/` de verdade), sem rede e
 * sem disparar evento nenhum para a Meta.
 *
 * Uso: npm run test:empresas
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-empresas-'));
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raizAnterior = process.cwd();
// `empresas.ts` e `config-store.ts` resolvem `<cwd>/config` no import. A troca
// de diretório vem ANTES de qualquer import, senão o teste escreveria na
// configuração real.
process.chdir(tmp);

// A marca implícita do `.env` é remontada a cada leitura; estes valores entram
// antes do import para o bloco (c) ter um Pixel `default` previsível.
process.env.BRAND_NAME = 'Código Vencedor';
process.env.PIXEL_ID = '111111111111111';
process.env.ACCESS_TOKEN = '';
// Sessão do console: o bloco (m) precisa assinar um cookie válido.
process.env.CONSOLE_USER = 'operador';
process.env.CONSOLE_PASSWORD = 'senha-de-teste-bem-comprida';

const ARQ = path.join(tmp, 'config', 'empresas.json');
const BAK = ARQ + '.bak';
const ARQ_MARCAS = path.join(tmp, 'config', 'marcas.json');

const empresas = await import(new URL('../src/lib/empresas.ts', import.meta.url).href);
const ativa = await import(new URL('../src/lib/empresa-ativa.ts', import.meta.url).href);
const { ErroConfiguracaoIndisponivel } = await import(
  new URL('../src/lib/arquivo-atomico.ts', import.meta.url).href
);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

/** Roda `fn` e devolve o erro que ela lançou, ou null. */
const pegar = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};

const lerArquivo = () => JSON.parse(fs.readFileSync(ARQ, 'utf8'));
const limpar = () => {
  for (const p of [ARQ, BAK, ARQ + '.tmp', ARQ_MARCAS, ARQ_MARCAS + '.bak']) {
    fs.rmSync(p, { force: true });
  }
};

/* ================================================================== */
console.log('\n  -- (a) sem empresas.json: só a padrão, e o arquivo NÃO nasce --');

limpar();
const semArquivo = await empresas.listarEmpresas();
ok(semArquivo.length === 1, 'listarEmpresas() devolve uma empresa', `${semArquivo.length}`);
ok(semArquivo[0]?.id === 'default', "a única empresa é a 'default'", semArquivo[0]?.id ?? '—');
ok(semArquivo[0]?.nome === 'Código Vencedor', 'a padrão herda BRAND_NAME do .env', semArquivo[0]?.nome);
ok(semArquivo[0]?.plataforma === 'xWinner', 'a padrão nasce com a plataforma do Código Vencedor');
ok(
  !fs.existsSync(ARQ),
  '🔴 D-3: a LEITURA não criou config/empresas.json',
  fs.existsSync(ARQ) ? 'arquivo criado!' : 'ausente, como deve'
);
ok((await empresas.acharEmpresa('emp_que_nao_existe')) === undefined, 'acharEmpresa de id inexistente → undefined');
ok((await empresas.acharEmpresa('default'))?.id === 'default', 'acharEmpresa("default") funciona sem arquivo');

/* ================================================================== */
console.log('\n  -- (b) salvarEmpresa cria o arquivo, e o .bak aparece no 2º save --');

const nova = await empresas.salvarEmpresa({ id: 'emp_x', nome: 'Loja do Zé', plataforma: 'Hotmart' });
ok(nova.id === 'emp_x' && nova.nome === 'Loja do Zé', 'salvarEmpresa devolve a empresa gravada');
ok(nova.slug === 'loja-do-ze', 'slug derivado do nome, normalizado', nova.slug);
ok(fs.existsSync(ARQ), 'o arquivo nasceu na primeira GRAVAÇÃO');
ok(!fs.existsSync(BAK), 'primeira gravação não tem .bak (não havia estado anterior)');

const gravado = lerArquivo();
ok(Array.isArray(gravado.empresas), 'o formato é { empresas: [...] }');
ok(
  gravado.empresas[0]?.id === 'default' && gravado.empresas.some((e) => e.id === 'emp_x'),
  'a empresa padrão é gravada junto, em primeiro lugar',
  gravado.empresas.map((e) => e.id).join(',')
);

await empresas.salvarEmpresa({ id: 'emp_x', nome: 'Loja do Zé', cor: '#A1B2C3' });
ok(fs.existsSync(BAK), 'o .bak aparece na segunda gravação');
const bak2 = JSON.parse(fs.readFileSync(BAK, 'utf8'));
ok(
  bak2.empresas.find((e) => e.id === 'emp_x')?.cor === undefined,
  '🔴 B1-a: o .bak é o estado ANTERIOR, não uma cópia do atual'
);
ok(lerArquivo().empresas.find((e) => e.id === 'emp_x')?.cor === '#a1b2c3', 'a cor foi normalizada para minúsculas');
ok(
  lerArquivo().empresas.find((e) => e.id === 'emp_x')?.plataforma === 'Hotmart',
  'campo ausente no save preserva o valor gravado (mescla como salvarMarca)'
);
ok(
  lerArquivo().empresas.find((e) => e.id === 'emp_x')?.criadoEm === nova.criadoEm,
  'criadoEm não é reescrito por edição'
);

/* ================================================================== */
console.log('\n  -- (c) de quem é um Pixel (empresaId ausente = padrão) --');

ok(empresas.empresaDaMarca({ id: 'marca_1' }) === 'default', 'Pixel sem empresaId → empresa padrão (E-3)');
ok(empresas.empresaDaMarca({ id: 'marca_1', empresaId: 'emp_x' }) === 'emp_x', 'Pixel com empresaId → aquela empresa');
ok(
  empresas.empresaDaMarca({ id: 'default', empresaId: 'emp_x' }) === 'default',
  '🔴 o Pixel `default` (do .env) é SEMPRE da empresa padrão'
);
ok(
  empresas.empresaDaMarca({ id: 'marca_1', empresaId: '../integracoes' }) === 'default',
  'empresaId com travessia de caminho é ignorado, não obedecido'
);

/* ================================================================== */
console.log('\n  -- (d) a empresa padrão não pode ser apagada --');

const eDefault = await pegar(() => empresas.removerEmpresa('default'));
ok(eDefault instanceof empresas.ErroDeEmpresa, 'removerEmpresa("default") lança ErroDeEmpresa');
ok(/padrão/i.test(eDefault?.message ?? ''), 'e a mensagem diz o porquê', eDefault?.message ?? '');

/* ================================================================== */
console.log('\n  -- (e) empresa com Pixel em automático LIGADO não é apagada --');

fs.writeFileSync(
  ARQ_MARCAS,
  JSON.stringify([
    { id: 'marca_auto', nome: 'Pixel da Loja', pixelId: '222', accessToken: 'EAAtoken', testCode: '', empresaId: 'emp_x', autoDisparo: true },
    { id: 'marca_outra', nome: 'Pixel de Outra', pixelId: '333', accessToken: '', testCode: '', empresaId: 'emp_y' },
  ]),
  'utf8'
);

const eAuto = await pegar(() => empresas.removerEmpresa('emp_x'));
ok(eAuto instanceof empresas.ErroDeEmpresa, '🔴 D-17: empresa com Pixel em auto ligado é recusada');
ok(/autom/i.test(eAuto?.message ?? ''), 'a mensagem manda desligar o automático primeiro', eAuto?.message ?? '');
ok(
  JSON.parse(fs.readFileSync(ARQ_MARCAS, 'utf8')).length === 2,
  'a recusa não apagou Pixel nenhum'
);
ok((await empresas.acharEmpresa('emp_x')) !== undefined, 'a recusa não apagou a empresa');

// Desligado o automático, apagar arrasta os Pixels dela — e só os dela.
fs.writeFileSync(
  ARQ_MARCAS,
  JSON.stringify([
    { id: 'marca_auto', nome: 'Pixel da Loja', pixelId: '222', accessToken: 'EAAtoken', testCode: '', empresaId: 'emp_x', autoDisparo: false },
    { id: 'marca_outra', nome: 'Pixel de Outra', pixelId: '333', accessToken: '', testCode: '', empresaId: 'emp_y' },
    { id: 'marca_solta', nome: 'Pixel sem empresa', pixelId: '444', accessToken: '', testCode: '' },
  ]),
  'utf8'
);
await empresas.salvarEmpresa({ id: 'emp_y', nome: 'Outra Loja' });
await empresas.removerEmpresa('emp_x');

const restantes = JSON.parse(fs.readFileSync(ARQ_MARCAS, 'utf8')).map((m) => m.id);
ok(!restantes.includes('marca_auto'), 'o Pixel da empresa apagada saiu de marcas.json', restantes.join(','));
ok(restantes.includes('marca_outra'), 'o Pixel de OUTRA empresa continua lá');
ok(restantes.includes('marca_solta'), 'o Pixel sem empresaId (= padrão) continua lá');
ok((await empresas.acharEmpresa('emp_x')) === undefined, 'a empresa saiu do registro');
ok((await empresas.acharEmpresa('default')) !== undefined, 'a empresa padrão continua no registro depois da remoção');

const eSumida = await pegar(() => empresas.removerEmpresa('emp_x'));
ok(eSumida instanceof empresas.ErroDeEmpresa, 'apagar empresa inexistente lança em vez de fingir sucesso');

/* ================================================================== */
console.log('\n  -- (f) apelido (slug) é único --');

const eSlug = await pegar(() => empresas.salvarEmpresa({ id: 'emp_z', nome: 'Outra  Loja' }));
ok(eSlug instanceof empresas.ErroDeEmpresa, 'slug repetido lança ErroDeEmpresa');
ok(/apelido/i.test(eSlug?.message ?? ''), 'a mensagem fala em apelido', eSlug?.message ?? '');
ok(
  (await empresas.listarEmpresas()).filter((e) => e.id === 'emp_z').length === 0,
  'a empresa recusada não foi gravada'
);
// Salvar a MESMA empresa com o MESMO slug não pode ser confundido com duplicata.
const mesma = await empresas.salvarEmpresa({ id: 'emp_y', nome: 'Outra Loja', cor: '#010203' });
ok(mesma.slug === 'outra-loja', 'reeditar a própria empresa mantendo o slug continua valendo');

/* ================================================================== */
console.log('\n  -- (g) teto de empresas --');

const antesDoTeto = (await empresas.listarEmpresas()).length;
for (let i = antesDoTeto; i < empresas.MAX_EMPRESAS; i++) {
  await empresas.salvarEmpresa({ id: `emp_t${i}`, nome: `Teste ${i}` });
}
ok((await empresas.listarEmpresas()).length === empresas.MAX_EMPRESAS, `chegou ao teto de ${empresas.MAX_EMPRESAS}`);
const eTeto = await pegar(() => empresas.salvarEmpresa({ id: 'emp_demais', nome: 'Uma a mais' }));
ok(eTeto instanceof empresas.ErroDeEmpresa, `a empresa nº ${empresas.MAX_EMPRESAS + 1} é recusada`);
// Editar uma existente no teto continua funcionando — o teto é só para criação.
const editadaNoTeto = await pegar(() => empresas.salvarEmpresa({ id: 'emp_y', nome: 'Outra Loja' }));
ok(editadaNoTeto === null, 'no teto, EDITAR uma empresa existente continua permitido');

/* ================================================================== */
console.log('\n  -- (h) arquivo quebrado: .bak salva; sem .bak, 503 --');

limpar();
await empresas.salvarEmpresa({ id: 'emp_bom', nome: 'Empresa Boa' });
fs.copyFileSync(ARQ, BAK);
fs.writeFileSync(ARQ, '{"empresas": [ isto não fecha', 'utf8');

const doBak = await empresas.listarEmpresas();
ok(doBak.some((e) => e.id === 'emp_bom'), '🔴 B1: arquivo quebrado + .bak bom → a lista vem do .bak');
ok(
  fs.readFileSync(ARQ, 'utf8').startsWith('{"empresas": [ isto'),
  'a leitura NÃO regravou o arquivo (leitura nunca grava)'
);

fs.rmSync(BAK, { force: true });
const eIlegivel = await pegar(() => empresas.listarEmpresas());
ok(
  eIlegivel instanceof ErroConfiguracaoIndisponivel,
  '🔴 arquivo e .bak ilegíveis → ErroConfiguracaoIndisponivel (503), NUNCA a lista padrão'
);
ok(
  !/isto não fecha|empresas/.test(eIlegivel?.message?.replace('config/empresas.json', '') ?? ''),
  'a mensagem do erro não carrega conteúdo do arquivo',
  eIlegivel?.message ?? ''
);

/* ================================================================== */
console.log('\n  -- (i) 🔴 D-19: token nunca entra em empresas.json --');

limpar();
await empresas.salvarEmpresa({
  id: 'emp_tok',
  nome: 'Empresa com Token',
  // O que uma rota mal escrita (ou um `curl`) tentaria enfiar aqui:
  accessToken: 'EAAG-TOKEN-QUE-NAO-PODE-SER-GRAVADO',
  pixelId: '999999999999999',
  testCode: 'TEST1234',
  segredo: 'whsec_naopode',
});
const bruto = fs.readFileSync(ARQ, 'utf8');
ok(!bruto.includes('EAAG-TOKEN'), '🔴 o token não está no arquivo');
ok(!bruto.includes('999999999999999'), 'o Pixel ID não está no arquivo');
ok(!bruto.includes('whsec_naopode'), 'nenhum segredo de webhook está no arquivo');
ok(!bruto.includes('accessToken') && !bruto.includes('testCode'), 'nem o NOME dos campos de credencial aparece');
const soOsCampos = Object.keys(lerArquivo().empresas.find((e) => e.id === 'emp_tok')).sort().join(',');
ok(soOsCampos === 'criadoEm,id,nome,slug', 'a empresa gravada só tem os campos da entidade', soOsCampos);

/* ================================================================== */
console.log('\n  -- (j) D-13: logo é data URI de imagem, com teto --');

ok(empresas.erroDoLogoDataUrl('data:image/png;base64,AAAA') === null, 'PNG pequeno passa');
ok(empresas.erroDoLogoDataUrl('data:image/svg+xml;base64,AAAA') === null, 'SVG passa');
ok(empresas.erroDoLogoDataUrl('data:text/html;base64,AAAA') !== null, 'data URI que não é imagem é recusado');
ok(empresas.erroDoLogoDataUrl('https://exemplo.com/logo.png') !== null, 'URL externa não serve como logoDataUrl');
const gigante = 'data:image/png;base64,' + 'A'.repeat(empresas.LOGO_MAX_CARACTERES);
ok(empresas.erroDoLogoDataUrl(gigante) !== null, `logo acima de ${empresas.LOGO_MAX_BYTES / 1024} KB é recusado`);
const eLogo = await pegar(() => empresas.salvarEmpresa({ id: 'emp_logo', nome: 'Logo Grande', logoDataUrl: gigante }));
ok(eLogo instanceof empresas.ErroDeEmpresa, 'a GRAVAÇÃO também recusa o logo grande (não só a tela)');
ok(empresas.erroDoLogoUrl('/brand/logo.svg') === null, 'logoUrl do próprio servidor passa');
ok(empresas.erroDoLogoUrl('https://exemplo.com/a.png') !== null, 'logoUrl externa é recusada');
ok(empresas.erroDoLogoUrl('//exemplo.com/a.png') !== null, 'logoUrl protocol-relative é recusada');

/* ================================================================== */
console.log('\n  -- (k) o id de empresa vira nome de arquivo: travessia é recusada --');

for (const mau of ['../integracoes', 'a/b', '..', 'emp x', '', 'emp.json/../../x']) {
  const e = await pegar(() => empresas.salvarEmpresa({ id: mau, nome: 'Maliciosa' }));
  ok(e instanceof empresas.ErroDeEmpresa, `id ${JSON.stringify(mau)} é recusado`);
}
ok(empresas.novoIdEmpresa().startsWith('emp_'), 'novoIdEmpresa gera no formato emp_<ts36>', empresas.novoIdEmpresa());
ok(empresas.idDeEmpresaValido(empresas.novoIdEmpresa()), 'e o id gerado passa na própria cerca');

/* ================================================================== */
console.log('\n  -- (l) D-4: empresa ativa = header → cookie → default --');

limpar();
await empresas.salvarEmpresa({ id: 'emp_a', nome: 'Empresa A' });
await empresas.salvarEmpresa({ id: 'emp_b', nome: 'Empresa B' });
const lista = await empresas.listarEmpresas();

ok(ativa.resolverEmpresaId(['emp_a', 'emp_b'], lista) === 'emp_a', 'o header vence o cookie');
ok(ativa.resolverEmpresaId([null, 'emp_b'], lista) === 'emp_b', 'sem header, vale o cookie');
ok(ativa.resolverEmpresaId([null, null], lista) === 'default', 'sem nada, a empresa padrão');
ok(ativa.resolverEmpresaId(['emp_apagada', null], lista) === 'default', 'id que não existe mais → padrão, não 404');
ok(ativa.resolverEmpresaId(['../integracoes', null], lista) === 'default', 'id com travessia → padrão');
ok(ativa.resolverEmpresaId(['emp_apagada', 'emp_b'], lista) === 'emp_b', 'header inválido cai para o cookie');

const req = (cabecalhos) => new Request('http://localhost:3333/api/empresas', { headers: cabecalhos });
ok(
  (await ativa.empresaDaRequisicao(req({ [ativa.HEADER_EMPRESA]: 'emp_b' }))) === 'emp_b',
  'empresaDaRequisicao lê o header X-Empresa-Id'
);
ok(
  (await ativa.empresaDaRequisicao(req({ cookie: `${ativa.COOKIE_EMPRESA}=emp_a` }))) === 'emp_a',
  'empresaDaRequisicao lê o cookie capi_empresa'
);
ok(
  (await ativa.empresaDaRequisicao(req({ cookie: 'capi_sessao=xyz; capi_empresa=emp_b; outro=1' }))) === 'emp_b',
  'o cookie é achado no meio de outros'
);
ok((await ativa.empresaDaRequisicao(req({}))) === 'default', 'requisição sem nada → empresa padrão');
ok(
  !ativa.atributosDoCookieEmpresa(false).includes('HttpOnly'),
  'o cookie de empresa não é HttpOnly (a tela escreve) — ele seleciona, não autoriza'
);
ok(ativa.atributosDoCookieEmpresa(false).includes('SameSite=Lax'), 'o cookie é SameSite=Lax');

/* ================================================================== */
console.log('\n  -- (m) a rota /api/empresas --');

const rota = await import(new URL('../src/app/api/empresas/route.ts', import.meta.url).href);
const sessao = await import(new URL('../src/lib/sessao.ts', import.meta.url).href);
const cookieSessao = `${sessao.COOKIE_SESSAO}=${sessao.assinarSessao('operador', 1)}`;

const pedido = (metodo, corpo, comSessao = true, busca = '') =>
  new Request(`http://localhost:3333/api/empresas${busca}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(comSessao ? { cookie: cookieSessao } : {}),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });

ok((await rota.GET(pedido('GET', undefined, false))).status === 401, '🔴 GET sem sessão → 401');
ok((await rota.PUT(pedido('PUT', { nome: 'X' }, false))).status === 401, '🔴 PUT sem sessão → 401');
ok(
  (await rota.DELETE(pedido('DELETE', { confirmar: true }, false, '?id=emp_a'))).status === 401,
  '🔴 DELETE sem sessão → 401'
);

const resGet = await rota.GET(pedido('GET'));
const corpoGet = await resGet.json();
ok(resGet.status === 200, 'GET com sessão → 200');
ok(Array.isArray(corpoGet.empresas) && corpoGet.empresas[0]?.id === 'default', 'GET devolve a lista com a padrão');
ok(corpoGet.ativa === 'default', 'GET diz qual empresa o servidor resolveu como ativa', String(corpoGet.ativa));

const resToken = await rota.PUT(pedido('PUT', { nome: 'Com Token', accessToken: 'EAAxyz' }));
const corpoToken = await resToken.json();
ok(resToken.status === 400, '🔴 D-19: PUT com accessToken → 400');
ok(/Pixel|token/i.test(corpoToken.erro ?? ''), 'e a resposta diz para salvar o Pixel em /api/marcas', corpoToken.erro);
ok(!JSON.stringify(corpoToken).includes('EAAxyz'), 'a resposta de erro não devolve o token que chegou');

const resCriar = await rota.PUT(pedido('PUT', { nome: 'Empresa da Rota', plataforma: 'Kiwify' }));
const corpoCriar = await resCriar.json();
ok(resCriar.status === 200, 'PUT sem id cria a empresa', String(resCriar.status));
ok(corpoCriar.criada === true && corpoCriar.empresa?.id?.startsWith('emp_'), 'com id gerado no servidor');
ok(corpoCriar.empresa?.slug === 'empresa-da-rota', 'e slug derivado do nome');

const resCurto = await rota.PUT(pedido('PUT', { nome: 'X' }));
ok(resCurto.status === 400, 'PUT com nome de 1 caractere → 400');

const resSemConfirmar = await rota.DELETE(pedido('DELETE', {}, true, `?id=${corpoCriar.empresa.id}`));
ok(resSemConfirmar.status === 400, 'DELETE sem {confirmar:true} → 400');
ok((await empresas.acharEmpresa(corpoCriar.empresa.id)) !== undefined, 'e nada foi apagado');

const resApagar = await rota.DELETE(pedido('DELETE', { confirmar: true }, true, `?id=${corpoCriar.empresa.id}`));
ok(resApagar.status === 200, 'DELETE com confirmação → 200');
ok((await empresas.acharEmpresa(corpoCriar.empresa.id)) === undefined, 'e a empresa saiu do registro');

const resDefault = await rota.DELETE(pedido('DELETE', { confirmar: true }, true, '?id=default'));
ok(resDefault.status === 400, '🔴 DELETE da empresa padrão → 400');

/* ================================================================== */

process.chdir(raizAnterior);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Fundação multi-empresa fechada: o arquivo não nasce sozinho, o token não entra e o automático ligado trava a remoção.\n'
    : `\n  ${falhas} falha(s).\n`
);
process.exit(falhas === 0 ? 0 : 1);
