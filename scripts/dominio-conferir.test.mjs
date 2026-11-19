#!/usr/bin/env node
/**
 * Aba Domínio, botão "Conferir de novo" — tarefa T-M13.
 *
 * O que este arquivo prova:
 *
 *   A  `enderecoProprioPronto(host, buscar, { conferirAgora: true })` mede de
 *      novo mesmo com resposta guardada, mas nunca duas vezes em menos de 10 s;
 *      sem a opção, valem os 60 s / 5 min de sempre
 *   B  os textos do botão e dos três avisos
 *   C  (dinâmico) a rota `GET /api/tag/gerar` de verdade com `&conferir=1`: mede
 *      de novo, devolve os mesmos quatro campos, continua 401 sem sessão, e só
 *      o valor `1` liga a conferência
 *   D  (estático) a rota só tem GET; o cartão tem o botão no bloco aguardando;
 *      a aba passa as duas props; `useEnderecosProntos` continua existindo
 *
 * Nenhuma rede de verdade. O `fetch` global é trocado por um espião ANTES de
 * qualquer import de src/: ele LANÇA para qualquer endereço e só responde,
 * quando o cenário pede, ao `https://m.exemplo.com.br/api/health` inventado
 * deste teste. Sem ACCESS_TOKEN e sem PIXEL_ID. O processo roda numa pasta
 * temporária: o `config/` criado é o de lá, nunca o real.
 *
 * O relógio é adiantado à mão (`avancar`), cerca de 94 s no total: o teste não
 * espera tempo de verdade.
 *
 * Uso: npm run test:dominio-conferir
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

const HEALTH_DO_TESTE = 'https://m.exemplo.com.br/api/health';
/** null: a sonda da rota falha (DNS/TLS); objeto: a sonda recebe este corpo com 200. */
let respostaDaSonda = null;
const chamadasGlobais = [];
const fetchEspiao = async (entrada) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  chamadasGlobais.push(url);
  if (/graph\.facebook\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Meta');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Cloudflare');
  if (url === HEALTH_DO_TESTE && respostaDaSonda) {
    return new Response(JSON.stringify(respostaDaSonda), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error(`rede bloqueada pelo teste: ${url}`);
};
globalThis.fetch = fetchEspiao;
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

/* Credenciais de teste ANTES de carregar sessao.ts, que lê o ambiente no import. */
process.env.CONSOLE_USER = 'admin';
process.env.CONSOLE_PASSWORD = 'senha-de-teste-com-mais-de-12-caracteres';
process.env.SESSION_SECRET = 'segredo-de-sessao-so-do-teste-com-mais-de-32-caracteres';
const BASE = 'https://capi.proxserverabner.site';
process.env.PUBLIC_BASE_URL = BASE;

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'dominio-conferir-'));
fs.mkdirSync(path.join(PASTA, 'config'), { recursive: true });
fs.mkdirSync(path.join(PASTA, 'logs'), { recursive: true });
// config-store.ts resolve os caminhos no import: a pasta muda ANTES dele.
process.chdir(PASTA);

/* O relógio do teste: só anda para a frente, e só quando o cenário manda. */
const agoraDeVerdade = Date.now.bind(Date);
let adiantado = 0;
Date.now = () => agoraDeVerdade() + adiantado;
const avancar = (ms) => {
  adiantado += ms;
};

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
const fonte = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const ocorrencias = (texto, trecho) => texto.split(trecho).length - 1;

const src = (rel) => new URL(`../src/${rel}`, import.meta.url).href;

const { ROTULO_CONFERIR, ROTULO_CONFERINDO, avisoDaConferencia } = await import(
  src('components/dominio/mensagens-dominio.ts')
);
const { enderecoProprioPronto, limparCacheDoEndereco } = await import(src('lib/endereco-da-tag.ts'));

/* ---------------- A. O cache com conferirAgora ---------------- */

console.log('\n  A. enderecoProprioPronto com conferirAgora');

const HOST = 'm.exemplo.com.br';
let prontoA = false;
const chamadasA = [];
const buscarA = async (url) => {
  chamadasA.push(url);
  return prontoA
    ? new Response(JSON.stringify({ ok: true, servico: 'capi-console' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    : new Response('não achei', { status: 404 });
};
const CONFERIR = { conferirAgora: true };

limparCacheDoEndereco();
const a1 = await enderecoProprioPronto(HOST, buscarA);
ok(a1 === false && chamadasA.length === 1, '(A) 1ª pergunta, sem resposta do console → false, uma chamada', mostra([a1, chamadasA.length]));
ok(chamadasA[0] === HEALTH_DO_TESTE, '(A) a chamada vai a https://m.exemplo.com.br/api/health', mostra(chamadasA[0]));

const a2 = await enderecoProprioPronto(HOST, buscarA);
ok(a2 === false && chamadasA.length === 1, '(A) 2ª pergunta sem a opção → vem do guardado', mostra([a2, chamadasA.length]));

avancar(5_000);
prontoA = true;
const a3 = await enderecoProprioPronto(HOST, buscarA, CONFERIR);
ok(a3 === false && chamadasA.length === 1, '(A) conferir 5 s depois da última medição → NÃO mede de novo (piso de 10 s)', mostra([a3, chamadasA.length]));

avancar(6_000);
const a4 = await enderecoProprioPronto(HOST, buscarA);
ok(a4 === false && chamadasA.length === 1, '(A) 11 s depois, sem a opção → os 60 s ainda valem', mostra([a4, chamadasA.length]));

const a5 = await enderecoProprioPronto(HOST, buscarA, CONFERIR);
ok(a5 === true && chamadasA.length === 2, '(A) 11 s depois, conferir → mede de novo e vê o endereço pronto', mostra([a5, chamadasA.length]));

const a6 = await enderecoProprioPronto(HOST, buscarA, CONFERIR);
ok(a6 === true && chamadasA.length === 2, '(A) conferir de novo em seguida → não bate duas vezes no site do cliente', mostra([a6, chamadasA.length]));

const a7 = await enderecoProprioPronto(HOST, buscarA);
ok(a7 === true && chamadasA.length === 2, '(A) sem a opção, logo depois → o pronto novo já está guardado', mostra([a7, chamadasA.length]));

avancar(61_000);
const a8 = await enderecoProprioPronto(HOST, buscarA);
ok(a8 === true && chamadasA.length === 2, '(A) 61 s depois, sem a opção → pronto continua valendo por 5 min', mostra([a8, chamadasA.length]));

const a9 = await enderecoProprioPronto(HOST, buscarA, CONFERIR);
ok(a9 === true && chamadasA.length === 3, '(A) 61 s depois, conferir → mede de novo', mostra([a9, chamadasA.length]));

for (const torto of ['', 'evil.com/x']) {
  const r = await enderecoProprioPronto(torto, buscarA, CONFERIR);
  ok(r === false && chamadasA.length === 3, `(A) host torto ${mostra(torto)} com conferir → false e nenhuma chamada`, mostra([r, chamadasA.length]));
}

limparCacheDoEndereco();
let lancou = false;
let a10 = null;
try {
  a10 = await enderecoProprioPronto(
    HOST,
    async () => {
      throw new Error('DNS não achou');
    },
    CONFERIR
  );
} catch {
  lancou = true;
}
ok(a10 === false && !lancou, '(A) conferir com a rede caindo → false, sem exceção', mostra([a10, lancou]));

/* ---------------- B. Os textos ---------------- */

console.log('\n  B. Textos do botão e dos avisos');

ok(ROTULO_CONFERIR === 'Conferir de novo', '(B) o botão diz "Conferir de novo"', mostra(ROTULO_CONFERIR));
ok(ROTULO_CONFERINDO === 'Conferindo…', '(B) enquanto confere diz "Conferindo…"', mostra(ROTULO_CONFERINDO));

const avisoPronto = avisoDaConferencia('pronto', HOST);
ok(
  avisoPronto.titulo === 'm.exemplo.com.br já responde.' &&
    avisoPronto.proximoPasso === 'Copie a tag de novo em Instalação.',
  '(B) pronto: o título e o próximo passo',
  mostra(avisoPronto)
);
const avisoAguardando = avisoDaConferencia('aguardando', HOST);
ok(
  avisoAguardando.titulo === 'm.exemplo.com.br ainda não responde.' &&
    avisoAguardando.proximoPasso === 'Confira o registro com o cliente e tente de novo em alguns minutos.',
  '(B) aguardando: o título e o próximo passo',
  mostra(avisoAguardando)
);
const avisoFalhou = avisoDaConferencia('falhou', HOST);
ok(
  avisoFalhou.titulo === 'Não deu para conferir agora.' &&
    avisoFalhou.proximoPasso === 'Tente de novo em instantes.',
  '(B) falhou: o título e o próximo passo',
  mostra(avisoFalhou)
);
const todosOsTextos = [
  ROTULO_CONFERIR,
  ROTULO_CONFERINDO,
  ...[avisoPronto, avisoAguardando, avisoFalhou].flatMap((a) => [a.titulo, a.proximoPasso]),
].join(' | ');
ok(!/cookie|conectad|Verificar agora/i.test(todosOsTextos), '(B) nenhum texto novo usa palavra proibida na aba Domínio', todosOsTextos);

/* ---------------- C. A rota de verdade ---------------- */

console.log('\n  C. GET /api/tag/gerar com &conferir=1');

const ARQ = path.join(PASTA, 'config', 'integracoes.json');
fs.writeFileSync(
  ARQ,
  JSON.stringify(
    {
      entrada: { segredo: 'segredo-de-entrada-so-do-teste', modo: 'fila', rotulo: 'teste' },
      regras: [],
      saida: [],
      tag: {
        chave: 'cvt_chave_so_do_teste',
        dominios: [
          { id: 'd1', host: 'exemplo.com.br', subdominio: 'm', criadoEm: '2026-09-25T00:00:00.000Z', hits: 0 },
          { id: 'd2', host: 'outro.com.br', criadoEm: '2026-09-25T00:00:00.000Z', hits: 0 },
        ],
      },
    },
    null,
    2
  ),
  'utf8'
);

const { NextRequest } = await import('next/server.js');
const { assinarSessao, COOKIE_SESSAO } = await import(src('lib/sessao.ts'));
const rotaGerar = await import(src('app/api/tag/gerar/route.ts'));
const COOKIE = `${COOKIE_SESSAO}=${assinarSessao('admin', 12)}`;
/** `query` é a query inteira, com o `?` (ex.: '?dominio=d1&conferir=1'). */
const pedirGerar = async (query) => {
  const res = await rotaGerar.GET(
    new NextRequest(`http://localhost:3333/api/tag/gerar${query}`, {
      headers: { cookie: COOKIE },
    })
  );
  let corpo = null;
  try {
    corpo = await res.json();
  } catch {
    corpo = null;
  }
  return { status: res.status, corpo };
};
const sondasDaRota = () => chamadasGlobais.filter((u) => u === HEALTH_DO_TESTE).length;
const PRONTO = { ok: true, servico: 'capi-console', versao: 'teste' };

limparCacheDoEndereco();
respostaDaSonda = null;
const c1 = await pedirGerar('?dominio=d1');
ok(c1.status === 200 && c1.corpo?.enderecoProprioPronto === false, '(C) ao abrir a aba, endereço que não responde → false', mostra([c1.status, c1.corpo?.enderecoProprioPronto]));
ok(sondasDaRota() === 1, '(C) a rota perguntou uma vez', `(${sondasDaRota()})`);

// O cliente criou o registro: a partir daqui o endereço responde pelo console.
respostaDaSonda = PRONTO;
const c2 = await pedirGerar('?dominio=d1');
ok(c2.corpo?.enderecoProprioPronto === false && sondasDaRota() === 1, '(C) sem conferir=1, a resposta guardada (60 s) ainda vale → false, sem nova pergunta', mostra([c2.corpo?.enderecoProprioPronto, sondasDaRota()]));

const c2b = await pedirGerar('?dominio=d1&conferir=1');
ok(c2b.corpo?.enderecoProprioPronto === false && sondasDaRota() === 1, '(C) conferir=1 menos de 10 s depois da medição → não mede de novo', mostra([c2b.corpo?.enderecoProprioPronto, sondasDaRota()]));

avancar(11_000);
const c3 = await pedirGerar('?dominio=d1&conferir=1');
ok(c3.status === 200 && c3.corpo?.enderecoProprioPronto === true, '(C) conferir=1 depois de 11 s → mede de novo e diz true', mostra([c3.status, c3.corpo?.enderecoProprioPronto]));
ok(sondasDaRota() === 2, '(C) a rota perguntou de novo, uma vez', `(${sondasDaRota()})`);
ok(c3.corpo?.endpoint === 'https://m.exemplo.com.br/api/tag/coletar', '(C) com o endereço pronto a tag passa a chamar o subdomínio', mostra(c3.corpo?.endpoint));
ok(
  Object.keys(c3.corpo ?? {}).sort().join(',') === 'dominioId,enderecoProprioPronto,endpoint,tags',
  '(C) a resposta tem os mesmos quatro campos de sempre',
  mostra(Object.keys(c3.corpo ?? {}).sort())
);

const c4 = await pedirGerar('?dominio=d1&conferir=1');
ok(c4.corpo?.enderecoProprioPronto === true && sondasDaRota() === 2, '(C) clique repetido em seguida → mesma resposta, sem nova pergunta', mostra([c4.corpo?.enderecoProprioPronto, sondasDaRota()]));

const c5 = await pedirGerar('?dominio=d2&conferir=1');
ok(
  c5.corpo?.enderecoProprioPronto === false && c5.corpo?.endpoint === `${BASE}/api/tag/coletar` && sondasDaRota() === 2,
  '(C) site sem subdomínio com conferir=1 → nosso coletor, false, e a rota nem pergunta',
  mostra([c5.corpo?.enderecoProprioPronto, c5.corpo?.endpoint, sondasDaRota()])
);

const c6 = await rotaGerar.GET(new NextRequest('http://localhost:3333/api/tag/gerar?dominio=d1&conferir=1'));
ok(c6.status === 401, '(C) sem sessão, com conferir=1 → continua 401', mostra(c6.status));

limparCacheDoEndereco();
respostaDaSonda = null;
const c7 = await pedirGerar('?dominio=d1');
ok(c7.corpo?.enderecoProprioPronto === false && sondasDaRota() === 3, '(C) cache limpo, endereço fora do ar → false, uma pergunta', mostra([c7.corpo?.enderecoProprioPronto, sondasDaRota()]));
respostaDaSonda = PRONTO;
avancar(11_000);
const c8 = await pedirGerar('?dominio=d1&conferir=sim');
ok(c8.corpo?.enderecoProprioPronto === false && sondasDaRota() === 3, '(C) só conferir=1 liga a conferência: conferir=sim usa o guardado', mostra([c8.corpo?.enderecoProprioPronto, sondasDaRota()]));
respostaDaSonda = null;

/* ---------------- D. A fonte ---------------- */

console.log('\n  D. Fonte: rota, lib, aba e cartão');

const rota = fonte('src/app/api/tag/gerar/route.ts');
ok(rota.includes("searchParams.get('conferir') === '1'"), "(D) a rota lê conferir === '1'");
ok(rota.includes('{ conferirAgora }'), '(D) a rota passa { conferirAgora } para a sonda');
ok(
  /\bexport\s+async\s+function\s+GET\b/.test(rota) &&
    !/export\s+(async\s+)?function\s+(POST|PUT|DELETE|PATCH)\b/.test(rota),
  '(D) a rota continua só com GET'
);

const lib = fonte('src/lib/endereco-da-tag.ts');
ok(ocorrencias(lib, 'buscar(') === 1, '(D) a lib continua com uma chamada de rede só', `(${ocorrencias(lib, 'buscar(')})`);
ok(lib.includes('INTERVALO_MINIMO_MS = 10 * 1000'), '(D) o piso entre duas medições é de 10 s');

const aba = fonte('src/components/dominio/AbaDominio.tsx');
ok(aba.includes("'&conferir=1'"), '(D) a aba pede a conferência com &conferir=1');
ok(aba.includes('export function useEnderecosProntos('), '(D) useEnderecosProntos continua exportado (a TagDoSite usa)');
ok(aba.includes('export function useConferenciaDosEnderecos('), '(D) o hook novo existe');
ok(aba.includes('conferindo={conferindo(d)}'), '(D) a aba passa conferindo ao cartão');
ok(aba.includes('onConferir={() => void conferirSite(d)}'), '(D) a aba passa onConferir ao cartão');
ok(aba.includes('toast.info('), '(D) "ainda não responde" sai como aviso neutro');
ok(/'X-Empresa-Id':\s*empresaId/.test(aba), '(D) a leitura continua mandando X-Empresa-Id');

const cartao = fonte('src/components/dominio/CartaoDeDominio.tsx');
ok(
  /<Button\s+size="sm"\s+variant="outline"\s+onClick=\{onConferir\}\s+disabled=\{conferindo \|\| medindo\}/.test(cartao),
  '(D) o botão é outline, chama onConferir e fica desabilitado enquanto confere ou mede'
);
ok(cartao.includes('ROTULO_CONFERIR') && cartao.includes('ROTULO_CONFERINDO'), '(D) o cartão usa os dois rótulos de mensagens-dominio');
ok(cartao.includes('<Spinner'), '(D) o giro é o Spinner do produto');
ok(!cartao.includes('animate-spin'), '(D) nada de animate-spin escrito à mão no cartão');
ok(ocorrencias(cartao, 'onClick={onConferir}') === 1, '(D) o botão aparece uma vez só', `(${ocorrencias(cartao, 'onClick={onConferir}')})`);
const iAguardando = cartao.indexOf('Aguardando: a frase, a mensagem e o registro');
const iBotao = cartao.indexOf('onClick={onConferir}');
const iRegistro = cartao.indexOf('O registro: divisória');
ok(
  iAguardando > -1 && iBotao > iAguardando && iRegistro > iBotao,
  '(D) o botão fica no bloco aguardando, junto de "Copiar mensagem"',
  mostra([iAguardando, iBotao, iRegistro])
);
ok(!/Verificar agora/i.test(cartao), '(D) o cartão não diz "Verificar agora"');

const tagDoSite = fonte('src/components/integrations/TagDoSite.tsx');
ok(tagDoSite.includes('useEnderecosProntos(dominios)'), '(D) a TagDoSite continua chamando useEnderecosProntos(dominios)');

/* ---------------- Fim ---------------- */

const foraDoTeste = chamadasGlobais.filter((u) => u !== HEALTH_DO_TESTE);
ok(foraDoTeste.length === 0, '(fim) nenhuma chamada de rede além da sonda inventada do teste', mostra(foraDoTeste));
ok(globalThis.fetch === fetchEspiao, '(fim) o fetch global continuou trancado até o fim');

Date.now = agoraDeVerdade;
process.chdir(RAIZ);
fs.rmSync(PASTA, { recursive: true, force: true });

if (falhas === 0) {
  console.log('\nDomínio, conferir de novo: tudo certo.');
} else {
  console.error(`\nDomínio, conferir de novo: ${falhas} falha(s).`);
}
process.exit(falhas === 0 ? 0 : 1);
