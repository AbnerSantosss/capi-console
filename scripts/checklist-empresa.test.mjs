#!/usr/bin/env node
/**
 * O checklist de configuração da empresa (V5 do plano v7; T12 do v6), em
 * `src/lib/checklist-empresa.ts`:
 *
 *   (a) empresa nova, sem nada → "1 de 6", próximo "Cadastrar um Pixel" → /e/<slug>/pixels
 *   (b) Pixel com ID e token e a chave desligada → passo 2 feito, a frase
 *       termina em "Desligado: não sai sozinho", nenhum texto diz "Pixel ligado"
 *   (c) Pixel + subdomínio + hit da tag + entrega do webhook + aceito real →
 *       "5 de 6", e o único não feito é "Domínio apontado", em `andamento`
 *   (d) nenhuma combinação chega a "6 de 6" (todos os estados de domínio de hoje)
 *   (e) só a tag, com PageView aceito e sem webhook → passo 5 não feito,
 *       próximo "Conectar o webhook de vendas"
 *   (f) o único aceito é teste interno → passo 6 não feito
 *   (g) `estadoDaEmpresa` sem Pixel → "Falta configurar: cadastrar um Pixel"
 *   e mais: envio automático só com as duas travas; recusa sem aceite = erro.
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/, e ele LANÇA para qualquer endereço, inclusive
 * graph.facebook.com e api.cloudflare.com. Sem ACCESS_TOKEN e sem PIXEL_ID. O
 * processo roda numa pasta temporária e não grava nada: nunca no config/ real.
 *
 * Uso: npm run test:checklist
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ---------------- 0. Rede trancada, antes de qualquer import de src/ ---------------- */

const chamadas = [];
globalThis.fetch = async (entrada) => {
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
delete process.env.ACCESS_TOKEN;
delete process.env.PIXEL_ID;

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'checklist-empresa-'));
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

const { montarChecklist, estadoDaEmpresa, envioAutomaticoDaEmpresa } = await import(
  new URL('../src/lib/checklist-empresa.ts', import.meta.url).href
);

/* ---------------- Fixtures ---------------- */

const SLUG = 'gtech';
const AGORA = Date.parse('2026-09-24T13:15:00.000Z');
const haHoras = (h) => new Date(AGORA - h * 3_600_000).toISOString();

const PIXEL_DESLIGADO = { id: 'marca_a', pixelId: '1234567890', temToken: true, autoDisparo: false };
const PIXEL_LIGADO = { ...PIXEL_DESLIGADO, autoDisparo: true };
const PIXEL_SEM_TOKEN = { ...PIXEL_DESLIGADO, temToken: false };
const REGRA_AUTO = { modo: 'auto', ativo: true, marcas: ['marca_a'] };
const REGRA_FILA = { modo: 'fila', ativo: true, marcas: ['marca_a'] };

const ACEITO = [{ status: 'enviado', httpStatus: 200, eventsReceived: 1, modoTeste: false }];
const RECUSADO = [{ status: 'erro', httpStatus: 400, modoTeste: false }];

const entradaDoWebhook = (parcial = {}) => ({
  origem: 'webhook',
  recebidoEm: haHoras(2),
  status: 'novo',
  ...parcial,
});
const entradaDaTag = (parcial = {}) => ({
  origem: 'tag',
  recebidoEm: haHoras(1),
  status: 'novo',
  ...parcial,
});

const DOMINIO_SEM_SUB = { host: 'loja.com.br' };
const DOMINIO_COM_SUB = { host: 'loja.com.br', subdominio: 'tk' };

const passo = (c, chave) => c.passos.find((p) => p.chave === chave);
const todoTexto = (c) =>
  c.passos.map((p) => `${p.titulo} ${p.frase} ${p.verbo} ${p.causa ?? ''}`).join(' | ');

/* ---------------- (a) empresa nova ---------------- */

console.log('\n(a) empresa nova, sem nada');
{
  const c = montarChecklist({ empresa: { slug: SLUG }, pixels: [], integracoes: { dominios: [], regras: [] } });
  ok(c.contagem === '1 de 6', '"1 de 6"', mostra(c.contagem));
  ok(c.passos.length === 6, 'seis passos');
  ok(
    mostra(c.passos.map((p) => p.titulo)) ===
      mostra([
        'Empresa criada',
        'Pixel cadastrado',
        'Domínio apontado',
        'Tag do site instalada',
        'Webhook de vendas conectado',
        'Primeiro evento aceito pela Meta',
      ]),
    'os seis títulos, na ordem da T12'
  );
  ok(c.proximo?.verbo === 'Cadastrar um Pixel', 'próximo passo "Cadastrar um Pixel"', mostra(c.proximo));
  ok(c.proximo?.href === `/e/${SLUG}/pixels`, `leva a /e/${SLUG}/pixels`, mostra(c.proximo?.href));
  ok(passo(c, 'empresa').estado === 'feito', 'Empresa criada: feito');
}

/* ---------------- (b) Pixel com token, chave desligada ---------------- */

console.log('\n(b) Pixel com ID e token, chave desligada');
{
  const c = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_DESLIGADO],
    integracoes: { dominios: [], regras: [REGRA_AUTO] },
  });
  const p = passo(c, 'pixel');
  ok(p.estado === 'feito', 'passo 2 feito');
  ok(p.frase.endsWith('Desligado: não sai sozinho'), 'frase termina em "Desligado: não sai sozinho"', mostra(p.frase));
  ok(!/pixel ligado/i.test(todoTexto(c)), 'nenhum texto contém "Pixel ligado"');
  ok(!p.frase.includes('token') || !/\bEAA/i.test(p.frase), 'a frase diz "com token", nunca o token');

  const ligado = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_LIGADO],
    integracoes: { dominios: [], regras: [REGRA_AUTO] },
  });
  ok(passo(ligado, 'pixel').frase.endsWith('· Ligado'), 'chave ligada e regra automática: "· Ligado"');
  ok(!/pixel ligado/i.test(todoTexto(ligado)), 'nem assim aparece "Pixel ligado"');

  const semRegra = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_LIGADO],
    integracoes: { dominios: [], regras: [REGRA_FILA] },
  });
  ok(
    passo(semRegra, 'pixel').frase.includes('sem regra automática: não sai sozinho'),
    'chave ligada sem regra automática: diz que não sai sozinho'
  );

  const semToken = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_SEM_TOKEN],
    integracoes: { dominios: [], regras: [] },
  });
  ok(passo(semToken, 'pixel').estado === 'pendente', 'Pixel sem token: passo 2 NÃO feito');
  ok(semToken.proximo?.verbo === 'Cadastrar o token do Pixel', 'e o próximo é cadastrar o token');
}

/* ---------------- (c) tudo o que dá para provar hoje ---------------- */

console.log('\n(c) Pixel + subdomínio + hit + webhook + aceito real');
{
  const c = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_LIGADO],
    integracoes: {
      dominios: [{ ...DOMINIO_COM_SUB, ultimoHit: haHoras(1) }],
      regras: [REGRA_AUTO],
    },
    entradas: [entradaDoWebhook({ status: 'disparado', resultados: ACEITO })],
  });
  ok(c.contagem === '5 de 6', '"5 de 6"', mostra(c.contagem));
  const abertos = c.passos.filter((p) => p.estado !== 'feito');
  ok(abertos.length === 1 && abertos[0].titulo === 'Domínio apontado', 'o único não feito é "Domínio apontado"', mostra(abertos.map((p) => p.titulo)));
  ok(abertos[0]?.estado === 'andamento', 'e ele está em andamento');
  ok(abertos[0]?.frase.includes('tk.loja.com.br'), 'a frase diz qual domínio');
  ok(c.proximo?.chave === 'dominio', 'o próximo passo é o domínio');
  const e = estadoDaEmpresa(c);
  ok(e.tom === 'andamento' && e.frase === 'Em andamento: apontamento do domínio', 'estado: "Em andamento: apontamento do domínio"', mostra(e));
  ok(c.sinais.ultimoAceito !== null && c.sinais.ultimaEntregaDoWebhook !== null, 'sinais: último aceito e última entrega');
}

/* ---------------- (d) nunca "6 de 6" ---------------- */

console.log('\n(d) nenhuma combinação chega a "6 de 6"');
{
  const dominiosPossiveis = [
    [],
    [DOMINIO_SEM_SUB],
    [{ ...DOMINIO_SEM_SUB, ultimoHit: haHoras(1) }],
    [DOMINIO_COM_SUB],
    [{ ...DOMINIO_COM_SUB, ultimoHit: haHoras(1) }],
    [{ ...DOMINIO_COM_SUB, ultimoHit: haHoras(1) }, { ...DOMINIO_SEM_SUB, ultimoHit: haHoras(3) }],
    [{ ...DOMINIO_COM_SUB, subdominio: '   ' }],
  ];
  const pixelsPossiveis = [[], [PIXEL_SEM_TOKEN], [PIXEL_DESLIGADO], [PIXEL_LIGADO], [PIXEL_LIGADO, { ...PIXEL_DESLIGADO, id: 'marca_b' }]];
  const regrasPossiveis = [[], [REGRA_FILA], [REGRA_AUTO]];
  const entradasPossiveis = [
    [],
    [entradaDaTag()],
    [entradaDoWebhook()],
    [entradaDoWebhook({ status: 'disparado', resultados: ACEITO })],
    [entradaDaTag({ status: 'disparado', resultados: ACEITO }), entradaDoWebhook()],
    [entradaDoWebhook({ resultados: RECUSADO })],
  ];
  const resumos = [null, { qualidade: { aceitos: 3, recusados: 0 } }];
  let combinacoes = 0;
  let maximo = 0;
  let seis = 0;
  for (const dominios of dominiosPossiveis)
    for (const pixels of pixelsPossiveis)
      for (const regras of regrasPossiveis)
        for (const entradas of entradasPossiveis)
          for (const resumo of resumos) {
            combinacoes += 1;
            const c = montarChecklist({ empresa: { slug: SLUG }, pixels, integracoes: { dominios, regras }, entradas, resumo });
            maximo = Math.max(maximo, c.feitos);
            if (c.feitos === 6 || c.contagem === '6 de 6') seis += 1;
            if (passo(c, 'dominio').estado === 'feito') seis += 1;
          }
  ok(seis === 0, `nenhuma das ${combinacoes} combinações chega a 6 de 6`, `seis=${seis}`);
  ok(maximo === 5, 'o máximo é 5', `maximo=${maximo}`);

  const ilegivel = montarChecklist({ empresa: { slug: SLUG }, pixels: [PIXEL_LIGADO], integracoes: null });
  ok(passo(ilegivel, 'dominio').estado === 'erro', 'configuração ilegível: Domínio com erro, nunca feito');
  ok(estadoDaEmpresa(ilegivel).tom === 'erro', 'e a empresa fica "Com erro"');
}

/* ---------------- (e) só a tag, sem webhook ---------------- */

console.log('\n(e) só a tag, com PageView aceito, sem webhook');
{
  const c = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_DESLIGADO],
    integracoes: { dominios: [{ ...DOMINIO_SEM_SUB, ultimoHit: haHoras(1) }], regras: [] },
    entradas: [entradaDaTag({ status: 'disparado', resultados: ACEITO })],
  });
  ok(passo(c, 'tag').estado === 'feito', 'passo 4 (tag) feito');
  ok(passo(c, 'webhook').estado !== 'feito', 'passo 5 (webhook) NÃO feito');
  ok(c.proximo?.verbo === 'Conectar o webhook de vendas', 'próximo: "Conectar o webhook de vendas"', mostra(c.proximo?.verbo));
  ok(c.proximo?.href === `/e/${SLUG}/fontes`, 'que leva à aba Fontes');
  ok(passo(c, 'aceito').estado === 'feito', 'o PageView aceito fecha o passo 6');
  ok(c.feitos < 6, 'não chega a 6 de 6');
}

/* ---------------- (f) o único aceito é teste interno ---------------- */

console.log('\n(f) o único aceito é teste interno');
{
  const c = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_LIGADO],
    integracoes: { dominios: [], regras: [REGRA_AUTO] },
    entradas: [entradaDoWebhook({ status: 'disparado', resultados: ACEITO, testeInterno: true })],
  });
  ok(passo(c, 'aceito').estado !== 'feito', 'passo 6 NÃO feito (teste interno)');
  ok(passo(c, 'webhook').estado === 'feito', 'mas a entrega prova o webhook');

  const plataforma = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_LIGADO],
    integracoes: { dominios: [], regras: [REGRA_AUTO] },
    entradas: [entradaDoWebhook({ status: 'disparado', resultados: ACEITO, testePlataforma: true })],
  });
  ok(passo(plataforma, 'aceito').estado !== 'feito', 'teste da plataforma também não conta');

  const soTeste = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_LIGADO],
    integracoes: { dominios: [], regras: [REGRA_AUTO] },
    entradas: [entradaDoWebhook({ status: 'disparado', resultados: [{ ...ACEITO[0], modoTeste: true }] })],
  });
  ok(passo(soTeste, 'aceito').estado !== 'feito', 'aceito só no "Testar eventos" não conta');

  const recusado = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_LIGADO],
    integracoes: { dominios: [], regras: [REGRA_AUTO] },
    entradas: [entradaDoWebhook({ resultados: RECUSADO })],
  });
  ok(passo(recusado, 'aceito').estado === 'erro', 'recusa real sem aceite: passo 6 com erro');
  ok(estadoDaEmpresa(recusado).frase === 'Com erro: a Meta recusou 1 evento', 'selo: "Com erro: a Meta recusou 1 evento"', mostra(estadoDaEmpresa(recusado)));
}

/* ---------------- (g) estadoDaEmpresa ---------------- */

console.log('\n(g) estadoDaEmpresa');
{
  const c = montarChecklist({ empresa: { slug: SLUG }, pixels: [], integracoes: { dominios: [], regras: [] } });
  const e = estadoDaEmpresa(c);
  ok(e.frase === 'Falta configurar: cadastrar um Pixel', '"Falta configurar: cadastrar um Pixel"', mostra(e));
  ok(e.tom === 'pendente' && e.rotulo === 'Falta configurar', 'selo curto "Falta configurar"');

  const soDominio = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_LIGADO],
    integracoes: { dominios: [{ ...DOMINIO_SEM_SUB, ultimoHit: haHoras(1) }], regras: [REGRA_AUTO] },
    entradas: [entradaDoWebhook({ status: 'disparado', resultados: ACEITO })],
  });
  ok(estadoDaEmpresa(soDominio).frase === 'Falta configurar: apontar o domínio', 'só o domínio falta: "apontar o domínio"', mostra(estadoDaEmpresa(soDominio)));

  // Pixels que não puderam ser lidos: erro, e nunca "nenhum Pixel cadastrado".
  const pixelsIlegiveis = montarChecklist({
    empresa: { slug: SLUG },
    pixels: null,
    integracoes: { dominios: [], regras: [] },
  });
  const passoPixel = passo(pixelsIlegiveis, 'pixel');
  ok(
    passoPixel.estado === 'erro' && !/Nenhum Pixel/.test(passoPixel.frase),
    'Pixels ilegíveis: passo em erro, sem dizer "nenhum Pixel"',
    mostra(passoPixel)
  );
  ok(
    estadoDaEmpresa(pixelsIlegiveis).tom === 'erro' && estadoDaEmpresa(pixelsIlegiveis).frase === 'Com erro: Pixels ilegíveis',
    'Pixels ilegíveis: selo "Com erro: Pixels ilegíveis"',
    mostra(estadoDaEmpresa(pixelsIlegiveis))
  );
}

/* ---------------- Envio automático: as duas travas ---------------- */

console.log('\nEnvio automático: as duas travas');
{
  ok(envioAutomaticoDaEmpresa([PIXEL_LIGADO], [REGRA_AUTO]).ligado === true, 'chave ligada + regra auto → ligado');
  const semChave = envioAutomaticoDaEmpresa([PIXEL_DESLIGADO], [REGRA_AUTO]);
  ok(!semChave.ligado && semChave.frase === 'Envio automático: desligado (falta: a chave do Pixel ligada)', 'sem a chave: diz o que falta', mostra(semChave.frase));
  const semRegra = envioAutomaticoDaEmpresa([PIXEL_LIGADO], [REGRA_FILA]);
  ok(!semRegra.ligado && semRegra.falta.includes('uma regra automática para o Pixel'), 'sem regra automática: diz o que falta');
  ok(!envioAutomaticoDaEmpresa([{ ...PIXEL_LIGADO, temToken: false }], [REGRA_AUTO]).ligado, 'sem token nunca liga');
  ok(!envioAutomaticoDaEmpresa([{ ...PIXEL_LIGADO, autoDisparo: undefined }], [REGRA_AUTO]).ligado, 'chave ausente = desligada');
  ok(!envioAutomaticoDaEmpresa([PIXEL_LIGADO], [{ ...REGRA_AUTO, ativo: false }]).ligado, 'regra desativada não conta');
  ok(
    envioAutomaticoDaEmpresa([{ ...PIXEL_LIGADO, id: 'default' }], [{ modo: 'auto', ativo: true, marcas: [] }]).ligado,
    'regra sem destino vale para o Pixel default'
  );
  ok(!envioAutomaticoDaEmpresa([PIXEL_LIGADO], null).ligado, 'regras ilegíveis: desligado');
}

/* ---------------- Nada de PII ---------------- */

console.log('\nNada de PII');
{
  const c = montarChecklist({
    empresa: { slug: SLUG },
    pixels: [PIXEL_LIGADO],
    integracoes: { dominios: [{ ...DOMINIO_COM_SUB, ultimoHit: haHoras(1) }], regras: [REGRA_AUTO] },
    entradas: [
      entradaDoWebhook({
        status: 'disparado',
        resultados: ACEITO,
        emailMascarado: 'jo***@gmail.com',
        emailHash: 'a'.repeat(64),
        payload: { email: 'joao@gmail.com', telefone: '11987654321' },
      }),
    ],
  });
  const texto = JSON.stringify(c);
  ok(!texto.includes('@') && !/[a-f0-9]{64}/.test(texto) && !texto.includes('987654321'), 'o checklist não carrega e-mail, hash nem telefone');
}

/* ---------------- Fim ---------------- */

ok(chamadas.length === 0, 'nenhuma chamada de rede', mostra(chamadas));
process.chdir(RAIZ);
fs.rmSync(PASTA, { recursive: true, force: true });

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('\nChecklist da empresa: tudo certo.');
