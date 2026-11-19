#!/usr/bin/env node
/**
 * Recebimentos: a hora da última entrega e a contagem, por empresa e por
 * origem (M-02).
 *
 * Por que este arquivo existe. O console só sabia da última entrega do webhook
 * enquanto ela estava na memória da Fila, e ninguém era avisado quando a
 * plataforma ou o site paravam de mandar. Agora `logs/recebimentos.json` guarda
 * a hora e a contagem, e a Visão geral avisa "Nada chega pela plataforma há N h".
 *
 * O teste roda num `cwd` temporário (os módulos resolvem `<cwd>/logs` no
 * import), com dado inventado. Nada daqui lê o `logs/` de verdade nem envia
 * evento a lugar nenhum.
 *
 * Uso: npm run test:recebimentos
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capi-recebimentos-'));
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const ARQ_INBOX = path.join(tmp, 'logs', 'inbox.jsonl');
const ARQ_REC = path.join(tmp, 'logs', 'recebimentos.json');

/** Datas de 2024 de propósito: qualquer entrega feita durante o teste é mais nova. */
const linha = (id, hora, origem, extra = {}) => ({
  id,
  recebidoEm: `2024-03-10T${hora}:00:00.000Z`,
  status: 'novo',
  origem,
  evento: origem === 'tag' ? 'PageView' : 'Purchase',
  temFbc: false,
  temFbp: false,
  ...extra,
  payload: {},
});

/**
 * A Fila gravada: duas da empresa padrão (uma sem `empresaId`), e três da
 * emp_x: uma do webhook, uma da tag e uma simulada pelo console (`sim_`).
 */
const linhas = [
  linha('p1', '10', 'webhook'),
  linha('p2', '11', 'webhook', { empresaId: 'default' }),
  linha('p3', '12', 'webhook', { empresaId: 'emp_x' }),
  linha('p4', '13', 'tag', { empresaId: 'emp_x' }),
  linha('p5', '14', 'webhook', { empresaId: 'emp_x', orderId: 'sim_abc' }),
];
fs.writeFileSync(ARQ_INBOX, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');

/** O arquivo de recebimentos que já existia: a emp_x com 40 entregas antigas. */
const SEMENTE = {
  versao: 1,
  empresas: {
    emp_x: { plataforma: { ultimaEm: '2024-03-09T08:00:00.000Z', total: 40 } },
    emp_y: {
      site: { ultimaEm: '2024-03-01T00:00:00.000Z', total: 7 },
      plataforma: { ultimaEm: 'isto não é data', total: 3 },
    },
  },
};
fs.writeFileSync(ARQ_REC, JSON.stringify(SEMENTE, null, 2) + '\n', 'utf8');

const raizAnterior = process.cwd();
process.chdir(tmp);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};
const mostra = (v) => JSON.stringify(v);
const lerArquivo = (arquivo) => JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const lanca = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

console.log('\n  Recebimentos: última entrega e contagem por empresa\n');

const calculo = await import(new URL('../src/lib/recebimentos-calculo.ts', import.meta.url).href);
const { dataHoraDeBrasilia } = await import(new URL('../src/lib/visao-geral-calculos.ts', import.meta.url).href);
const inbox = await import(new URL('../src/lib/inbox.ts', import.meta.url).href);
const recebimentos = await import(new URL('../src/lib/recebimentos.ts', import.meta.url).href);

/* ---------------- 1. As contas puras ---------------- */
const AGORA = Date.parse('2026-11-18T12:00:00.000Z');
const haHoras = (h) => new Date(AGORA - h * 3_600_000).toISOString();
const haMinutos = (m) => new Date(AGORA - m * 60_000).toISOString();

ok(calculo.origemDoRecebimento('tag') === 'site', 'a tag é "site"');
ok(
  calculo.origemDoRecebimento('webhook') === 'plataforma' && calculo.origemDoRecebimento(undefined) === 'plataforma',
  'qualquer outra origem é "plataforma"'
);
ok(calculo.ehSimulacaoDoConsole('sim_abc') === true, 'pedido "sim_abc" é simulação do console');
ok(
  calculo.ehSimulacaoDoConsole('PED-1') === false && calculo.ehSimulacaoDoConsole(undefined) === false,
  'pedido de verdade e pedido ausente não são simulação'
);

const tempos = [
  [new Date(AGORA - 30_000).toISOString(), 'agora há pouco'],
  [haMinutos(3), 'há 3 min'],
  [haMinutos(59), 'há 59 min'],
  [haHoras(5), 'há 5 h'],
  [haHoras(47), 'há 47 h'],
  [haHoras(48), 'há 2 dias'],
  [haHoras(72), 'há 3 dias'],
  [new Date(AGORA + 600_000).toISOString(), 'agora há pouco'],
];
for (const [iso, esperado] of tempos) {
  const veio = calculo.haQuantoTempo(iso, AGORA);
  ok(veio === esperado, `haQuantoTempo: "${esperado}"`, 'veio ' + mostra(veio));
}
ok(
  calculo.haQuantoTempo(null, AGORA) === null &&
    calculo.haQuantoTempo('', AGORA) === null &&
    calculo.haQuantoTempo('x', AGORA) === null,
  'haQuantoTempo: sem data, ou data que não se lê, devolve null'
);

ok(calculo.avisosDeSilencio(null, AGORA).length === 0, 'sem recebimentos, sem aviso');
ok(
  calculo.avisosDeSilencio({ plataforma: { ultimaEm: haHoras(30), total: 19 } }, AGORA).length === 0,
  '19 entregas e 30 h de silêncio: sem aviso (falta histórico)'
);
ok(
  calculo.avisosDeSilencio({ plataforma: { ultimaEm: haHoras(23), total: 20 } }, AGORA).length === 0,
  '20 entregas e 23 h de silêncio: sem aviso (ainda não deu 24 h)'
);
ok(
  calculo.avisosDeSilencio({ plataforma: { ultimaEm: 'isto não é data', total: 50 } }, AGORA).length === 0,
  'data que não se lê: sem aviso'
);

const quando = haHoras(26);
const umAviso = calculo.avisosDeSilencio({ plataforma: { ultimaEm: quando, total: 20 } }, AGORA);
ok(umAviso.length === 1 && umAviso[0].origem === 'plataforma', '20 entregas e 26 h de silêncio: um aviso, da plataforma', mostra(umAviso));
ok(umAviso[0]?.titulo === 'Nada chega pela plataforma há 26 h', 'título: "Nada chega pela plataforma há 26 h"', mostra(umAviso[0]?.titulo));
ok(umAviso[0]?.horas === 26, 'horas: 26');
ok(
  umAviso[0]?.corpo ===
    `Confira na plataforma se o webhook continua ligado. A última entrega chegou em ${dataHoraDeBrasilia(quando)}.`,
  'corpo: o que conferir e quando foi a última entrega',
  mostra(umAviso[0]?.corpo)
);

const naBorda = calculo.avisosDeSilencio({ plataforma: { ultimaEm: haHoras(24), total: 20 } }, AGORA);
ok(naBorda.length === 1 && naBorda[0].titulo === 'Nada chega pela plataforma há 24 h', 'exatamente 24 h: avisa', mostra(naBorda));

const quandoSite = haHoras(50);
const doSite = calculo.avisosDeSilencio({ site: { ultimaEm: quandoSite, total: 50 } }, AGORA);
ok(doSite.length === 1 && doSite[0].titulo === 'Nada chega pelo site há 2 dias', 'site há 50 h: "Nada chega pelo site há 2 dias"', mostra(doSite));
ok(
  doSite[0]?.corpo ===
    `Confira se a tag continua instalada no site. O último evento do site chegou em ${dataHoraDeBrasilia(quandoSite)}.`,
  'corpo do aviso do site',
  mostra(doSite[0]?.corpo)
);

const osDois = calculo.avisosDeSilencio(
  { site: { ultimaEm: haHoras(30), total: 30 }, plataforma: { ultimaEm: haHoras(30), total: 30 } },
  AGORA
);
ok(mostra(osDois.map((a) => a.origem)) === mostra(['plataforma', 'site']), 'as duas origens paradas: plataforma primeiro, site depois', mostra(osDois.map((a) => a.origem)));

for (const ruim of ['', 'null', '[]', '{"empresas":[]}', '\u0000\u0000']) {
  ok(lanca(() => calculo.interpretarRecebimentos(ruim)), `interpretarRecebimentos lança para ${mostra(ruim)}`);
}
const interpretado = calculo.interpretarRecebimentos(
  JSON.stringify({
    versao: 1,
    empresas: {
      a: { plataforma: { ultimaEm: '2024-03-10T10:00:00.000Z', total: 3 }, site: { ultimaEm: 'x', total: 1 } },
      b: 5,
      c: { plataforma: { ultimaEm: '2024-03-10T10:00:00.000Z', total: -1 }, site: { ultimaEm: '2024-03-10T10:00:00.000Z', total: 1.5 } },
    },
  })
);
ok(
  mostra(interpretado) === mostra({ a: { plataforma: { ultimaEm: '2024-03-10T10:00:00.000Z', total: 3 } }, c: {} }),
  'arquivo válido: registro inválido é ignorado e empresa que não é objeto fica de fora',
  mostra(interpretado)
);

/* ---------------- 2. Ao ligar: o arquivo + o que a Fila já tem ---------------- */
const padrao = await inbox.recebimentosDaEmpresa('default');
ok(
  mostra(padrao) === mostra({ plataforma: { ultimaEm: '2024-03-10T11:00:00.000Z', total: 2 } }),
  'a padrão: 2 entregas da plataforma (uma sem empresaId), a última às 11:00, e nada do site',
  mostra(padrao)
);
const daX = await inbox.recebimentosDaEmpresa('emp_x');
ok(daX.plataforma?.total === 40, 'emp_x: o total do arquivo (40) é piso; a Fila tinha só 1', mostra(daX.plataforma));
ok(
  daX.plataforma?.ultimaEm === '2024-03-10T12:00:00.000Z',
  'emp_x: a data é a mais nova das duas, e a simulação (sim_, 14:00) ficou de fora',
  mostra(daX.plataforma)
);
ok(mostra(daX.site) === mostra({ ultimaEm: '2024-03-10T13:00:00.000Z', total: 1 }), 'emp_x: 1 evento do site', mostra(daX.site));
const daY = await inbox.recebimentosDaEmpresa('emp_y');
ok(daY.site?.total === 7 && daY.plataforma === undefined, 'emp_y: vem do arquivo; o registro com data inválida foi ignorado', mostra(daY));
ok(mostra(await inbox.recebimentosDaEmpresa('nao_existe')) === '{}', 'empresa desconhecida: objeto vazio');

daX.plataforma.total = 999;
ok(
  (await inbox.recebimentosDaEmpresa('emp_x')).plataforma?.total === 40,
  'o que a função devolve é cópia: mexer nela não muda a contagem'
);

/* ---------------- 3. Cada entrega nova conta ---------------- */
const inicio = Date.now();
const nova = (extra) =>
  inbox.registrarEntrada({ origem: 'webhook', evento: 'Purchase', temFbc: false, temFbp: false, payload: {}, ...extra });

await nova({ empresaId: 'emp_x' });
let agoraX = await inbox.recebimentosDaEmpresa('emp_x');
ok(agoraX.plataforma?.total === 41, 'entrega do webhook na emp_x: 40 vira 41', mostra(agoraX.plataforma));
ok(Date.parse(agoraX.plataforma?.ultimaEm ?? '') >= inicio, 'e a última entrega passa a ser a de agora', mostra(agoraX.plataforma));

await nova({ empresaId: 'emp_x', origem: 'tag', evento: 'PageView' });
agoraX = await inbox.recebimentosDaEmpresa('emp_x');
ok(agoraX.site?.total === 2 && agoraX.plataforma?.total === 41, 'evento da tag conta no site, não na plataforma', mostra(agoraX));

await nova({});
ok(
  (await inbox.recebimentosDaEmpresa('default')).plataforma?.total === 3,
  'entrega sem empresaId conta na empresa padrão'
);

await nova({ empresaId: 'emp_x', orderId: 'sim_abc123' });
agoraX = await inbox.recebimentosDaEmpresa('emp_x');
ok(agoraX.plataforma?.total === 41, 'a simulação do console (sim_) NÃO conta como recebimento', mostra(agoraX.plataforma));
ok(
  (await inbox.listarEntradas(1000, 'emp_x')).some((i) => i.orderId === 'sim_abc123'),
  'mas a simulação continua entrando na Fila, como hoje'
);

/* ---------------- 4. O disco ---------------- */
ok(
  lerArquivo(ARQ_REC).empresas.emp_x.plataforma.total === 40,
  'a entrega muda só a memória: o arquivo ainda tem 40 (a gravação é juntada)'
);

await recebimentos.gravarRecebimentosAgora();
const gravado = lerArquivo(ARQ_REC);
ok(gravado.versao === 1, 'arquivo gravado com versao 1');
ok(
  gravado.empresas.emp_x.plataforma.total === 41 &&
    gravado.empresas.emp_x.site.total === 2 &&
    gravado.empresas.default.plataforma.total === 3,
  'depois de gravar: 41 e 2 na emp_x, 3 na padrão',
  mostra(gravado.empresas)
);
ok(
  gravado.empresas.emp_y.site.total === 7 && gravado.empresas.emp_y.plataforma === undefined,
  'a emp_y continua com o que tinha; o registro inválido não volta para o arquivo',
  mostra(gravado.empresas.emp_y)
);
ok(
  fs.existsSync(ARQ_REC + '.bak') && lerArquivo(ARQ_REC + '.bak').empresas.emp_x.plataforma.total === 40,
  'a cópia .bak guarda o estado anterior (40)'
);
ok(!fs.existsSync(ARQ_REC + '.tmp'), 'não sobra arquivo .tmp');
const textoGravado = fs.readFileSync(ARQ_REC, 'utf8');
ok(!textoGravado.includes('@') && !/[a-f0-9]{64}/.test(textoGravado), 'o arquivo não carrega e-mail nem hash');

await recebimentos.gravarRecebimentosAgora();
ok(fs.readFileSync(ARQ_REC, 'utf8') === textoGravado, 'gravar de novo sem mudança não altera o arquivo');
ok(
  lerArquivo(ARQ_REC + '.bak').empresas.emp_x.plataforma.total === 40,
  'nem toca no disco: a cópia .bak continua com 40'
);

/* ---------------- Fechamento ---------------- */
process.chdir(raizAnterior);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  falhas === 0
    ? '\n  O console sabe quando cada empresa recebeu pela última vez, e avisa quando para.\n'
    : `\n  ${falhas} FALHA(S)\n`
);
process.exit(falhas ? 1 : 0);
