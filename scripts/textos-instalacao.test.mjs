#!/usr/bin/env node
/**
 * Textos da tag do site sem promessa de cookie (F5, só o texto) — tarefa C13
 * do plano de correções do pacote 16.
 *
 * O defeito: a aba "Tag do site" prometia um cookie de primeira parte que
 * "sobrevive ao Safari" e que "dura muito mais" com o subdomínio do cliente.
 * Não é o que acontece hoje: o cookie é gravado pelo JavaScript da tag
 * (`document.cookie`, em `src/lib/tag-script.ts`), e nem o coletor nem a tag
 * mandam `Set-Cookie`. Um cookie gravado pelo servidor depende do certificado
 * do domínio do cliente, que ainda está em preparação. O código disso fica
 * para o trabalho do domínio do cliente (D1); aqui entra só o texto.
 *
 * O que este arquivo prova, lendo o fonte (o projeto não tem jsdom nem
 * testing-library, e dependência nova está fora do pacote — decisão P8 do
 * plano):
 *
 *   A  `TagDoSite.tsx` não tem mais "sobrevive ao Safari", não cita o Safari
 *      e não promete que o cookie "dura mais"
 *   B  o item da lista de domínios com subdomínio mostra o texto do plano; o
 *      item sem subdomínio segue igual
 *   C  o aviso "Antes de gerar a tag" não recomenda o subdomínio pelo cookie,
 *      não fala de cookie e não manda cadastrar o subdomínio só com o CNAME
 *   D  o campo "Subdomínio" mora na aba Domínio e a ajuda dele não fala de
 *      cookie
 *   E  o registro de DNS mora na aba Domínio, que não fala de cookie
 *   F  nenhuma tela (`.tsx` em `src/`) repete a promessa
 *
 * C, D e E foram revistas na V8 do plano v7 (Aba Domínio honesta): o bloco do
 * subdomínio (campo, aviso do CNAME e painel de DNS) saiu de `TagDoSite.tsx`
 * para `src/components/dominio/`. A revisão da C13 (R1 e R3) previu esta
 * mudança. O que as três provam continua o mesmo: nenhuma promessa de cookie.
 *
 * 🔴 Nenhuma rede e nenhum disco além da leitura dos fontes: este teste não
 * importa nada de `src/`, não chama `fetch` e não abre `config/` nem `logs/`.
 * Mesmo assim o `fetch` global é trocado por um que LANÇA — em especial para
 * graph.facebook.com e api.cloudflare.com —, para que um descuido futuro
 * falhe alto em vez de sair para a rede. Roda sem ACCESS_TOKEN.
 *
 * Uso: npm run test:textos-instalacao
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------------- 0. Rede trancada ---------------- */

const fetchFalso = async (entrada) => {
  const url = typeof entrada === 'string' ? entrada : String(entrada?.url ?? entrada);
  throw new Error(`teste estático não chama rede (tentou ${url.slice(0, 80)})`);
};
globalThis.fetch = fetchFalso;
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

const ler = (relativo) => fs.readFileSync(new URL(relativo, import.meta.url), 'utf8');

/** O texto do JSX quebra linha no meio da frase; na tela vira um espaço só. */
const junto = (s) => s.replace(/\s+/g, ' ');

/** Mostra um trecho curto do que a busca achou (ou não achou). */
const trecho = (s, n = 110) => (s ? `«${junto(s).trim().slice(0, n)}${junto(s).trim().length > n ? '…' : ''}»` : '(nada)');

const PROMESSA_SAFARI = /sobrevive ao Safari/i;
const PROMESSA_DURACAO = /cookie\s+(?:dura|durar|durando)\s+(?:muito\s+)?mais/i;

const fonte = ler('../src/components/integrations/TagDoSite.tsx');
const tela = junto(fonte);

/* ---------------- A. A promessa some do arquivo ---------------- */

console.log('\n  A. TagDoSite.tsx sem a promessa de cookie');

ok(!PROMESSA_SAFARI.test(tela), '🔴 TagDoSite.tsx não contém "sobrevive ao Safari"', trecho(tela.match(/.{0,60}sobrevive ao Safari.{0,10}/i)?.[0]));
ok(!/Safari/i.test(tela), 'TagDoSite.tsx não cita o Safari em lugar nenhum', trecho(tela.match(/.{0,70}Safari.{0,10}/i)?.[0]));
ok(!PROMESSA_DURACAO.test(tela), '🔴 TagDoSite.tsx não promete que o cookie "dura mais"', trecho(tela.match(/.{0,50}cookie\s+dura.{0,30}/i)?.[0]));

/* ---------------- B. Item da lista de domínios ---------------- */

console.log('\n  B. Item da lista de domínios diz o que a tag faz hoje');

const TEXTO_SUBDOMINIO =
  'subdomínio do cliente — a tag é chamada pelo domínio dele. O cookie de primeira parte gravado pelo servidor ainda depende do certificado, que está em preparação.';
const TEXTO_NOSSO = 'nosso endereço — funciona, mas ainda como terceiro.';

const ternario = tela.match(/\{\s*d\.subdominio\s*\?\s*'([^']*)'\s*:\s*'([^']*)'\s*\}/);
ok(Boolean(ternario), 'o item escolhe o texto por d.subdominio (dois ramos)');
ok(ternario?.[1] === TEXTO_SUBDOMINIO, '🔴 com subdomínio: texto do plano, sem promessa', trecho(ternario?.[1], 160));
ok(ternario?.[2] === TEXTO_NOSSO, 'sem subdomínio: texto de antes, intocado', trecho(ternario?.[2]));

/* ---------------- C. Aviso "Antes de gerar a tag" ---------------- */

console.log('\n  C. Aviso "Antes de gerar a tag" sem cookie e sem o conselho do CNAME');

const iAviso = tela.indexOf('title="Antes de gerar a tag');
const fimAviso = iAviso === -1 ? -1 : tela.indexOf('</Callout>', iAviso);
const aviso = iAviso === -1 || fimAviso === -1 ? '' : tela.slice(iAviso, fimAviso);
ok(Boolean(aviso), 'o aviso "Antes de gerar a tag" existe');
ok(!/recomendado:\s*faz o cookie/i.test(aviso), '🔴 não recomenda o subdomínio pelo cookie', trecho(aviso.match(/\(recomendado[^)]*\)/i)?.[0]));
ok(!/cookie/i.test(aviso), '🔴 o aviso não fala de cookie (o subdomínio mora na aba Domínio desde a V8)', trecho(aviso.match(/.{0,60}cookie.{0,40}/i)?.[0]));
ok(
  !/Só cadastre o subdomínio depois que o CNAME existir/.test(aviso) && !/o código gerado já chama o subdomínio/.test(aviso),
  '🔴 o aviso não manda cadastrar o subdomínio só com o CNAME (R1 da revisão da C13): a tag espera o endereço próprio responder'
);
ok(/Cadastre o domínio do site do cliente/.test(aviso), 'o passo que ficou continua no aviso: cadastrar o site do cliente');

/* ---------------- D. Campo "Subdomínio" (aba Domínio) ---------------- */

console.log('\n  D. Campo "Subdomínio" na aba Domínio, com ajuda sem cookie');

const modalDominio = junto(ler('../src/components/dominio/ModalAdicionarDominio.tsx'));
const textosDominio = junto(ler('../src/components/dominio/mensagens-dominio.ts'));
ok(!/tag-subdominio-novo/.test(tela), 'o campo "Subdomínio" saiu de TagDoSite.tsx (V8)');
const campoSub = modalDominio.match(/label="Subdomínio"\s+helper=\{(\w+)\}/);
ok(campoSub?.[1] === 'DICA_DO_SUBDOMINIO', 'na aba Domínio, a ajuda do campo "Subdomínio" é DICA_DO_SUBDOMINIO', trecho(campoSub?.[0]));
const ajuda = textosDominio.match(/DICA_DO_SUBDOMINIO\s*=\s*'([^']*)'/)?.[1] ?? '';
ok(Boolean(ajuda), 'a ajuda do campo existe em mensagens-dominio.ts');
ok(!/cookie/i.test(ajuda), '🔴 a ajuda do campo não fala de cookie', trecho(ajuda, 160));
ok(!/cookie/i.test(modalDominio), '🔴 o modal da aba Domínio não fala de cookie', trecho(modalDominio.match(/.{0,60}cookie.{0,40}/i)?.[0]));

/* ---------------- E. Registro de DNS (aba Domínio) ---------------- */

console.log('\n  E. Registro de DNS na aba Domínio, sem cookie');

const cartaoDominio = junto(ler('../src/components/dominio/CartaoDeDominio.tsx'));
const abaDominio = junto(ler('../src/components/dominio/AbaDominio.tsx'));
ok(!tela.includes('Registro de DNS para o cliente criar'), 'o painel de DNS saiu de TagDoSite.tsx (V8)');
ok(/registroDnsDe\(/.test(cartaoDominio), 'o registro de DNS aparece no cartão da aba Domínio (registroDnsDe)');
ok(
  !/cookie/i.test(cartaoDominio) && !/cookie/i.test(abaDominio) && !/cookie/i.test(textosDominio),
  '🔴 a aba Domínio (cartão, aba e textos) não fala de cookie'
);
ok(/A tag usa o nosso endereço e continua coletando/.test(textosDominio), 'segue dizendo que, sem subdomínio, a tag usa o nosso endereço e coleta');

/* ---------------- F. Nenhuma tela repete a promessa ---------------- */

console.log('\n  F. Nenhuma tela (.tsx em src/) repete a promessa');

const raizSrc = fileURLToPath(new URL('../src/', import.meta.url));
const telas = [];
const andar = (pasta) => {
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) andar(caminho);
    else if (item.name.endsWith('.tsx')) telas.push(caminho);
  }
};
andar(raizSrc);
ok(telas.length > 20, 'achou as telas de src/', `${telas.length} arquivos .tsx`);
const comPromessa = telas
  .filter((f) => {
    const t = junto(fs.readFileSync(f, 'utf8'));
    return PROMESSA_SAFARI.test(t) || PROMESSA_DURACAO.test(t);
  })
  .map((f) => path.relative(raizSrc, f).replace(/\\/g, '/'));
ok(comPromessa.length === 0, '🔴 nenhuma tela promete cookie que "sobrevive ao Safari" ou "dura mais"', comPromessa.join(', '));

/* ---------------- Fim ---------------- */

if (globalThis.fetch !== fetchFalso) {
  console.log('  FALHA  alguém trocou o fetch falso no meio do teste');
  falhas++;
}

console.log(
  falhas === 0
    ? '\n  Textos da tag do site: nenhuma promessa de cookie; o que depende do certificado está dito como pendente.'
    : `\n  ${falhas} falha(s).`
);
process.exit(falhas === 0 ? 0 : 1);
