#!/usr/bin/env node
/**
 * Fila a um clique (T-M08, plano v8).
 *
 * Nenhuma rede, nenhuma escrita.
 *
 *   a  a contagem (`src/lib/vendas-esperando.ts`): só venda real, parada, da
 *      empresa; e a frase do aviso, no singular e no plural;
 *   b  o módulo é neutro (serve ao navegador e ao servidor);
 *   c  a Visão geral mostra o aviso no topo, sem leitura nova de rede;
 *   d  a aba Eventos abre na Fila só no endereço puro, e o Resumo tem
 *      endereço próprio para a pessoa conseguir sair da Fila;
 *   e  a Fila em si não foi tocada.
 *
 * Uso: npm run test:vendas-esperando
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { textoDeVendasEsperando, vendasEsperando } from '../src/lib/vendas-esperando.ts';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe !== '' ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};
const ler = (relativo) => {
  const caminho = path.join(RAIZ, ...relativo.split('/'));
  return fs.existsSync(caminho) ? fs.readFileSync(caminho, 'utf8') : '';
};
const semComentario = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n  a. A contagem');
const venda = (extra = {}) => ({ status: 'novo', eventoMeta: 'Purchase', empresaId: 'gtech', ...extra });
const itens = [
  venda(), // conta: venda nova
  venda({ status: 'carregado' }), // conta: aberta no formulário e ainda não enviada
  venda({ eventoMeta: undefined, evento: 'Purchase' }), // conta: venda pelo nome de origem
  venda({ status: 'disparado' }), // já foi enviada
  venda({ status: 'ignorado' }), // a regra mandou ignorar
  venda({ testeInterno: true }), // teste interno
  venda({ testePlataforma: true }), // teste da plataforma
  venda({ eventoMeta: 'Lead' }), // não é venda
  venda({ empresaId: 'outra' }), // de outra empresa
  venda({ empresaId: undefined }), // linha antiga: empresa padrão
];
ok(vendasEsperando(itens, 'gtech') === 3, 'a1: conta só venda real, nova ou aberta, da empresa', String(vendasEsperando(itens, 'gtech')));
ok(vendasEsperando(itens, 'outra') === 1, 'a2: cada empresa tem a sua contagem', String(vendasEsperando(itens, 'outra')));
ok(vendasEsperando(itens, 'default') === 1, 'a3: item sem empresaId é da empresa padrão', String(vendasEsperando(itens, 'default')));
ok(vendasEsperando([], 'gtech') === 0, 'a4: lista vazia = zero');
ok(textoDeVendasEsperando(1) === '1 venda esperando você', 'a5: singular', textoDeVendasEsperando(1));
ok(textoDeVendasEsperando(2) === '2 vendas esperando você', 'a6: plural', textoDeVendasEsperando(2));
ok(textoDeVendasEsperando(1234) === '1.234 vendas esperando você', 'a7: milhar com ponto', textoDeVendasEsperando(1234));

console.log('\n  b. O módulo é neutro');
const lib = semComentario(ler('src/lib/vendas-esperando.ts'));
ok(lib !== '', 'b1: src/lib/vendas-esperando.ts existe');
ok(!/server-only|node:fs|node:path|fetch\(/.test(lib), 'b2: sem server-only, disco nem rede');
ok(/import \{ ehCompra \} from '@\/lib\/inbox-resumo';/.test(lib), 'b3: "é venda" vem da régua que já existe (ehCompra)');

console.log('\n  c. A Visão geral');
const aviso = semComentario(ler('src/components/visao-geral/VendasEsperando.tsx'));
ok(aviso !== '', 'c1: src/components/visao-geral/VendasEsperando.tsx existe');
ok(aviso.includes('?vista=fila'), 'c2: o botão abre a Fila (?vista=fila)');
ok(aviso.includes('Abrir a Fila'), 'c3: o botão diz "Abrir a Fila"');
ok(aviso.includes('textoDeVendasEsperando('), 'c4: a frase vem da função única');
ok(/return null/.test(aviso), 'c5: sem venda parada, não mostra nada');
ok((aviso.match(/<Link /g) ?? []).length === 1, 'c6: uma ação só');
const visao = semComentario(ler('src/components/visao-geral/VisaoGeral.tsx'));
const iAviso = visao.indexOf('<VendasEsperando');
// D-R1 (18/11/2026): a regra antiga punha o aviso acima dos números; agora os números vêm primeiro.
const iKpis = visao.indexOf('<Kpis');
ok(iAviso >= 0 && iKpis >= 0 && iKpis < iAviso, 'c7: os números vêm antes do aviso (<Kpis acima de <VendasEsperando)');
ok(visao.includes('vendasEsperando(atividade.value.itens, empresaId)'), 'c8: conta sobre a lista que a tela já baixa');
ok((visao.match(/\/api\/inbox\?/g) ?? []).length === 1, 'c9: nenhuma leitura nova de /api/inbox');

console.log('\n  d. A aba Eventos');
const pagina = semComentario(ler('src/app/(console)/e/[slug]/eventos/page.tsx'));
ok(pagina.includes('Object.keys(busca).length === 0'), 'd1: só o endereço puro da aba abre na Fila');
ok(pagina.includes('vendasEsperando(await listarEntradas(1000, empresaId), empresaId)'), 'd2: a página conta com a mesma função');
ok(/catch \{\s*return 0;\s*\}/.test(pagina), 'd3: leitura que falha não derruba a aba (abre no Resumo)');
ok(pagina.includes("abriuPorEspera ? 'fila' : primeiro(busca.vista)"), 'd4: com venda esperando, a vista é a Fila');
ok(pagina.includes('por isso a aba abriu aqui'), 'd5: o cabeçalho diz por que abriu na Fila');
const seletor = semComentario(ler('src/components/eventos/SeletorDeVista.tsx'));
ok(!seletor.includes("vista !== 'resumo'"), 'd6: o Resumo deixou de ser o endereço sem vista');
ok(seletor.includes("parametros.set('vista', vista);"), 'd7: toda vista tem endereço próprio (o Resumo é ?vista=resumo)');
const paleta = semComentario(ler('src/components/common/CommandPalette.tsx'));
ok(paleta.includes("irPara('/eventos?vista=resumo', '/painel')"), 'd8: "Painel de eventos" da paleta abre o Resumo');

console.log('\n  e. A Fila em si');
const fila = ler('src/components/integrations/InboxList.tsx');
ok(fila !== '' && !fila.includes('vendas-esperando'), 'e1: InboxList.tsx não foi tocado por esta ficha');

console.log(falhas === 0 ? '\n  Vendas esperando: tudo certo.' : `\n  ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
