#!/usr/bin/env node
/**
 * O que a aba Instalação diz sobre um evento da tag sem regra (F9) e as
 * ressalvas de texto das revisões da C8, da C9 e da C12 — tarefa V6 do plano
 * v7 (§4).
 *
 * O defeito (F9, plano v6 T10 passo 3): `estadoDaRegra` dizia que o evento sem
 * regra "fica na fila". O coletor faz `modo = regra ? regra.modo : 'ignorar'`
 * (`tag-handler.ts`): sem regra o evento NÃO entra na Fila nem vai à Meta — só
 * o perfil de atribuição (fbc/fbp) é gravado antes. A tela prometia uma Fila
 * que nunca ia receber nada.
 *
 * O que este arquivo prova:
 *
 *   A  (dinâmica) `estadoDaRegra([], 'tag.pageview')` devolve a explicação
 *      exata do plano, e o `texto` não fala em fila
 *   B  (dinâmica) os outros casos mantêm o `tom` (regra de outra origem conta
 *      como sem regra; desativada e ignorar = neutro; auto = sucesso;
 *      fila = aviso)
 *   C  (dinâmica) a régua `enviadoSoEmTeste`, que troca o selo da linha na
 *      Fila: só teste → "enviado só em teste"; um aceite real → "enviado à Meta"
 *   D  (estática) ressalvas da C8/C9/C12: o aviso do Painel diz o próximo
 *      passo com o verbo do glossário; o selo da Fila usa a régua importada
 *      (não copiada); o aviso de teste interno usa `explicacaoDeTeste` com a
 *      frase antiga de reserva
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um espião ANTES de qualquer
 * import de src/: ele LANÇA para qualquer endereço, inclusive
 * graph.facebook.com e api.cloudflare.com. Sem ACCESS_TOKEN e sem PIXEL_ID.
 * Nada é gravado: o processo roda numa pasta temporária e os fontes são só
 * lidos. Nenhum módulo de `config/` ou `logs/` é carregado.
 *
 * Uso: npm run test:tag-estado
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

const chamadas = [];
const fetchEspiao = async (entrada) => {
  const url =
    typeof entrada === 'string'
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : String(entrada?.url ?? '');
  chamadas.push(url);
  if (/graph\.facebook\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Meta');
  if (/api\.cloudflare\.com/i.test(url)) throw new Error('rede bloqueada pelo teste: nada vai para a Cloudflare');
  throw new Error(`rede bloqueada pelo teste: ${url}`);
};
globalThis.fetch = fetchEspiao;
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-estado-'));
process.chdir(PASTA);

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

const { estadoDaRegra } = await import(
  new URL('../src/components/instalacao/tag-estado.ts', import.meta.url).href
);
const { enviadoSoEmTeste } = await import(new URL('../src/lib/inbox-resumo.ts', import.meta.url).href);

const regra = (eventoOrigem, modo, ativo = true) => ({
  id: `r_${eventoOrigem}_${modo}`,
  eventoOrigem,
  eventoMeta: 'PageView',
  marcas: ['pixel_a'],
  modo,
  ativo,
});

/* ---------------- A. Sem regra (F9) ---------------- */

console.log('\n  A. Evento da tag sem regra (F9)');

const EXPLICACAO_F9 =
  'Sem regra, o evento não entra na fila nem vai à Meta. O fbc e o fbp dele ajudam a venda do webhook a achar a campanha.';

const semRegra = estadoDaRegra([], 'tag.pageview');
ok(semRegra.explicacao === EXPLICACAO_F9, 'A1: a explicação é exatamente a do plano v6 T10 passo 3', mostra(semRegra.explicacao));
ok(!/fila/i.test(semRegra.texto), 'A2: o texto curto não fala em fila', mostra(semRegra.texto));
ok(semRegra.tom === 'warning', 'A3: o tom continua aviso', mostra(semRegra.tom));
ok(!/fica na fila/i.test(semRegra.explicacao), 'A4: a promessa antiga "fica na fila" sumiu');

/* ---------------- B. Os outros casos mantêm o tom ---------------- */

console.log('\n  B. Os outros casos mantêm o tom');

const deOutraOrigem = estadoDaRegra([regra('tag.lead', 'auto')], 'tag.pageview');
ok(
  deOutraOrigem.explicacao === EXPLICACAO_F9 && deOutraOrigem.tom === 'warning',
  'B1: regra de outra origem conta como sem regra',
  mostra(deOutraOrigem)
);
ok(estadoDaRegra([regra('tag.pageview', 'auto', false)], 'tag.pageview').tom === 'neutral', 'B2: regra desativada = neutro');
ok(estadoDaRegra([regra('tag.pageview', 'auto')], 'tag.pageview').tom === 'success', 'B3: regra automática = sucesso');
ok(estadoDaRegra([regra('tag.pageview', 'ignorar')], 'tag.pageview').tom === 'neutral', 'B4: regra em Ignorar = neutro');
const naFila = estadoDaRegra([regra('tag.pageview', 'fila')], 'tag.pageview');
ok(naFila.tom === 'warning' && /fila/i.test(naFila.texto), 'B5: regra em fila = aviso, e só ela fala em fila', mostra(naFila));

/* ---------------- C. A régua do selo da Fila ---------------- */

console.log('\n  C. A régua do selo "enviado só em teste"');

const aceito = (modoTeste) => ({ status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste });
ok(
  enviadoSoEmTeste({ status: 'disparado', resultados: [aceito(true), aceito(true)] }) === true,
  'C1: todos os aceites em modo teste → "enviado só em teste"'
);
ok(
  enviadoSoEmTeste({ status: 'disparado', resultados: [aceito(true), aceito(false)] }) === false,
  'C2: um aceite real → "enviado à Meta"'
);
ok(enviadoSoEmTeste({ status: 'disparado' }) === false, 'C3: item antigo, sem resultados, segue como envio real');

/* ---------------- D. Ressalvas de texto (C8, C9, C12) ---------------- */

console.log('\n  D. Ressalvas de texto das revisões');

const painel = fonte('src/components/painel/PainelDeEventos.tsx');
ok(
  painel.includes('Os que já saíram em teste podem ir de verdade') && painel.includes('use Enviar agora na Fila'),
  'D1: o aviso de modo teste do Painel diz o próximo passo'
);
ok(!/Disparar agora/.test(painel), 'D2: o Painel usa "Enviar", não "Disparar"');

const fila = fonte('src/components/integrations/InboxList.tsx');
ok(
  /import\s*\{[^}]*\benviadoSoEmTeste\b[^}]*\}\s*from\s*'@\/lib\/inbox-resumo'/.test(fila),
  'D3: InboxList importa enviadoSoEmTeste de @/lib/inbox-resumo'
);
ok(!/function\s+enviadoSoEmTeste\b/.test(fila), 'D4: a régua é importada, não copiada');
ok(
  /enviadoSoEmTeste\(item\)\s*\?\s*'enviado só em teste'\s*:\s*'enviado à Meta'/.test(fila),
  'D5: o selo da linha diz "enviado só em teste" quando a régua manda'
);
ok(/explicacaoDeTeste\?\s*:\s*string/.test(fila), 'D6: o item da Fila tem o campo opcional explicacaoDeTeste');
ok(
  /alvo\.explicacaoDeTeste\s*\?\?\s*'Cupom de R\$ 0,01 ou e-mail de teste\./.test(fila),
  'D7: o aviso de teste interno usa explicacaoDeTeste, com a frase antiga de reserva'
);

/* ---------------- Fim ---------------- */

ok(chamadas.length === 0, 'nenhuma chamada de rede', mostra(chamadas));
if (globalThis.fetch !== fetchEspiao) {
  console.error('  FALHOU  alguém trocou o fetch espião no meio do teste');
  falhas += 1;
}

process.chdir(os.tmpdir());
fs.rmSync(PASTA, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  Tag sem regra: a tela não promete Fila; as ressalvas de texto da C8, C9 e C12 estão no lugar.'
    : `\n  ${falhas} falha(s).`
);
process.exit(falhas === 0 ? 0 : 1);
