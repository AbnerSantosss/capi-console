#!/usr/bin/env node
/**
 * A fundação multi-empresa (FASE D do plano `wiki/plano-multi-empresa-instalacao.md`).
 *
 * Este arquivo existe para travar quatro coisas que, se soltarem, custam caro:
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
 *   🔴 4. `config/integracoes.json` NÃO É TOCADO (E-4). Aquele arquivo guarda
 *         o segredo pelo qual a venda entra HOJE, e a URL derivada dele já
 *         está cadastrada num backoffice que ninguém deste lado controla.
 *         Criar uma empresa nova compara o sha256 do arquivo antes e depois:
 *         é a regra E-4 virada prova executável.
 *
 * O que cada bloco prova (letras da §D.3 e da §E.6 do plano):
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
 * As letras (h) a (l) da §E.6 chegaram como (n) a (r) — de (a) a (m) já estavam
 * tomadas pela FASE D:
 *
 *   (n)  🔴 E-4: criar empresa NÃO toca `config/integracoes.json` (sha256)
 *   (o)  `acharEmpresaPorSegredo`: de quem é este segredo de entrada
 *   (p)  `acharEmpresaPorChaveTag`: de quem é esta chave de tag
 *   (q)  a caixa de entrada filtra por empresa, e item sem campo é da padrão
 *   (r)  a atribuição de uma empresa não enriquece o evento de outra
 *
 * Roda num diretório temporário (nunca toca `config/` de verdade), sem rede e
 * sem disparar evento nenhum para a Meta.
 *
 * Uso: npm run test:empresas
 */
import crypto from 'node:crypto';
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
/*                                                                    */
/*  FASE E — um arquivo de integrações por empresa.                   */
/*                                                                    */
/*  As letras (h) a (l) da §E.6 do plano chegam aqui como (n) a (r):  */
/*  de (a) a (m) já estavam tomadas pela FASE D.                      */
/*                                                                    */
/* ================================================================== */

const cfgStore = await import(new URL('../src/lib/config-store.ts', import.meta.url).href);
const inbox = await import(new URL('../src/lib/inbox.ts', import.meta.url).href);
const perfil = await import(new URL('../src/lib/perfil-atribuicao.ts', import.meta.url).href);

const ARQ_INTEG = cfgStore.arquivoIntegracoes();
const ARQ_INTEG_X = cfgStore.arquivoIntegracoes('emp_x');
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/** Apaga os arquivos de integrações do sandbox — nunca os de `config/` de verdade. */
const limparIntegracoes = () => {
  const dir = path.join(tmp, 'config');
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('integracoes')) fs.rmSync(path.join(dir, f), { force: true });
  }
};

/* ================================================================== */
console.log('\n  -- (n) [E.6 h] 🔴 E-4: criar empresa NÃO toca config/integracoes.json --');

limpar();
limparIntegracoes();

// A default só existe em disco depois da primeira leitura (1ª subida). Deixar a
// migração acontecer ANTES de tirar o hash é proposital: o que interessa
// comparar é o arquivo já estabilizado, o mesmo estado em que a produção está.
const cfgDefault = await cfgStore.lerIntegracoes();
ok(
  ARQ_INTEG === path.join(tmp, 'config', 'integracoes.json'),
  '🔴 E-4: a empresa padrão continua em config/integracoes.json, sem renomear',
  ARQ_INTEG
);
ok(fs.existsSync(ARQ_INTEG), 'e o arquivo está no disco');
const hashAntes = sha256(ARQ_INTEG);

const criada = await cfgStore.criarIntegracoesDaEmpresa({ id: 'emp_x', slug: 'emp-x' });
ok(criada !== null, 'criarIntegracoesDaEmpresa devolve a configuração nova');
ok(
  ARQ_INTEG_X === path.join(tmp, 'config', 'integracoes.emp_x.json'),
  'a empresa nova ganha config/integracoes.emp_x.json',
  path.basename(ARQ_INTEG_X)
);
ok(fs.existsSync(ARQ_INTEG_X), 'e o arquivo dela nasceu');
ok(
  sha256(ARQ_INTEG) === hashAntes,
  '🔴 E-4: o sha256 de config/integracoes.json é o MESMO byte a byte',
  hashAntes.slice(0, 16)
);
ok(
  (await cfgStore.lerIntegracoes()).entrada.segredo === cfgDefault.entrada.segredo,
  '🔴 e o segredo pelo qual a venda entra hoje não mudou'
);

ok(criada.entrada.segredo !== cfgDefault.entrada.segredo, 'a empresa nova nasce com segredo de entrada próprio');
ok(criada.tag.chave !== cfgDefault.tag.chave, 'e com chave de tag própria');
ok(criada.entrada.rotulo === 'emp-x', 'o apelido do webhook sai do slug', String(criada.entrada.rotulo));
ok(
  criada.entrada.rotulo !== cfgDefault.entrada.rotulo,
  '🔴 e NUNCA é o apelido da padrão — duas empresas na mesma URL de webhook'
);

// Sementes: só as da tag, mais o 'ping' que o botão "Testar" da plataforma manda.
// As 50 regras de webhook do dono nomeiam eventos do xWinner; uma empresa de
// Hotmart não deve nascer com elas.
const doDisco = JSON.parse(fs.readFileSync(ARQ_INTEG_X, 'utf8'));
const origensX = doDisco.regras.map((r) => r.eventoOrigem);
const regraPing = doDisco.regras.find((r) => r.eventoOrigem === 'ping');
ok(regraPing !== undefined, "a regra de 'ping' está lá (o botão Testar da plataforma não é venda)");
ok(regraPing?.modo === 'ignorar', "e o 'ping' nasce em 'ignorar'", String(regraPing?.modo));
const foraDaTag = origensX.filter((o) => o !== 'ping' && !String(o).startsWith('tag.'));
ok(
  foraDaTag.length === 0,
  'nenhuma semente de webhook da empresa padrão entra na empresa nova',
  foraDaTag.slice(0, 6).join(',')
);
ok(origensX.includes('tag.pageview'), 'as sementes da tag entram (sem elas o PageView cai num fallback invisível)');
const emAutoX = doDisco.regras.filter((r) => r.modo === 'auto');
ok(
  emAutoX.length === 0,
  "🔴 E-6: nenhuma regra da empresa nova nasce em 'auto'",
  emAutoX.map((r) => r.eventoOrigem).join(',')
);
ok(doDisco.tag.dominios.length === 0 && doDisco.saida.length === 0, 'nasce sem domínio de tag e sem saída');

// Segunda chamada com o mesmo id: girar o segredo de uma empresa que já recebe
// venda é o defeito B1 de novo, agora multiplicado por cliente.
const hashX = sha256(ARQ_INTEG_X);
const denovo = await cfgStore.criarIntegracoesDaEmpresa({ id: 'emp_x', slug: 'outro-apelido' });
ok(denovo === null, 'a segunda chamada com o mesmo id devolve null');
ok(sha256(ARQ_INTEG_X) === hashX, '🔴 e não reescreve o arquivo: o segredo da empresa não gira sozinho');

ok((await cfgStore.criarIntegracoesDaEmpresa({ id: 'default' })) === null, "🔴 E-4: id 'default' é recusado");
for (const mau of ['../integracoes', 'a/b', '', 'emp x', '..']) {
  ok(
    (await cfgStore.criarIntegracoesDaEmpresa({ id: mau })) === null,
    `id ${JSON.stringify(mau)} é recusado antes de qualquer escrita`
  );
}
ok(sha256(ARQ_INTEG) === hashAntes, '🔴 nem a recusa por travessia de caminho encostou no arquivo da padrão');

// A leitura da empresa nova também não pode arrastar as sementes de webhook de
// volta: se `lerIntegracoes` mesclar `todasSementes()` sem olhar a empresa, a
// recusa acima vira enfeite no primeiro acesso à tela de regras.
const lidaX = await cfgStore.lerIntegracoes('emp_x');
const foraDaTagNaLeitura = lidaX.regras
  .map((r) => r.eventoOrigem)
  .filter((o) => o !== 'ping' && !String(o).startsWith('tag.'));
ok(
  foraDaTagNaLeitura.length === 0,
  'e a PRIMEIRA LEITURA da empresa nova não traz de volta as sementes de webhook (D-14)',
  `${foraDaTagNaLeitura.length}: ${foraDaTagNaLeitura.slice(0, 6).join(',')}`
);

/* ================================================================== */
console.log('\n  -- (o) [E.6 i] de quem é este segredo de entrada --');

await empresas.salvarEmpresa({ id: 'emp_x', nome: 'Empresa X' });
const cfgX = await cfgStore.lerIntegracoes('emp_x');

const porPadrao = await empresas.acharEmpresaPorSegredo(cfgDefault.entrada.segredo);
ok(porPadrao?.empresaId === 'default', 'o segredo da padrão acha a padrão', String(porPadrao?.empresaId));
ok(porPadrao?.cfg?.entrada?.segredo === cfgDefault.entrada.segredo, 'e a busca devolve a config dela junto');

const porX = await empresas.acharEmpresaPorSegredo(cfgX.entrada.segredo);
ok(porX?.empresaId === 'emp_x', 'o segredo da emp_x acha a emp_x', String(porX?.empresaId));
ok(porX?.cfg?.tag?.chave === cfgX.tag.chave, 'com a config da emp_x, não a da padrão');

ok(
  (await empresas.acharEmpresaPorSegredo('segredo-que-ninguem-cadastrou')) === undefined,
  '🔴 segredo errado → undefined (é dele que sai o 401 idêntico de hoje)'
);
ok((await empresas.acharEmpresaPorSegredo('')) === undefined, 'segredo vazio não casa com ninguém');
ok(
  (await empresas.acharEmpresaPorSegredo(cfgDefault.entrada.segredo.slice(0, -1))) === undefined,
  'segredo por um caractere não entra'
);

/* ================================================================== */
console.log('\n  -- (p) [E.6 j] de quem é esta chave de tag --');

const tagPadrao = await empresas.acharEmpresaPorChaveTag(cfgDefault.tag.chave);
ok(tagPadrao?.empresaId === 'default', 'a chave da padrão acha a padrão', String(tagPadrao?.empresaId));
ok(tagPadrao?.cfg?.tag?.chave === cfgDefault.tag.chave, 'e devolve a config dela');

const tagX = await empresas.acharEmpresaPorChaveTag(cfgX.tag.chave);
ok(tagX?.empresaId === 'emp_x', 'a chave da emp_x acha a emp_x', String(tagX?.empresaId));
ok(tagX?.cfg?.entrada?.segredo === cfgX.entrada.segredo, 'com a config da emp_x');

ok(
  (await empresas.acharEmpresaPorChaveTag('cvt_chaveQueNinguemCadastrou')) === undefined,
  'chave de tag desconhecida → undefined (o 401 do coletor)'
);
ok((await empresas.acharEmpresaPorChaveTag('')) === undefined, 'chave vazia não vira coringa');
ok((await empresas.acharEmpresaPorChaveTag('   ')) === undefined, 'chave só de espaços também não');

/* ================================================================== */
console.log('\n  -- (q) [E.6 k] a caixa de entrada é por empresa --');

// Item gravado sem `empresaId` é todo item anterior a esta fase: ele é da
// padrão, e continua visível para ela sem que ninguém reescreva o jsonl (E-3).
const itemAntigo = await inbox.registrarEntrada({
  origem: 'webhook',
  evento: 'Purchase',
  temFbc: false,
  temFbp: false,
  payload: { nota: 'item gravado antes da FASE E' },
});
ok(itemAntigo.empresaId === undefined, 'o item antigo é gravado sem campo de empresa');

const itemX = await inbox.registrarEntrada({
  origem: 'webhook',
  evento: 'Purchase',
  temFbc: false,
  temFbp: false,
  empresaId: 'emp_x',
  payload: { nota: 'item da emp_x' },
});

const daX = await inbox.listarEntradas(50, 'emp_x');
ok(daX.some((i) => i.id === itemX.id), 'listarEntradas(50, "emp_x") devolve o item da emp_x');
ok(
  !daX.some((i) => i.id === itemAntigo.id),
  '🔴 e NÃO devolve o item antigo: sem campo, o item é da padrão'
);

const daPadrao = await inbox.listarEntradas(50, 'default');
ok(
  daPadrao.some((i) => i.id === itemAntigo.id),
  '🔴 E-3: listarEntradas(50, "default") devolve o item antigo, sem migrar nada'
);
ok(!daPadrao.some((i) => i.id === itemX.id), 'e não devolve o da emp_x');

const todos = await inbox.listarEntradas(50);
ok(
  todos.some((i) => i.id === itemAntigo.id) && todos.some((i) => i.id === itemX.id),
  '🔴 SEM empresaId a lista continua vindo inteira — o disparo automático depende disso'
);

/* ================================================================== */
console.log('\n  -- (r) [E.6 l] atribuição: o perfil de uma empresa não vaza para a outra --');

// A função `chaves()` é interna; o que importa é o comportamento observável, que
// é o que custa dinheiro: o mesmo visitante navegando em dois clientes deste
// console são duas atribuições diferentes. Sem separar, a venda de um herdaria o
// fbc da visita feita no site do outro e seria creditada a uma campanha que não
// vendeu nada.
const ARQ_PERFIS = path.join(tmp, 'logs', 'perfis-atribuicao.jsonl');
const chavesGravadas = () =>
  fs
    .readFileSync(ARQ_PERFIS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l).chave);

const VISITA = 'visita-das-duas-empresas-7777';
const FBC_DA_X = 'fb.1.1788000000000.PAcGRvDAEMPRESAX';
const FBC_DA_PADRAO = 'fb.1.1788000000001.PAcGRvDAPADRAO';

await perfil.guardarPerfil({ visitId: VISITA, fbc: FBC_DA_X }, 'emp_x');
await perfil.guardarPerfil({ visitId: VISITA, fbc: FBC_DA_PADRAO }, 'default');

const gravadas = chavesGravadas();
ok(gravadas.includes(`emp_x|visita:${VISITA}`), 'a chave de uma empresa não padrão sai prefixada com "emp_x|"');
ok(
  gravadas.includes(`visita:${VISITA}`),
  '🔴 zero migração: a chave da padrão sai exatamente como hoje, SEM prefixo'
);

perfil._limparCache();
const naPadrao = await perfil.enriquecer({ visitId: VISITA }, 'default');
ok(naPadrao.campos.fbc === FBC_DA_PADRAO, 'um evento da padrão herda o fbc da padrão', String(naPadrao.campos.fbc));
const naX = await perfil.enriquecer({ visitId: VISITA }, 'emp_x');
ok(naX.campos.fbc === FBC_DA_X, 'e um evento da emp_x herda o da emp_x', String(naX.campos.fbc));

const SO_NA_X = 'visita-so-da-emp-x-8888';
await perfil.guardarPerfil({ visitId: SO_NA_X, fbc: 'fb.1.1788000000002.PAcGRvSONAX' }, 'emp_x');
perfil._limparCache();
const vazou = await perfil.enriquecer({ visitId: SO_NA_X }, 'default');
ok(
  !vazou.campos.fbc && vazou.herdados.length === 0,
  '🔴 uma venda da padrão NÃO herda o fbc de uma visita que só existe na emp_x'
);
const soNaX = await perfil.enriquecer({ visitId: SO_NA_X }, 'emp_x');
ok(soNaX.campos.fbc === 'fb.1.1788000000002.PAcGRvSONAX', 'mas a emp_x herda o dela');

const semArgumento = await perfil.enriquecer({ visitId: VISITA });
ok(
  semArgumento.campos.fbc === FBC_DA_PADRAO,
  'sem argumento, enriquecer continua sendo a padrão — o caminho de hoje, intacto'
);

/* ================================================================== */

process.chdir(raizAnterior);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Fundação multi-empresa fechada: o arquivo não nasce sozinho, o token não entra, o automático ligado trava a remoção — e config/integracoes.json continua byte a byte o mesmo.\n'
    : `\n  ${falhas} falha(s).\n`
);
process.exit(falhas === 0 ? 0 : 1);
