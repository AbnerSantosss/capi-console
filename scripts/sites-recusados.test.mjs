#!/usr/bin/env node
/**
 * T-M19 — sites recusados pela tag, com "Autorizar este site".
 *
 *   a  o coletor anota o site nos dois pontos de recusa por origem, sem `after`
 *      e sem mudar a resposta que o navegador recebe;
 *   b  a biblioteca guarda só empresa, host, contagem e duas horas, num arquivo
 *      com teto, gravado pelo utilitário atômico;
 *   c  a rota exige sessão e não entra na lista de rotas livres;
 *   d  a tela mostra o bloco fora da lista recolhida e pede com a empresa dela;
 *   e  rodando de verdade numa pasta temporária: soma, separa por empresa,
 *      respeita o teto e a validade, e esquece quando o operador ignora.
 *
 * Não sobe o app e não chama nada de fora.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe !== '' ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const ler = (relativo) => {
  const inteiro = path.join(RAIZ, relativo);
  return fs.existsSync(inteiro) ? fs.readFileSync(inteiro, 'utf8') : '';
};

const semComentario = (texto) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const vezes = (texto, padrao) => (texto.match(padrao) ?? []).length;

console.log('\n  a. O coletor');
const coletor = ler('src/lib/tag-handler.ts');
ok(coletor !== '', 'a0: o arquivo do coletor existe');
ok(
  /import \{ anotarSiteRecusado, hostDaOrigemRecusada, podeInvestigarRecusa \} from '@\/lib\/tag-recusados';/.test(coletor),
  'a1: o coletor importa a biblioteca dos sites recusados'
);
ok(
  /origensRecusadas\+\+;\s*await anotarRecusaDoPasso1\(request\);\s*return NextResponse\.json\(\{ erro: 'Origem nao autorizada\.' \}, \{ status: 403 \}\);/.test(coletor),
  'a2: passo 1 anota e devolve o mesmo 403 de sempre'
);
ok(
  /origensRecusadas\+\+;\s*anotarSiteRecusado\(empresaId, request\.headers\.get\('origin'\)\);\s*return NextResponse\.json\(\{ erro: 'Origem nao autorizada\.' \}, \{ status: 403 \}\);/.test(coletor),
  'a3: passo 4b anota e devolve o mesmo 403 de sempre'
);
const inicioDoPasso1 = coletor.indexOf('async function anotarRecusaDoPasso1');
const fimDoPasso1 = coletor.indexOf('function baseAtual');
const passo1 =
  inicioDoPasso1 >= 0 && fimDoPasso1 > inicioDoPasso1 ? coletor.slice(inicioDoPasso1, fimDoPasso1) : '';
ok(passo1 !== '', 'a4: a função do passo 1 existe, antes de baseAtual');
ok(!/\bafter\(/.test(passo1), 'a5: a função do passo 1 não usa after()');
ok(
  /podeInvestigarRecusa\(\)/.test(passo1) && vezes(passo1, /LIMITE_TAG/g) === 2,
  'a6: a leitura do corpo tem freio e os dois tetos de tamanho'
);
// Sem comentário: o arquivo cita "after()" num comentário que não é chamada.
const chamadasDeAfter = vezes(semComentario(coletor), /\bafter\(/g);
ok(chamadasDeAfter === 2, 'a7: o coletor continua com as duas chamadas de after() de antes', `(${chamadasDeAfter})`);
ok(
  /import \{ registrarEntrada, mascararEmail, hashDoEmail \} from '@\/lib\/inbox';/.test(coletor),
  'a8: o import do inbox ficou como estava'
);

console.log('\n  b. A biblioteca');
const lib = ler('src/lib/tag-recusados.ts');
const libCodigo = semComentario(lib);
ok(lib !== '', 'b0: o arquivo da biblioteca existe');
ok(/^import 'server-only';/.test(lib), 'b1: a biblioteca é só de servidor');
ok(/'logs', 'tag-sites-recusados\.json'/.test(libCodigo), 'b2: o arquivo fica em logs/tag-sites-recusados.json');
ok(vezes(libCodigo, /gravarAtomico\(/g) === 1, 'b3: uma gravação só, pelo utilitário atômico', `(${vezes(libCodigo, /gravarAtomico\(/g)})`);
ok(!/writeFile|appendFile/.test(libCodigo), 'b4: nenhuma gravação direta');
ok(/backup: false/.test(libCodigo), 'b5: sem cópia .bak');
ok(!/next\/server|\bafter\(/.test(libCodigo), 'b6: a biblioteca não depende de requisição');
ok(!/request|headers|user-agent|forwarded/i.test(libCodigo), 'b7: a biblioteca não vê a requisição (só o texto do Origin)');

console.log('\n  c. A rota');
const rota = ler('src/app/api/tag/recusados/route.ts');
ok(rota !== '', 'c0: o arquivo da rota existe');
ok(
  /export async function GET\(/.test(rota) && /export async function DELETE\(/.test(rota),
  'c1: a rota tem GET e DELETE'
);
ok(vezes(rota, /exigirSessao\(request\);/g) === 2, 'c2: os dois métodos exigem sessão', `(${vezes(rota, /exigirSessao\(request\);/g)})`);
ok(/empresaParaEscrita\(request, 'ignorar'\)/.test(rota), 'c3: o DELETE usa a regra de escrita da empresa');
ok(/!origemPermitida\(/.test(rota), 'c4: o GET tira o site que já é permitido');
ok(!/recusad/i.test(ler('src/proxy.ts')), 'c5: a rota não entrou na lista de rotas livres');

console.log('\n  d. A tela');
const tela = ler('src/components/integrations/TagDoSite.tsx');
const pagina = ler('src/components/instalacao/InstalacaoPage.tsx');
const ondeBotao = tela.indexOf('Autorizar este site');
const ondeLista = tela.indexOf('id="tag-sites"');
ok(ondeBotao >= 0, 'd1: a tela tem o botão "Autorizar este site"');
ok(ondeBotao >= 0 && ondeLista > ondeBotao, 'd2: o bloco vem antes da lista recolhida (fora dela)');
ok(vezes(tela, /'\/api\/tag\/recusados'/g) === 2, 'd3: a tela chama a rota para listar e para ignorar', `(${vezes(tela, /'\/api\/tag\/recusados'/g)})`);
ok(vezes(tela, /'X-Empresa-Id': empresaId/g) === 2, 'd4: as duas chamadas mandam a empresa da tela', `(${vezes(tela, /'X-Empresa-Id': empresaId/g)})`);
ok(/recusados\.empresaId === empresaId/.test(tela), 'd5: a lista de outra empresa nunca aparece');
ok(/import type \{ SiteRecusado \} from '@\/lib\/tag-recusados';/.test(tela), 'd6: da biblioteca de servidor a tela importa só o tipo');
ok(/empresaId=\{empresaId\}/.test(pagina), 'd7: a página entrega a empresa dela à tela');
ok(!/tag\/recusados/.test(pagina), 'd8: a página não ganhou chamada nova');

console.log('\n  e. Rodando numa pasta temporária');
// A biblioteca monta o caminho do arquivo com a pasta atual, na carga:
// por isso a troca de pasta vem ANTES do import.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-recusados-'));
process.chdir(tmp);
const recusados = await import(new URL('../src/lib/tag-recusados.ts', import.meta.url).href);
const ARQUIVO = path.join(process.cwd(), 'logs', 'tag-sites-recusados.json');
const DIA = 24 * 60 * 60 * 1000;
const agora = Date.now();

const casos = [
  ['https://loja-nova.com.br', 'loja-nova.com.br'],
  ['https://www.loja-nova.com.br/pagina?x=1', 'loja-nova.com.br'],
  ['https://LOJA-NOVA.com.br:8443', 'loja-nova.com.br'],
  ['http://loja-nova.com.br', ''],
  ['https://localhost', ''],
  ['https://127.0.0.1', ''],
  ['isto nao e um endereco', ''],
  ['', ''],
  [null, ''],
];
for (const [origem, esperado] of casos) {
  const saiu = recusados.hostDaOrigemRecusada(origem);
  ok(saiu === esperado, `e1: Origin ${JSON.stringify(origem)} → ${JSON.stringify(esperado)}`, `(${JSON.stringify(saiu)})`);
}

recusados.anotarSiteRecusado('emp_a', 'https://loja-nova.com.br', agora - 3000);
recusados.anotarSiteRecusado('emp_a', 'https://www.loja-nova.com.br', agora - 2000);
recusados.anotarSiteRecusado('emp_a', 'https://loja-nova.com.br', agora - 1000);
recusados.anotarSiteRecusado('emp_a', 'http://loja-nova.com.br', agora);
recusados.anotarSiteRecusado('', 'https://loja-nova.com.br', agora);
const deA = await recusados.listarSitesRecusados('emp_a');
ok(
  deA.length === 1 && deA[0].host === 'loja-nova.com.br' && deA[0].vezes === 3,
  'e2: três recusas do mesmo site (com e sem www) viram uma linha com 3 tentativas',
  `(${JSON.stringify(deA)})`
);
ok(
  deA.length === 1 &&
    deA[0].primeiraVez === new Date(agora - 3000).toISOString() &&
    deA[0].ultimaVez === new Date(agora - 1000).toISOString(),
  'e3: a linha guarda a primeira e a última hora'
);
ok(
  deA.length === 1 && Object.keys(deA[0]).sort().join(',') === 'host,primeiraVez,ultimaVez,vezes',
  'e4: a tela recebe só host, contagem e as duas horas'
);
const deB = await recusados.listarSitesRecusados('emp_b');
ok(deB.length === 0, 'e5: a empresa B não vê o site recusado da empresa A', `(${deB.length})`);

const noDisco = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
ok(
  Object.keys(noDisco).join(',') === 'sites' && Array.isArray(noDisco.sites) && noDisco.sites.length === 1,
  'e6: o arquivo é { sites: [...] } com uma linha'
);
ok(
  Object.keys(noDisco.sites[0] ?? {}).sort().join(',') === 'empresaId,host,primeiraVez,ultimaVez,vezes',
  'e7: no disco só há empresa, host, contagem e as duas horas',
  `(${Object.keys(noDisco.sites[0] ?? {}).sort().join(',')})`
);

recusados.anotarSiteRecusado('emp_a', 'https://loja-nova.com.br', agora);
const deA2 = await recusados.listarSitesRecusados('emp_a');
ok(deA2.length === 1 && deA2[0].vezes === 4, 'e8: a recusa seguinte soma na linha que já estava no disco', `(${deA2[0]?.vezes})`);

for (let i = 1; i <= 25; i++) {
  recusados.anotarSiteRecusado('emp_c', `https://site${i}.exemplo.com.br`, agora - (30 - i) * 1000);
}
const deC = await recusados.listarSitesRecusados('emp_c');
ok(deC.length === 20, 'e9: o teto é de 20 sites por empresa', `(${deC.length})`);
ok(deC[0]?.host === 'site25.exemplo.com.br', 'e10: a lista vem da tentativa mais nova para a mais antiga', `(${deC[0]?.host})`);
ok(!deC.some((s) => s.host === 'site1.exemplo.com.br'), 'e11: quem sai pelo teto é o mais antigo');
const noDisco2 = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
ok(
  noDisco2.sites.filter((s) => s.empresaId === 'emp_c').length === 20,
  'e12: o teto vale no disco, não só na resposta'
);
ok((await recusados.listarSitesRecusados('emp_a')).length === 1, 'e13: o teto de uma empresa não derruba a linha de outra');

recusados.anotarSiteRecusado('emp_d', 'https://antigo.exemplo.com.br', agora - 31 * DIA);
recusados.anotarSiteRecusado('emp_d', 'https://recente.exemplo.com.br', agora - 29 * DIA);
const deD = await recusados.listarSitesRecusados('emp_d');
ok(
  deD.length === 1 && deD[0].host === 'recente.exemplo.com.br',
  'e14: site que não tenta há mais de 30 dias sai; o de 29 dias fica',
  `(${JSON.stringify(deD.map((s) => s.host))})`
);

await recusados.esquecerSiteRecusado('emp_a', 'loja-nova.com.br');
ok((await recusados.listarSitesRecusados('emp_a')).length === 0, 'e15: ignorar tira o site da lista');
ok((await recusados.listarSitesRecusados('emp_c')).length === 20, 'e16: ignorar numa empresa não mexe na outra');

const t0 = 2_000_000_000_000;
let liberadas = 0;
for (let i = 0; i < 200; i++) if (recusados.podeInvestigarRecusa(t0)) liberadas++;
ok(liberadas === 60, 'e17: o freio libera 60 leituras de corpo por minuto', `(${liberadas})`);
ok(recusados.podeInvestigarRecusa(t0 + 60_001) === true, 'e18: um minuto depois o freio abre de novo');

await recusados.descarregarSitesRecusados();
process.chdir(RAIZ);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(falhas === 0 ? '\n  Sites recusados: tudo certo.' : `\n  ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
