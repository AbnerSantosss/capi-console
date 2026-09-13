#!/usr/bin/env node
/**
 * As travas da tag de navegador. Cada uma tem um preco em dinheiro:
 *
 *  1. LISTA BRANCA DE ORIGIN — o coletor publico nao tem senha (a chave da tag
 *     vive no HTML, qualquer visitante le). O casamento de dominio e o unico
 *     filtro que sobra. Se 'malcodigovencedor.com.br' passar por sufixo solto,
 *     qualquer site da internet manda evento em nome do cliente e o pixel
 *     aprende com trafego que nao e nosso — a campanha inteira fica burra.
 *
 *  2. LISTA BRANCA DE EVENTO — se o navegador conseguir criar Purchase ou
 *     Subscribe, qualquer pessoa forja uma venda que nunca existiu: receita
 *     falsa no Gerenciador, otimizacao para quem nao compra e violacao da
 *     regra 1 do CLAUDE.md (somente eventos reais).
 *
 *  3. NENHUMA REGRA NASCE EM 'auto' — regra nova em automatico dispara para a
 *     Meta antes de um humano ver o primeiro evento chegar. Errou o mapeamento,
 *     errou em producao, e evento enviado nao volta.
 *
 *  4. CHAVES DO PERFIL — chave lixo (visitId de 2 letras, fbp truncado) colide:
 *     dois compradores diferentes caem no MESMO perfil e um herda o fbc do
 *     outro. Custa a atribuicao E envenena a otimizacao.
 *
 *  5. JUNCAO ANONIMA (a que mais vale) — na pagina de vendas o visitante nao
 *     tem e-mail; ele so nasce depois, no backoffice. O hit da tag e a venda do
 *     PIX se encontram pelo cv_visit. Se essa juncao quebrar, o Purchase chega
 *     a Meta sem fbc, orfao, e nenhuma campanha recebe o credito da venda.
 *
 *  6. cv_visit NO WEBHOOK — se o parser nao ler o bloco `tracking`, a venda
 *     chega sem a chave de juncao e o item 5 nunca acontece.
 *
 *  7. SCRIPT GERADO — JavaScript quebrado derruba a medicao de todos os
 *     clientes de uma vez, em silencio. E o segredo de entrada dentro da tag
 *     publica deixaria qualquer visitante forjar um Purchase pelo webhook.
 *
 *  8. CHAVE DE TAG NAO ATRAVESSA EMPRESA — a chave e publica (vive no HTML do
 *     cliente). Se o coletor conferisse o dominio contra a lista de qualquer
 *     empresa, quem copiasse a chave do cliente B coletaria a partir do site do
 *     cliente A: os PageView de A cairiam no pixel de B e a campanha de B
 *     otimizaria para um publico que nunca viu a oferta dela.
 *
 * Roda num diretorio temporario (nunca toca os logs reais) e sem rede.
 *
 * Uso: npm run test:tag
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

// Dentro de src/lib os imports sao sem extensao ('./tag-eventos'), porque quem
// resolve la e o bundler do Next. O Node cru exige a extensao. Sem este gancho
// o teste nem carrega tag-script.ts, e a unica prova de que o script gerado
// compila deixaria de existir — a tag quebrada so apareceria no site do cliente.
//
// A cerca do parentURL nao e estilo: o Next publica CommonJS que faz
// require('../next-url') por dentro. Sem ela o gancho reescrevia AQUILO para
// '../next-url.ts' e o carregamento de next/server morria — que e justamente o
// que o bloco 9 precisa para chamar o coletor de verdade.
const DENTRO_DO_SRC = new URL('../src/', import.meta.url).href;
registerHooks({
  resolve(especificador, contexto, seguinte) {
    if (
      especificador.startsWith('.') &&
      !path.extname(especificador) &&
      String(contexto.parentURL ?? '').startsWith(DENTRO_DO_SRC)
    ) {
      return seguinte(especificador + '.ts', contexto);
    }
    return seguinte(especificador, contexto);
  },
});

const DIR = path.dirname(fileURLToPath(import.meta.url));
const exemplo = (nome) => fs.readFileSync(path.join(DIR, 'exemplos', nome), 'utf8');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-tag-'));
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const raiz = process.cwd();
// perfil-atribuicao.ts resolve o caminho do jsonl no import, entao a troca de
// diretorio vem ANTES de qualquer import.
process.chdir(tmp);

const { origemPermitida } = await import(
  new URL('../src/lib/tag-dominios.ts', import.meta.url).href
);
const { EVENTOS_TAG, EVENTOS_TAG_PROIBIDOS, eventoTagPermitido, regrasSementeTag } = await import(
  new URL('../src/lib/tag-eventos.ts', import.meta.url).href
);
const { gerarScriptTag } = await import(new URL('../src/lib/tag-script.ts', import.meta.url).href);
const { guardarPerfil, enriquecer, _limparCache } = await import(
  new URL('../src/lib/perfil-atribuicao.ts', import.meta.url).href
);
const { parseWebhook } = await import(new URL('../src/lib/parser.ts', import.meta.url).href);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const BASE = 'https://capi.proxserverabner.site';

console.log('\n  Tag de navegador — lista branca, juncao anonima e script gerado\n');

/* ---------------- 1. Lista branca de Origin ---------------- */

const dominios = [
  {
    id: 'd-1',
    host: 'codigovencedor.com.br',
    subdominio: 'tk',
    criadoEm: '2026-09-12T00:00:00.000Z',
    hits: 0,
  },
];

// A falha classica: endsWith sem o ponto deixaria o atacante registrar
// 'malcodigovencedor.com.br' e entrar na lista branca do cliente.
ok(
  origemPermitida('https://malcodigovencedor.com.br', dominios, BASE) === null,
  'sufixo solto nao passa: malcodigovencedor.com.br e recusado'
);
ok(
  origemPermitida('https://codigovencedor.com.br.invasor.net', dominios, BASE) === null,
  'dominio cadastrado como prefixo de outro tambem e recusado'
);
ok(
  origemPermitida('https://codigovencedor.com.br', dominios, BASE) === 'https://codigovencedor.com.br',
  'o dominio exato passa e volta ecoado'
);
ok(
  origemPermitida('https://tk.codigovencedor.com.br', dominios, BASE) ===
    'https://tk.codigovencedor.com.br',
  'subdominio legitimo do dominio cadastrado passa'
);
ok(
  origemPermitida('https://capi.proxserverabner.site', [], BASE) === 'https://capi.proxserverabner.site',
  'a nossa propria base passa sem dominio cadastrado'
);
ok(
  origemPermitida('http://codigovencedor.com.br', dominios, BASE) === null,
  'http em dominio real e recusado (fbc em texto claro)'
);
ok(origemPermitida(null, dominios, BASE) === null, 'Origin ausente e recusado');
ok(origemPermitida('', dominios, BASE) === null, 'Origin vazio e recusado');
ok(origemPermitida('null', dominios, BASE) === null, "Origin 'null' de iframe sandbox e recusado");
ok(
  origemPermitida('http://localhost:3333', dominios, BASE) === 'http://localhost:3333',
  'localhost e aceito, para o operador conferir a tag antes de entregar'
);
ok(
  origemPermitida('https://outrodominio.com.br', dominios, BASE) === null,
  'dominio que ninguem cadastrou e recusado'
);

console.log('');

/* ---------------- 2. Lista branca de evento ---------------- */

ok(eventoTagPermitido('tag.pageview')?.evento === 'PageView', 'tag.pageview resolve para PageView');
ok(eventoTagPermitido('tag.purchase') === undefined, 'tag.purchase NAO resolve: venda so vem do webhook');
ok(eventoTagPermitido('tag.subscribe') === undefined, 'tag.subscribe NAO resolve');
ok(eventoTagPermitido('') === undefined, 'origem vazia nao resolve');
ok(eventoTagPermitido('Purchase') === undefined, 'nome de evento da Meta nao serve como origem');

const proibidoNoCatalogo = EVENTOS_TAG.filter((e) => EVENTOS_TAG_PROIBIDOS.has(e.evento));
ok(
  proibidoNoCatalogo.length === 0,
  'nenhum EVENTOS_TAG aponta para evento de dinheiro',
  proibidoNoCatalogo.map((e) => e.evento).join(',')
);
const naoResolve = EVENTOS_TAG.filter((e) => !eventoTagPermitido(e.origem));
ok(
  naoResolve.length === 0,
  'todo evento do catalogo resolve na lista branca',
  naoResolve.map((e) => e.origem).join(',')
);

console.log('');

/* ---------------- 3. Sementes da tag ---------------- */

const sementes = regrasSementeTag();
const emAuto = sementes.filter((r) => r.modo === 'auto');
ok(sementes.length === EVENTOS_TAG.length, 'uma regra semente para cada evento do catalogo');
ok(
  emAuto.length === 0,
  "NENHUMA regra da tag nasce em 'auto'",
  emAuto.map((r) => r.eventoOrigem).join(',')
);
ok(
  sementes.every((r) => r.modo === 'fila' || r.modo === 'ignorar'),
  "toda semente nasce em 'fila' ou 'ignorar'"
);

console.log('');

/* ---------------- 4. Chaves do perfil de atribuicao ---------------- */

const ARQ_PERFIS = path.join(tmp, 'logs', 'perfis-atribuicao.jsonl');

/** Chaves gravadas a partir da linha `desde` do jsonl (append-only). */
const chavesDesde = (desde) => {
  let txt = '';
  try {
    txt = fs.readFileSync(ARQ_PERFIS, 'utf8');
  } catch {
    // Arquivo ainda nao existe: guardarPerfil descartou tudo, que e um
    // resultado valido — devolve lista vazia.
    return [];
  }
  return txt
    .split('\n')
    .filter(Boolean)
    .slice(desde)
    .map((l) => JSON.parse(l).chave);
};
const totalLinhas = () => chavesDesde(0).length;

let marca = totalLinhas();
await guardarPerfil({ visitId: 'visita-valida-aaaa1111', userAgent: 'Mozilla/5.0 (Android)' });
ok(
  chavesDesde(marca).includes('visita:visita-valida-aaaa1111'),
  "visitId valido gera chave 'visita:'"
);

marca = totalLinhas();
await guardarPerfil({ visitId: 'ab', ip: '187.10.20.30' });
ok(
  !chavesDesde(marca).some((c) => c.startsWith('visita:')),
  "visitId curto NAO gera chave 'visita:'"
);

marca = totalLinhas();
await guardarPerfil({ visitId: '   ', ip: '187.10.20.31' });
ok(
  !chavesDesde(marca).some((c) => c.startsWith('visita:')),
  "visitId vazio NAO gera chave 'visita:'"
);

marca = totalLinhas();
await guardarPerfil({ fbp: 'fb.1.1788449825430.2324207034', userAgent: 'Mozilla/5.0' });
ok(
  chavesDesde(marca).includes('fbp:fb.1.1788449825430.2324207034'),
  "fbp no formato oficial gera chave 'fbp:'"
);

marca = totalLinhas();
await guardarPerfil({ fbp: 'fb.1.123.456', userAgent: 'Mozilla/5.0' });
ok(
  !chavesDesde(marca).some((c) => c.startsWith('fbp:')),
  "fbp truncado NAO gera chave 'fbp:'"
);

marca = totalLinhas();
await guardarPerfil({ fbp: 'undefined', userAgent: 'Mozilla/5.0' });
ok(
  !chavesDesde(marca).some((c) => c.startsWith('fbp:')),
  "a string 'undefined' NAO vira chave de fbp"
);

console.log('');

/* ---------------- 5. A juncao anonima (a trava que vale dinheiro) --------- */

const VISITA = 'cv-visita-9f3a2b7c4d1e';
const FBC_DA_VISITA = 'fb.1.1788473054158.PAcGRvEXEMPLO';

// Hit da tag na pagina de vendas: NAO tem e-mail nenhum, o visitante e anonimo.
await guardarPerfil({
  visitId: VISITA,
  fbc: FBC_DA_VISITA,
  fbp: 'fb.1.1788473054158.2324207034',
  userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-A566B)',
  sourceUrl: 'https://codigovencedor.com.br/?utm_campaign=52564275344761',
});

// Horas depois chega o purchase_approved do PIX: so o e-mail do backoffice e o
// cv_visit que o checkout carregou. Sem fbc, sem fbp, sem user agent.
const venda = await enriquecer({
  email: 'comprador.pix@dominio-ficticio.com.br',
  visitId: VISITA,
  value: '27.90',
  currency: 'BRL',
  orderId: '118',
});

ok(
  venda.campos.fbc === FBC_DA_VISITA,
  'a venda do PIX herda o fbc do hit anonimo da tag',
  String(venda.campos.fbc)
);
ok(venda.herdados.includes('fbc'), 'a lista de herdados registra o fbc', venda.herdados.join(','));
ok(
  venda.campos.fbp && venda.campos.userAgent && venda.campos.sourceUrl,
  'herda tambem fbp, user agent e a URL com as UTMs'
);
ok(venda.campos.value === '27.90' && venda.campos.orderId === '118', 'o que a venda trouxe e preservado');

// Visitante que limpou o storage perde o cv_visit: o fbp ainda salva a venda.
const porFbp = await enriquecer({
  email: 'outro.comprador@dominio-ficticio.com.br',
  fbp: 'fb.1.1788473054158.2324207034',
  value: '27.90',
});
ok(porFbp.campos.fbc === FBC_DA_VISITA, 'sem cv_visit, o fbp ainda encontra a visita');

// E um cv_visit que nunca existiu nao herda dado de terceiro.
const semPerfil = await enriquecer({
  email: 'ninguem@dominio-ficticio.com.br',
  visitId: 'cv-visita-inexistente-0000',
});
ok(
  !semPerfil.campos.fbc && semPerfil.herdados.length === 0,
  'visita desconhecida nao herda fbc de outro comprador'
);

console.log('');

/* ---------------- 6. O webhook precisa entregar o cv_visit ---------------- */

const b = parseWebhook(exemplo('B-checkout.session.completed.json'));
ok(
  b.fields.visitId === 'exemplo-visit-0001',
  'parseWebhook le tracking.cv_visit para campos.visitId',
  String(b.fields.visitId)
);
ok(
  b.eventName === 'Purchase' && b.classificacao === 'mapeado',
  'a fixture continua sendo uma compra',
  `${b.eventName}/${b.classificacao}`
);
ok(b.fields.fbclid === 'PAcGRvEXEMPLO', 'o fbclid cru vem junto, para remontar o fbc no disparo');

console.log('');

/* ---------------- 7. O script gerado ---------------- */

const ENDPOINT = 'https://tk.codigovencedor.com.br/api/tag/coletar';
const CHAVE = 'cvt_TESTEchavepublica0001';
// Segredo de entrada de mentira, no mesmo formato (UUID) do real. Nunca o real:
// este arquivo vai para o git.
const SEGREDO_ENTRADA = '00000000-1111-2222-3333-444444444444';

const script = gerarScriptTag({
  endpoint: ENDPOINT,
  chave: CHAVE,
  evento: eventoTagPermitido('tag.pageview'),
  host: 'codigovencedor.com.br',
});

let erroSintaxe = '';
try {
  // So analisa, nao executa: new Function compila o corpo e joga SyntaxError se
  // o texto gerado estiver quebrado.
  new Function(script);
} catch (e) {
  erroSintaxe = String(e?.message ?? e);
}
ok(erroSintaxe === '', 'o JavaScript gerado e sintaticamente valido', erroSintaxe);

ok(script.includes(ENDPOINT), 'o script leva o endpoint do coletor');
ok(script.includes(CHAVE), 'o script leva a chave publica da tag');
ok(!script.includes(SEGREDO_ENTRADA), 'o script NAO leva o segredo de entrada do xWinner');
ok(!/whsec_/.test(script), 'o script nao leva segredo de assinatura de webhook');
ok(script.includes('tag.pageview'), 'o script identifica a origem do evento');
ok(!/<\/script/i.test(script), 'nada no script fecha a tag <script> da pagina do cliente');

// Toda a familia gerada tem que compilar, nao so o PageView.
const quebrados = [];
for (const e of EVENTOS_TAG) {
  try {
    new Function(gerarScriptTag({ endpoint: ENDPOINT, chave: CHAVE, evento: e }));
  } catch (err) {
    quebrados.push(`${e.origem}: ${String(err?.message ?? err)}`);
  }
}
ok(quebrados.length === 0, 'todos os eventos do catalogo geram script valido', quebrados.join(' | '));

// O gerador tem que RECUSAR, e nao gerar em silencio, um evento de dinheiro.
let recusou = false;
try {
  gerarScriptTag({
    endpoint: ENDPOINT,
    chave: CHAVE,
    evento: { evento: 'Purchase', origem: 'tag.purchase', rotuloPt: 'x', descricao: 'x', quando: 'x', padrao: false },
  });
} catch {
  // Vazio de proposito: o que importa aqui e ter lancado, nao a mensagem.
  recusou = true;
}
ok(recusou, 'gerarScriptTag recusa gerar uma tag de Purchase');

/* ---------------- 8. Volume em disco do PageView ---------------- */

// PageView e o unico evento de trafego alto que existe aqui: o mesmo visitante
// abre 10, 20 paginas na mesma visita. Cada hit regravava o perfil inteiro, em
// DUAS chaves ('visita:' e 'fbp:'). A 5.000 pageviews/dia isso dava ~7,8 MB por
// dia num arquivo que nada podava e que a carga le inteiro para a memoria: em
// um ano o container fica sem disco e a caixa de entrada morre junto. As travas
// abaixo existem para essa conta nunca mais crescer sem teto.

const VISITA_REPETIDA = 'visita-repetida-bbbb2222';
const FBP_REPETIDO = 'fb.1.1788449825431.1122334455';
const hitDaTag = {
  visitId: VISITA_REPETIDA,
  fbp: FBP_REPETIDO,
  fbc: 'fb.1.1788449825431.PAcGRvREPETIDO',
  ip: '187.10.20.40',
  userAgent: 'Mozilla/5.0 (iPhone)',
  sourceUrl: 'https://codigovencedor.com.br/oferta?utm_source=facebook',
};

marca = totalLinhas();
await guardarPerfil({ ...hitDaTag });
const primeiroHit = chavesDesde(marca).length;
ok(primeiroHit === 2, 'o primeiro hit grava as duas chaves da visita', `${primeiroHit} linhas`);

marca = totalLinhas();
for (let i = 0; i < 20; i++) await guardarPerfil({ ...hitDaTag });
const repeticoes = chavesDesde(marca).length;
ok(
  repeticoes === 0,
  '20 pageviews iguais da mesma visita NAO reescrevem o perfil',
  `${repeticoes} linhas`
);

// O atalho nao pode virar cegueira. Se o visitante clica de novo no anuncio e
// ganha um fbc melhor, esse fbc precisa chegar ao Purchase que vem depois.
marca = totalLinhas();
await guardarPerfil({ ...hitDaTag, fbc: 'fb.1.1788449999999.PAcGRvNOVOCLIQUE' });
ok(chavesDesde(marca).length > 0, 'um fbc novo na mesma visita AINDA grava');

const comFbcNovo = await enriquecer({ visitId: VISITA_REPETIDA });
ok(
  comFbcNovo.campos.fbc === 'fb.1.1788449999999.PAcGRvNOVOCLIQUE',
  'e o fbc novo e o que a venda vai herdar',
  String(comFbcNovo.campos.fbc)
);

// Compactacao. O jsonl e append-only, entao ele acumula versoes velhas mesmo
// com o atalho acima. Na carga, so a ultima linha viva de cada chave fica.
const linhaPerfil = (chave, dados, em) => JSON.stringify({ chave, em, dados }) + '\n';
const agoraIso = new Date().toISOString();
let lixo = '';
for (let i = 0; i < 600; i++) {
  lixo += linhaPerfil('visita:visita-lixo-cccc3333', { ip: `187.10.20.${i % 250}` }, agoraIso);
}
fs.appendFileSync(ARQ_PERFIS, lixo, 'utf8');
const antesDaCompactacao = totalLinhas();

_limparCache();
await enriquecer({ visitId: 'forca-a-carga-dddd4444' });
const depoisDaCompactacao = totalLinhas();
ok(
  depoisDaCompactacao < antesDaCompactacao / 10,
  'a carga compacta o jsonl em vez de deixar crescer sem fim',
  `${antesDaCompactacao} -> ${depoisDaCompactacao} linhas`
);

const sobreviveu = await enriquecer({ visitId: VISITA_REPETIDA });
ok(
  sobreviveu.campos.fbc === 'fb.1.1788449999999.PAcGRvNOVOCLIQUE',
  'e a compactacao preserva o perfil vivo',
  String(sobreviveu.campos.fbc)
);

// Validade curta da chave anonima. A juncao tag->venda acontece em minutos ou
// horas, e passados 7 dias a propria janela de event_time da Meta ja fechou. A
// chave de PESSOA continua valendo 30 dias: o precheckout de um comprador pode
// preceder a compra em semanas.
const diasAtras = (d) => new Date(Date.now() - d * 24 * 3600 * 1000).toISOString();
fs.appendFileSync(
  ARQ_PERFIS,
  linhaPerfil('visita:visita-velha-eeee5555', { fbc: 'fb.1.1.VELHO' }, diasAtras(10)) +
    linhaPerfil('email:antigo@exemplo.com', { fbc: 'fb.1.1.PESSOA' }, diasAtras(10)),
  'utf8'
);
_limparCache();

const anonimaVelha = await enriquecer({ visitId: 'visita-velha-eeee5555' });
ok(!anonimaVelha.campos.fbc, 'visita de 10 dias atras nao enriquece mais', 'anonima vale 7 dias');

const pessoaVelha = await enriquecer({ email: 'antigo@exemplo.com' });
ok(
  pessoaVelha.campos.fbc === 'fb.1.1.PESSOA',
  'mas o perfil por e-mail de 10 dias atras AINDA enriquece',
  'pessoa vale 30 dias'
);


/* ---------------- 9. A chave de tag nao atravessa empresa --------------- */

// A lista branca de Origin do passo 1 do coletor nao consegue, sozinha, separar
// cliente de cliente: o OPTIONS chega sem corpo, logo sem chave, logo sem
// empresa — ela so pode responder "ALGUMA empresa conhece esta origem". Quem
// separa de verdade e o passo 4b, ja com a chave em maos: o dominio precisa
// estar na lista DA EMPRESA DONA DAQUELA CHAVE.
//
// Sem essa segunda conferencia, quem copiasse do HTML do cliente B a chave dele
// (que e publica, e para ser) coletaria a partir do site do cliente A: os
// PageView de A cairiam no pixel de B, e a campanha de B otimizaria para um
// publico que nunca viu a oferta de B.

fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
process.env.PUBLIC_BASE_URL = BASE;

// tag-handler.ts arrasta auto-dispatch -> meta-capi -> meta-events ->
// lucide-react, e o lucide chama react.createContext no topo. Sob
// --conditions=react-server (que e como npm run test:tag roda) o 'react'
// resolve para a entrada de servidor, que nao tem createContext, e o import
// morre antes da primeira assercao. Tirar a condicao SO para o especificador
// 'react' devolve a entrada normal do pacote. Vale so no teste: o build de
// producao nunca passa por aqui.
registerHooks({
  resolve(especificador, contexto, seguinte) {
    if (especificador === 'react' || especificador.startsWith('react/')) {
      return seguinte(especificador, {
        ...contexto,
        conditions: (contexto.conditions ?? []).filter((c) => c !== 'react-server'),
      });
    }
    return seguinte(especificador, contexto);
  },
});

const { processarTag, resolverOrigemTag } = await import(
  new URL('../src/lib/tag-handler.ts', import.meta.url).href
);
const cfgStore = await import(new URL('../src/lib/config-store.ts', import.meta.url).href);
const registro = await import(new URL('../src/lib/empresas.ts', import.meta.url).href);

const HOST_A = 'cliente-a.com.br';
const HOST_B = 'cliente-b.com.br';
const dominioTag = (id, host) => ({
  id,
  host,
  subdominio: '',
  criadoEm: '2026-09-13T00:00:00.000Z',
  hits: 0,
});

// A empresa A e a padrao: ela mora no config/integracoes.json de sempre.
const cfgA = await cfgStore.atualizarIntegracoes((a) => {
  a.tag.dominios = [dominioTag('d-a', HOST_A)];
});
await registro.salvarEmpresa({ id: 'emp_b', nome: 'Cliente B' });
await cfgStore.criarIntegracoesDaEmpresa({ id: 'emp_b', slug: 'cliente-b' });
const cfgB = await cfgStore.atualizarIntegracoes((b) => {
  b.tag.dominios = [dominioTag('d-b', HOST_B)];
}, 'emp_b');

ok(cfgA.tag.chave !== cfgB.tag.chave, 'cada empresa nasce com a sua propria chave de tag');

const hitDe = (origem, chave, visita) =>
  new Request(BASE + '/api/tag/coletar', {
    method: 'POST',
    headers: {
      origin: origem,
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Linux; Android 16)',
      'x-forwarded-for': '187.10.20.60',
    },
    body: JSON.stringify({ k: chave, e: 'tag.pageview', vi: visita, u: origem + '/oferta' }),
  });

// O preflight aceita o site de A — e o que prova que o 403 logo abaixo veio da
// conferencia POR EMPRESA, e nao da lista branca de Origin do passo 1.
ok(
  (await resolverOrigemTag(hitDe('https://' + HOST_A, cfgB.tag.chave, 'x'))) === 'https://' + HOST_A,
  'o preflight aceita o site do cliente A (ele esta cadastrado em ALGUMA empresa)'
);

const cruzado = await processarTag(hitDe('https://' + HOST_A, cfgB.tag.chave, 'visita-cruzada-0001'));
ok(
  cruzado.status === 403,
  '🔴 chave de tag do cliente B usada no site do cliente A -> 403',
  String(cruzado.status)
);

// Controle: a MESMA chave de B, numa origem que a lista de B aceita, coleta. Sem
// isto o 403 acima poderia ser so uma chave quebrada, e nao a trava por empresa.
const deB = await processarTag(hitDe('http://localhost:3333', cfgB.tag.chave, 'visita-do-b-0002'));
ok(deB.status !== 403, 'a mesma chave de B coleta numa origem que a empresa B aceita', String(deB.status));

// E chave que nenhuma empresa cadastrou para de vez, com o 401 do coletor — que
// e uma resposta diferente do 403 acima de proposito: uma diz "chave nao existe",
// a outra diz "chave existe, mas nao neste dominio".
const semDono = await processarTag(hitDe('https://' + HOST_A, 'cvt_chaveQueNinguemCadastrou', 'v3'));
ok(semDono.status === 401, 'chave de tag sem dono -> 401, nao 403', String(semDono.status));


process.chdir(raiz);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Tag trancada: origem, evento, juncao anonima, script e a chave que nao atravessa empresa.\n'
    : `\n  ${falhas} falha(s).\n`
);
process.exit(falhas === 0 ? 0 : 1);
