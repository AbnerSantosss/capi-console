#!/usr/bin/env node
/**
 * A casca do console (V3 do plano v7): lateral de empresas, 8 abas no topo,
 * cabeçalho enxuto e o fim da barra fixa de baixo.
 *
 * O que este arquivo prova:
 *
 *   (a) `abas-empresa.ts` exporta as 8 abas na ordem do desenho (Visão geral,
 *       Domínio, Fontes, Pixels, Eventos, Teste, Regras, Configurações), e o `icone`
 *       de cada uma é um arquivo que existe em `public/brand/nav/`
 *   (b) `abaAtiva`: `/e/gtech/pixels` → `pixels`, `/e/gtech` → `''`, e `null`
 *       para outra empresa, aba desconhecida e caminho fora de `/e/`
 *   (c) a barra fixa de baixo foi apagada e nenhum arquivo de `src/` cita o
 *       componente dela nem a lista de seções e a função que ela usava
 *   (d) `AbasDaEmpresa.tsx` usa `<Tabs variant="line">` e a ilustração é
 *       decorativa (`alt=""`)
 *   (e) `LateralDeEmpresas.tsx` é quem troca de empresa navegando
 *       (`destinoAoTrocar`) e quem ouve `capi:empresa-trocada-fora`
 *   (f) nenhum arquivo de `src/` importa o pacote de ícones antigo (G9)
 *   (g) `reacaoAoNavegar` (ressalva 1 da revisão da V2): `nada` quando o
 *       endereço é da empresa que vale, `ir` para `destinoAoTrocar` quando
 *       não é e não há rascunho, `manterAviso` quando há rascunho, `nada`
 *       quando o operador foi de propósito para outra empresa; e, no fonte
 *       da lateral, o efeito de `pathname` usa essa função sem escrever no
 *       store nem no cookie
 *
 * 🔴 Nenhuma rede. O `fetch` global é trocado por um falso ANTES de qualquer
 * import de src/, e ele LANÇA para qualquer endereço, inclusive
 * graph.facebook.com e api.cloudflare.com. Sem ACCESS_TOKEN e sem PIXEL_ID.
 * Nada é gravado: o teste só lê o fonte e chama funções puras.
 *
 * Uso: npm run test:casca
 */
import fs from 'node:fs';
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

const abs = (...partes) => path.join(RAIZ, ...partes);
const ler = (...partes) => {
  try {
    return fs.readFileSync(abs(...partes), 'utf8');
  } catch {
    return null;
  }
};

/** Todos os arquivos de código de `src/`, com o caminho relativo à raiz. */
function arquivosDoSrc(dir = abs('src')) {
  const saida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const cheio = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...arquivosDoSrc(cheio));
    else if (/\.(tsx?|mjs|js|css)$/.test(entrada.name)) saida.push(cheio);
  }
  return saida;
}
const relativo = (cheio) => path.relative(RAIZ, cheio).split(path.sep).join('/');
const FONTES = arquivosDoSrc().map((cheio) => ({
  arquivo: relativo(cheio),
  texto: fs.readFileSync(cheio, 'utf8'),
}));

const { ABAS_DO_TOPO, abaAtiva, reacaoAoNavegar, enderecoDaAba } = await import(
  '../src/lib/abas-empresa.ts'
);
const { destinoAoTrocar } = await import('../src/lib/empresa-do-endereco.ts');

/* ---------------- a. As 8 abas ---------------- */

console.log('\na. As 8 abas, na ordem do desenho');

const ORDEM = ['Visão geral', 'Domínio', 'Fontes', 'Pixels', 'Eventos', 'Teste', 'Regras', 'Configurações'];
ok(ABAS_DO_TOPO.length === 8, 'são 8 abas', `(${ABAS_DO_TOPO.length})`);
ok(
  JSON.stringify(ABAS_DO_TOPO.map((a) => a.rotulo)) === JSON.stringify(ORDEM),
  'na ordem Visão geral, Domínio, Fontes, Pixels, Eventos, Teste, Regras, Configurações',
  JSON.stringify(ABAS_DO_TOPO.map((a) => a.rotulo))
);
ok(
  JSON.stringify(ABAS_DO_TOPO.map((a) => a.segmento)) ===
    JSON.stringify(['', 'dominio', 'fontes', 'pixels', 'eventos', 'teste', 'regras', 'configuracoes']),
  'segmentos: "" (Visão geral) e os 7 de /e/<slug>/<aba>'
);
for (const aba of ABAS_DO_TOPO) {
  const noDisco = abs('public', ...aba.icone.split('/').filter(Boolean));
  ok(
    aba.icone.startsWith('/brand/nav/') && fs.existsSync(noDisco),
    `o ícone de "${aba.rotulo}" existe em public/brand/nav/`,
    `(${aba.icone})`
  );
}
ok(enderecoDaAba('gtech', '') === '/e/gtech', 'enderecoDaAba("gtech", "") → /e/gtech');
ok(enderecoDaAba('gtech', 'regras') === '/e/gtech/regras', 'enderecoDaAba("gtech", "regras") → /e/gtech/regras');

/* ---------------- b. abaAtiva ---------------- */

console.log('\nb. abaAtiva');

ok(abaAtiva('/e/gtech/pixels', 'gtech') === 'pixels', "abaAtiva('/e/gtech/pixels', 'gtech') → 'pixels'");
ok(abaAtiva('/e/gtech', 'gtech') === '', "abaAtiva('/e/gtech', 'gtech') → ''");
ok(abaAtiva('/e/gtech/configuracoes', 'gtech') === 'configuracoes', "abaAtiva('/e/gtech/configuracoes', 'gtech') → 'configuracoes'");
ok(abaAtiva('/e/outra/pixels', 'gtech') === null, 'endereço de outra empresa → null');
ok(abaAtiva('/e/gtech/nada', 'gtech') === null, 'aba que não existe → null');
ok(abaAtiva('/empresas', 'gtech') === null, '/empresas → null');
ok(abaAtiva('/e/gtech/pixels', '') === null, 'sem slug → null');

/* ---------------- c. A barra fixa de baixo saiu ---------------- */

console.log('\nc. A barra fixa de baixo saiu');

ok(!fs.existsSync(abs('src', 'components', 'layout', 'BarraDeAbas.tsx')), 'src/components/layout/BarraDeAbas.tsx não existe');
const citamBarra = FONTES.filter((f) => /BarraDeAbas|\bSECOES\b|\bsecaoAtiva\b/.test(f.texto)).map((f) => f.arquivo);
ok(citamBarra.length === 0, 'nenhum arquivo de src/ cita BarraDeAbas, SECOES ou secaoAtiva', JSON.stringify(citamBarra));

/* ---------------- d. AbasDaEmpresa ---------------- */

console.log('\nd. AbasDaEmpresa');

const abas = ler('src', 'components', 'layout', 'AbasDaEmpresa.tsx') ?? '';
ok(abas.includes('variant="line"'), 'usa variant="line"');
ok(abas.includes('alt=""'), 'a ilustração da aba é decorativa (alt="")');
ok(abas.includes('ABAS_DO_TOPO') && abas.includes('abaAtiva('), 'lê a lista e a aba ativa de abas-empresa.ts');

/* ---------------- e. LateralDeEmpresas ---------------- */

console.log('\ne. LateralDeEmpresas');

const lateral = ler('src', 'components', 'layout', 'LateralDeEmpresas.tsx') ?? '';
ok(lateral.includes('destinoAoTrocar'), 'contém destinoAoTrocar');
ok(lateral.includes('capi:empresa-trocada-fora'), 'contém capi:empresa-trocada-fora');
ok(
  /addEventListener\(\s*(EVENTO_EMPRESA_TROCADA_FORA|'capi:empresa-trocada-fora')/.test(lateral),
  'ouve o evento na janela (addEventListener)'
);

/* ---------------- f. Nenhum ícone fora do barril ---------------- */

console.log('\nf. Ícones só pelo barril (G9)');

const importamPacoteAntigo = FONTES.filter((f) => /['"]lucide-react['"/]/.test(f.texto)).map((f) => f.arquivo);
ok(importamPacoteAntigo.length === 0, 'nenhum arquivo de src/ importa lucide-react', JSON.stringify(importamPacoteAntigo));

/* ---------------- g. reacaoAoNavegar ---------------- */

console.log('\ng. reacaoAoNavegar');

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok(
  igual(
    reacaoAoNavegar({ pathname: '/e/alfa/pixels', slugDoEndereco: 'alfa', slugDoStore: 'alfa', temRascunho: true }),
    { tipo: 'nada' }
  ),
  'slugs iguais → nada (mesmo com rascunho)'
);
ok(
  igual(
    reacaoAoNavegar({ pathname: '/e/alfa/pixels', slugDoEndereco: 'alfa', slugDoStore: 'beta', temRascunho: false }),
    { tipo: 'ir', destino: destinoAoTrocar('/e/alfa/pixels', 'beta') }
  ) && destinoAoTrocar('/e/alfa/pixels', 'beta') === '/e/beta/pixels',
  'slugs diferentes sem rascunho → ir para destinoAoTrocar (/e/beta/pixels)'
);
ok(
  igual(
    reacaoAoNavegar({ pathname: '/e/alfa', slugDoEndereco: 'alfa', slugDoStore: 'beta', temRascunho: false }),
    { tipo: 'ir', destino: '/e/beta' }
  ),
  'na Visão geral → a Visão geral da empresa que vale'
);
ok(
  igual(
    reacaoAoNavegar({ pathname: '/e/alfa/regras', slugDoEndereco: 'alfa', slugDoStore: 'beta', temRascunho: true }),
    { tipo: 'manterAviso' }
  ),
  'slugs diferentes com rascunho → manterAviso'
);
ok(
  igual(
    reacaoAoNavegar({ pathname: '/e/alfa/regras', slugDoEndereco: 'alfa', slugDoStore: null, temRascunho: false }),
    { tipo: 'manterAviso' }
  ),
  'empresa do store fora da lista → manterAviso (nunca navega às cegas)'
);
ok(
  igual(
    reacaoAoNavegar({ pathname: '/empresas', slugDoEndereco: null, slugDoStore: 'beta', temRascunho: true }),
    { tipo: 'nada' }
  ),
  'fora de /e/ → nada'
);
ok(
  igual(
    reacaoAoNavegar({
      pathname: '/e/alfa/pixels',
      slugDoEndereco: 'alfa',
      slugDoStore: 'beta',
      temRascunho: false,
      slugComAviso: 'alfa',
    }),
    { tipo: 'ir', destino: '/e/beta/pixels' }
  ),
  'seguindo DENTRO da empresa do aviso (alfa), sem rascunho → ir para a que vale (/e/beta/pixels)'
);
ok(
  igual(
    reacaoAoNavegar({
      pathname: '/e/gama/regras',
      slugDoEndereco: 'gama',
      slugDoStore: 'beta',
      temRascunho: false,
      slugComAviso: 'alfa',
    }),
    { tipo: 'nada' }
  ),
  'o operador escolheu OUTRA empresa (gama) → nada: a escolha dele não é desfeita'
);

/** Cada `useEffect(...)` do fonte: o corpo e a lista de dependências. */
function efeitos(fonte) {
  const saida = [];
  const re = /(?:React\.)?useEffect\(/g;
  let casa;
  while ((casa = re.exec(fonte))) {
    const resto = fonte.slice(casa.index);
    const fim = /\}\s*,\s*\[([^\]]*)\]\s*\)/.exec(resto);
    if (!fim) continue;
    saida.push({ corpo: resto.slice(0, fim.index), deps: fim[1] });
  }
  return saida;
}
const doPathname = efeitos(lateral).filter(
  (e) => /\bpathname\b/.test(e.deps) && e.corpo.includes('reacaoAoNavegar(')
);
ok(doPathname.length === 1, 'a lateral tem um efeito de pathname que chama reacaoAoNavegar', `(${doPathname.length})`);
ok(
  doPathname.length === 1 && !/setEmpresaAtiva|escreverCookieEmpresa|\.setState\(/.test(doPathname[0].corpo),
  '🔴 esse efeito não escreve no store nem no cookie (sem setEmpresaAtiva, escreverCookieEmpresa, setState)'
);
ok(
  lateral.length > 0 && !/setEmpresaAtiva|escreverCookieEmpresa/.test(lateral),
  '🔴 a lateral inteira não escreve no store nem no cookie'
);

/* ---------------- h. V9: celular, teclado e leitor de tela ---------------- */

console.log('\nh. V9: celular, teclado e leitor de tela');

/** O texto sem os comentários de bloco de CSS. */
const semComentarioCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// (a) a aba e a empresa abertas são anunciadas como a página atual.
ok(abas.includes('aria-current'), '(a) AbasDaEmpresa.tsx marca a aba aberta com aria-current');
ok(lateral.includes('aria-current'), '(a) LateralDeEmpresas.tsx marca o item aberto com aria-current');
// A lista de empresas que a lateral desenha (`ListaDeEmpresas`) mora no seletor.
const seletor = ler('src', 'components', 'empresa', 'SeletorDeEmpresa.tsx') ?? '';
ok(
  lateral.includes('<ListaDeEmpresas') && seletor.includes('aria-current'),
  '(a) a empresa aberta na lista da lateral também leva aria-current (SeletorDeEmpresa.tsx)'
);

// (b) nenhuma navegação some por largura: as classes da casca antiga
// (menu só a partir de 80rem, grade de 5 colunas) não voltam.
const PASTA_LAYOUT = abs('src', 'components', 'layout');
const doLayout = FONTES.filter((f) => f.arquivo.startsWith('src/components/layout/'));
ok(doLayout.length > 0 && fs.existsSync(PASTA_LAYOUT), '(b) src/components/layout/ foi lido', `(${doLayout.length})`);
for (const proibida of ['xl:hidden', 'xl:flex', 'grid-cols-5']) {
  const com = doLayout.filter((f) => f.texto.includes(proibida)).map((f) => f.arquivo);
  ok(com.length === 0, `(b) nenhum arquivo de src/components/layout/ contém ${proibida}`, JSON.stringify(com));
}

// (c) toque e movimento têm regra no módulo da casca.
const modulo = ler('src', 'components', 'layout', 'console.module.css') ?? '';
const moduloSemComentario = semComentarioCss(modulo);
ok(/@media\s*\(\s*pointer:\s*coarse\s*\)/.test(moduloSemComentario), '(c) console.module.css tem @media (pointer: coarse)');
ok(
  /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/.test(moduloSemComentario),
  '(c) console.module.css tem @media (prefers-reduced-motion: reduce)'
);
ok(
  /min-height:\s*3rem/.test(moduloSemComentario),
  '(c) o alvo de toque é de 48px (min-height: 3rem)'
);

// (d) nenhuma cor escrita à mão no módulo (G7): só var(--…).
ok(modulo.length > 0 && !/\brgba?\(/.test(moduloSemComentario), '(d) console.module.css sem rgb( nem rgba( fora de comentário');
ok(modulo.length > 0 && !moduloSemComentario.includes('#'), '(d) console.module.css sem # fora de comentário');

// (e) tabela larga rola dentro do painel, e a página nunca rola para o lado.
/** O corpo de uma regra do módulo pelo seletor exato (a primeira que aparece). */
function regra(css, seletor) {
  const i = css.search(new RegExp(`(^|[\\s}])${seletor.replace('.', '\\.')}\\s*\\{`));
  if (i < 0) return null;
  const abre = css.indexOf('{', i);
  const fecha = css.indexOf('}', abre);
  return css.slice(abre + 1, fecha);
}
const rolagem = regra(moduloSemComentario, '.rolagemDoPainel');
ok(rolagem !== null && /overflow-x:\s*auto/.test(rolagem), '(e) .rolagemDoPainel tem overflow-x: auto', `(${rolagem ?? 'ausente'})`);
ok(rolagem !== null && /max-width:\s*100%/.test(rolagem), '(e) .rolagemDoPainel não passa da largura do painel (max-width: 100%)');

const atividade = ler('src', 'components', 'visao-geral', 'AtividadeRecente.tsx') ?? '';
const listaDeEmpresas = ler('src', 'app', '(console)', 'empresas', 'page.tsx') ?? '';
ok(atividade.includes('rolagemDoPainel'), '(e) AtividadeRecente.tsx usa rolagemDoPainel');
ok(listaDeEmpresas.includes('rolagemDoPainel'), '(e) empresas/page.tsx usa rolagemDoPainel');

/**
 * Cada `<table` do arquivo tem um `rolagemDoPainel` acima dele, e entre os
 * dois não fecha nenhum elemento (`</`): o invólucro é o pai de verdade.
 */
function tabelasSemInvolucro(texto) {
  const soltas = [];
  const re = /<table\b/g;
  let casa;
  while ((casa = re.exec(texto))) {
    const antes = texto.slice(0, casa.index);
    const onde = antes.lastIndexOf('rolagemDoPainel');
    if (onde < 0 || antes.slice(onde).includes('</')) {
      soltas.push(antes.split('\n').length);
    }
  }
  return soltas;
}
const comTabela = FONTES.filter(
  (f) =>
    (f.arquivo.startsWith('src/components/visao-geral/') || f.arquivo.startsWith('src/app/(console)/empresas/')) &&
    /<table\b/.test(f.texto)
);
ok(comTabela.length >= 2, '(e) as tabelas de visao-geral/ e de empresas/ foram achadas', `(${comTabela.length})`);
for (const f of comTabela) {
  const soltas = tabelasSemInvolucro(f.texto);
  ok(soltas.length === 0, `(e) ${f.arquivo}: toda <table tem o invólucro rolagemDoPainel`, soltas.length ? `(linhas ${soltas.join(', ')})` : '');
}
// A prova de que a régua pega: uma tabela fora do invólucro é apontada.
ok(
  tabelasSemInvolucro('<div className={s.rolagemDoPainel}></div>\n<table>').length === 1 &&
    tabelasSemInvolucro('<div className={s.rolagemDoPainel}>\n<table>').length === 0,
  '(e) a régua do invólucro reprova a tabela solta e aprova a embrulhada'
);

const modulosCss = FONTES.filter((f) => f.arquivo.startsWith('src/components/') && f.arquivo.endsWith('.module.css'));
const rolagemNaPagina = modulosCss
  .filter((f) =>
    [...semComentarioCss(f.texto).matchAll(/([^{}]*)\{([^{}]*)\}/g)].some(
      ([, seletor, corpo]) => /(^|[\s,:])(html|body)\b/.test(seletor) && /overflow-x:\s*scroll/.test(corpo)
    )
  )
  .map((f) => f.arquivo);
ok(
  modulosCss.length > 0 && rolagemNaPagina.length === 0,
  '(e) nenhum .module.css de src/components/ põe overflow-x: scroll em body/html',
  JSON.stringify(rolagemNaPagina)
);

// Teclado: o primeiro Tab pula para o conteúdo, e o anel da casca é o ciano.
ok(
  lateral.includes('Pular para o conteúdo') && lateral.indexOf('<PularParaConteudo') < lateral.indexOf('styles.lateralFixa}'),
  '"Pular para o conteúdo" vem antes da coluna fixa (primeiro Tab em qualquer largura)'
);
ok(
  /\.lateral :focus-visible[\s\S]*?\{[^}]*--border-focus/.test(moduloSemComentario),
  'o anel de foco da lateral, da gaveta e das abas é o --border-focus (ciano)'
);
const gaveta = ler('src', 'components', 'layout', 'GavetaDeEmpresas.tsx') ?? '';
ok(gaveta.includes('aria-label="Empresas"') && gaveta.includes('DialogTitle'), 'a gaveta tem nome para o leitor de tela (aria-label e DialogTitle)');
ok(
  gaveta.includes('styles.focoCiano') && gaveta.includes('styles.alvoDeToque') && !gaveta.includes('outline-tinta-texto'),
  'o botão da gaveta usa o anel ciano e o alvo de toque de 48px'
);

/* ---------------- Rede: nada saiu ---------------- */

ok(chamadas.length === 0, '🔴 nenhuma tentativa de rede (Meta, Cloudflare ou outra)', `(${chamadas.length})`);

console.log(falhas === 0 ? '\n  Casca do console: tudo OK.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
