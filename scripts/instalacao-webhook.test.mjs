#!/usr/bin/env node
/**
 * Instalação do webhook (M-14): o selo "Último recebimento", o texto das
 * instruções para quem instala, e a prova de que o teste da tela não vai à Meta.
 *
 * O que este teste prova:
 *   A. `seloDoWebhook`: verde só com entrega real das últimas 24 h; neutro sem
 *      entrega ou com entrega velha; alerta em localhost.
 *   B. `instrucoesParaODev`: leva o endereço uma vez só, sozinho na linha, diz o
 *      método e as respostas, usa o nome do produto e não cita ferramenta
 *      de terceiro.
 *   C. O comprador de exemplo que a tela manda é reconhecido como teste pela
 *      régua do console (`avaliarTeste`): teste nunca vai à Meta.
 *   D. Na fonte: o teste e as instruções ficam à vista (antes de "Detalhes
 *      técnicos"), o rótulo não cita n8n, o pedido de exemplo é o de sempre, e
 *      a página passa o último recebimento.
 *
 * Nenhuma rede. O `fetch` global é trocado por um espião ANTES de qualquer
 * import de src/, e o teste confere no fim que ninguém o chamou.
 *
 * Uso: npm run test:instalacao-webhook
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
  throw new Error(`rede bloqueada pelo teste: ${url}`);
};
globalThis.fetch = fetchEspiao;
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'instalacao-webhook-'));
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
const ocorrencias = (texto, agulha) => texto.split(agulha).length - 1;

const { seloDoWebhook, instrucoesParaODev } = await import(
  new URL('../src/components/instalacao/instrucoes-webhook.ts', import.meta.url).href
);
const { NOME_PRODUTO } = await import(new URL('../src/lib/produto.ts', import.meta.url).href);
const { avaliarTeste } = await import(
  new URL('../src/lib/deteccao-de-teste.ts', import.meta.url).href
);

/* ---------------- A. O selo ---------------- */

console.log('\nA. O selo do bloco do webhook');

const AGORA = Date.parse('2026-11-18T15:00:00.000Z');
const ha = (minutos) => new Date(AGORA - minutos * 60_000).toISOString();
const selo = (ehLocal, ultimaEm) => seloDoWebhook({ ehLocal, ultimaEm, agora: AGORA });
const igual = (obtido, tom, texto) => obtido.tom === tom && obtido.texto === texto;

{
  const s = selo(true, ha(3));
  ok(igual(s, 'warning', 'Só neste computador'), 'em localhost o selo é de alerta, mesmo com entrega recente', mostra(s));
}
{
  const s = selo(false, ha(3));
  ok(igual(s, 'success', 'Último recebimento: há 3 min'), 'entrega há 3 min: verde, com o tempo', mostra(s));
}
{
  const s = selo(false, ha(24 * 60));
  ok(igual(s, 'success', 'Último recebimento: há 24 h'), 'entrega há 24 h em ponto: ainda verde', mostra(s));
}
{
  const s = selo(false, ha(30 * 60));
  ok(igual(s, 'neutral', 'Último recebimento: há 30 h'), 'entrega há 30 h: neutro, com o tempo', mostra(s));
}
{
  const s = selo(false, ha(3 * 24 * 60));
  ok(igual(s, 'neutral', 'Último recebimento: há 3 dias'), 'entrega há 3 dias: neutro, em dias', mostra(s));
}
for (const vazio of [null, undefined, '', 'x']) {
  const s = selo(false, vazio);
  ok(igual(s, 'neutral', 'Nenhum recebimento ainda'), `sem entrega (${mostra(vazio)}): neutro`, mostra(s));
}
{
  const s = selo(false, new Date(AGORA + 5 * 60_000).toISOString());
  ok(
    igual(s, 'success', 'Último recebimento: agora há pouco'),
    'relógio do servidor adiantado não vira tempo negativo',
    mostra(s)
  );
}

/* ---------------- B. As instruções ---------------- */

console.log('\nB. O texto das instruções');

const URL_DE_EXEMPLO = 'https://exemplo.com.br/api/webhook/in/loja/segredo-so-do-teste';
const instrucoes = instrucoesParaODev({ url: URL_DE_EXEMPLO });
const linhas = instrucoes.split('\n');

ok(ocorrencias(instrucoes, URL_DE_EXEMPLO) === 1, 'o endereço aparece uma vez só');
ok(linhas.includes(URL_DE_EXEMPLO), 'o endereço fica sozinho em uma linha');
ok(linhas[0] === `Webhook de vendas para o ${NOME_PRODUTO}`, 'a primeira linha leva o nome do produto', mostra(linhas[0]));
ok(instrucoes.includes('POST'), 'diz o método');
ok(instrucoes.includes('202'), 'diz a resposta esperada');
ok(instrucoes.includes('401'), 'diz o que fazer quando o endereço é recusado');
ok(instrucoes.includes('Eventos → Fila'), 'diz onde a venda aparece');
ok(!/n8n/i.test(instrucoes), 'não cita n8n');
ok(!instrucoes.includes('undefined'), 'nenhum campo vazio vazou para o texto');

/* ---------------- C. O comprador de exemplo é teste ---------------- */

console.log('\nC. O teste da tela não vai à Meta');

{
  const v = avaliarTeste({
    email: 'simulacao@exemplo.com.br',
    nome: 'Simulação Teste',
    valor: 197,
    ehCompra: true,
  });
  ok(v.ehTeste === true && v.bloqueiaAutomatico === true, 'o comprador de exemplo é tratado como teste', mostra(v));
}
{
  const v = avaliarTeste({ email: 'alguem@loja.com.br', nome: 'Simulação Teste', valor: 197, ehCompra: true });
  ok(v.ehTeste === true, 'só o nome de exemplo já basta para ser teste', mostra(v));
}
ok(fonte('src/lib/auto-dispatch.ts').includes('teste-ignorado'), 'o envio automático ainda ignora teste');

/* ---------------- D. Fonte ---------------- */

console.log('\nD. Fonte da tela');

const webhook = fonte('src/components/instalacao/WebhookInstalacao.tsx');
const pagina = fonte('src/components/instalacao/InstalacaoPage.tsx');
const puro = fonte('src/components/instalacao/instrucoes-webhook.ts');
const rota = fonte('src/app/(console)/e/[slug]/fontes/page.tsx');

ok(!/n8n/i.test(webhook), 'WebhookInstalacao: nenhum "n8n"');
ok(webhook.includes('label="URL sem o segredo"'), 'WebhookInstalacao: o rótulo novo do campo');
ok(!webhook.includes('Simular recebimento'), 'WebhookInstalacao: o botão antigo saiu');
ok(webhook.includes('Copiar instruções para o dev'), 'WebhookInstalacao: botão das instruções');
ok(webhook.includes('instrucoesParaODev({ url: endpointRotulado })'), 'WebhookInstalacao: as instruções levam o mesmo endereço do "Copiar a URL"');
ok(webhook.includes('Integrações → aba'), 'WebhookInstalacao: o passo do xWinner continua igual');
ok(ocorrencias(webhook, 'onSimular()') === 1, 'WebhookInstalacao: o teste sai de um lugar só', `(achou ${ocorrencias(webhook, 'onSimular()')})`);

const iDetalhes = webhook.indexOf('aria-controls={idDetalhes}');
const iTeste = webhook.indexOf("'Mandar um teste'");
const iInstrucoes = webhook.indexOf('Copiar instruções para o dev');
ok(iDetalhes !== -1, 'WebhookInstalacao: o botão "Detalhes técnicos" existe');
ok(iTeste !== -1 && iTeste < iDetalhes, 'WebhookInstalacao: "Mandar um teste" vem antes de "Detalhes técnicos"');
ok(iInstrucoes !== -1 && iInstrucoes < iDetalhes, 'WebhookInstalacao: as instruções vêm antes de "Detalhes técnicos"');

ok(pagina.includes("await pedir('/api/webhook/in', {"), 'InstalacaoPage: o teste vai para o próprio console');
ok(pagina.includes('order_id: `sim_${Date.now().toString(36)}`'), 'InstalacaoPage: o pedido de exemplo começa com sim_');
ok(pagina.includes("'X-CAPI-Secret': cfg.entrada.segredo"), 'InstalacaoPage: o segredo vai no cabeçalho, não na URL');
ok(pagina.includes("name: 'Simulação Teste'"), 'InstalacaoPage: o nome de exemplo é o de sempre');
ok(pagina.includes("email: 'simulacao@exemplo.com.br'"), 'InstalacaoPage: o e-mail de exemplo é o de sempre');
ok(pagina.includes('seloDoWebhook('), 'InstalacaoPage: o selo vem do módulo puro');
ok(pagina.includes('router.refresh()'), 'InstalacaoPage: relê o servidor ao voltar para a aba');
ok(!pagina.includes("'No ar'"), 'InstalacaoPage: o selo fixo saiu');

for (const [nome, texto] of [
  ['instrucoes-webhook.ts', puro],
  ['InstalacaoPage.tsx', pagina],
  ['WebhookInstalacao.tsx', webhook],
]) {
  ok(!texto.includes('graph.facebook.com'), `${nome}: não fala com a Meta`);
  ok(!/console\.(log|info|warn|error|debug)\(/.test(texto), `${nome}: nada é escrito em log`);
}

ok(rota.includes('recebimentosDaEmpresa('), 'página: lê o último recebimento');
const elemento = rota.match(/<InstalacaoPage\b[\s\S]*?\/>/)?.[0] ?? '';
ok(elemento.includes('key={empresaId}'), 'página: o elemento mantém a key por empresa');
ok(elemento.includes('empresaId={empresaId}'), 'página: o elemento mantém a empresa');
ok(elemento.includes('recebimento={recebimento}'), 'página: o elemento recebe o último recebimento');

/* ---------------- Fim ---------------- */

ok(chamadas.length === 0, 'nenhuma chamada de rede', mostra(chamadas));

process.chdir(RAIZ);
fs.rmSync(PASTA, { recursive: true, force: true });

console.log(falhas === 0 ? '\nInstalação do webhook: tudo certo.' : `\nInstalação do webhook: ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
