#!/usr/bin/env node
/**
 * Regras em rascunho separado (T10, T11) — tarefa C5 do plano de correções do
 * pacote 16.
 *
 * Os defeitos:
 *
 *   T10  a edição das regras morava DENTRO de `cfg` (`onChange` fazia
 *        `setCfg({ ...cfg, regras })`). Todo "Salvar" da tela mandava `cfg`
 *        inteiro, então salvar um e-mail em "Testes da equipe", ligar um
 *        destino de retorno ou sair do campo de URL gravava junto a regra que
 *        o operador ainda estava editando — inclusive uma regra automática pela
 *        metade, que passava a mandar venda para a Meta sem ninguém ter
 *        clicado em "Salvar regras".
 *   T11  no erro, o toast dizia só "Não foi possível salvar." e o `catch`
 *        chamava `carregar()`, que relia o disco e apagava o que tinha sido
 *        digitado, sem dizer por quê.
 *
 * O que este arquivo prova, lendo o fonte (o projeto não tem jsdom nem
 * testing-library, e dependência nova está fora do pacote — decisão P8 do
 * plano). O roteiro de clique do dono (R6) confere o comportamento no
 * navegador.
 *
 *   A  o rascunho das regras é um estado próprio, fora de `cfg`
 *   B  só `salvarRegras` grava regras, e o corpo do PUT dele é
 *      `{ regras, empresaId }` e nada mais
 *   C  o `salvar` das outras abas manda o corpo SEM `regras`, nenhum chamador
 *      passa regras, e o `cfg` dele nunca recebe o rascunho
 *   D  a tela avisa ("Regras alteradas, não salvas"), o botão fica em
 *      destaque, há "Descartar alterações", e o rascunho alimenta
 *      `marcarRascunho` (o aviso da troca de empresa vinda de outra aba)
 *   E  erro mostra o motivo do servidor (inclusive a lista `erros`), mantém o
 *      digitado (nenhum `carregar()` no `catch`) e recarregar só por botão
 *      explícito ("Descartar e recarregar")
 *   F  `carregar()` (botão "Atualizar", fim do "Testar destino") não apaga o
 *      rascunho das regras
 *
 * 🔴 Nenhuma rede e nenhum disco além da leitura dos fontes: este teste não
 * importa nada de `src/`, não chama `fetch` e não abre `config/` nem `logs/`.
 * Mesmo assim o `fetch` global é trocado por um que LANÇA — em especial para
 * graph.facebook.com e api.cloudflare.com —, para que um descuido futuro
 * falhe alto em vez de sair para a rede. Roda sem ACCESS_TOKEN.
 *
 * Uso: npm run test:regras-rascunho
 */
import fs from 'node:fs';

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

/**
 * O fonte sem comentários de bloco (inclusive os `{/* … *\/}` do JSX) e sem as
 * linhas que são só comentário `//` — o mesmo corte de `empresa-abas.test.mjs`.
 * Os comentários citam `setCfg({ ...cfg, regras })` e `carregar()` para
 * explicar o defeito; só o código conta.
 */
const semComentarios = (fonte) => fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const pagina = semComentarios(ler('../src/components/integrations/IntegrationsPage.tsx'));
const secao = semComentarios(ler('../src/components/integrations/RulesSection.tsx'));

/** Do caractere de abertura em `inicio` até o que o fecha, contando pares. */
function bloco(fonte, inicio, abre, fecha) {
  if (inicio < 0 || fonte[inicio] !== abre) return '';
  let fundo = 0;
  for (let i = inicio; i < fonte.length; i++) {
    if (fonte[i] === abre) fundo++;
    else if (fonte[i] === fecha && --fundo === 0) return fonte.slice(inicio, i + 1);
  }
  return '';
}

/**
 * O corpo `{ … }` de `const <nome> = [async] (…) => { … }`, de
 * `const <nome> = useCallback([async] (…) => { … }` ou de
 * `function <nome>(…) { … }`. Vazio se não existir.
 */
function corpoDaFuncao(fonte, nome) {
  const m =
    new RegExp(
      `const\\s+${nome}\\s*=\\s*(?:useCallback\\(\\s*)?(?:async\\s*)?\\([^)]*\\)\\s*(?::\\s*[^=]+)?=>\\s*\\{`
    ).exec(fonte) ?? new RegExp(`function\\s+${nome}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]+)?\\{`).exec(fonte);
  return m ? bloco(fonte, m.index + m[0].length - 1, '{', '}') : '';
}

/** O elemento JSX `<Nome …/>` inteiro, do `<` ao `/>`. */
const elementoJsx = (fonte, nome) => fonte.match(new RegExp(`<${nome}\\b[\\s\\S]*?\\/>`))?.[0] ?? '';

/** Os argumentos (entre parênteses) de cada chamada `nome(` — `nome` inteiro, não prefixo. */
function argumentosDasChamadas(fonte, nome) {
  const re = new RegExp(`(?<![\\w.])${nome}\\(`, 'g');
  const lista = [];
  let m;
  while ((m = re.exec(fonte))) lista.push(bloco(fonte, m.index + m[0].length - 1, '(', ')'));
  return lista;
}

/** O bloco `catch (…) { … }` de um corpo de função. */
function blocoCatch(corpo) {
  const m = /\bcatch\s*(?:\([^)]*\))?\s*\{/.exec(corpo);
  return m ? bloco(corpo, m.index + m[0].length - 1, '{', '}') : '';
}

/** A linha `body:` de cada `method: 'PUT'` de um trecho. */
function corposDePut(fonte) {
  const corpos = [];
  let i = fonte.indexOf("method: 'PUT'");
  while (i !== -1) {
    const b = fonte.indexOf('body:', i);
    corpos.push(b === -1 ? '' : fonte.slice(b, fonte.indexOf('\n', b)).trim());
    i = fonte.indexOf("method: 'PUT'", i + 1);
  }
  return corpos;
}

const elRegras = elementoJsx(pagina, 'RulesSection');
const corpoSalvar = corpoDaFuncao(pagina, 'salvar');
const corpoSalvarRegras = corpoDaFuncao(pagina, 'salvarRegras');
const corpoCarregar = corpoDaFuncao(pagina, 'carregar');

/* ---------------- A. Rascunho fora de cfg ---------------- */

console.log('\n  A. O rascunho das regras é estado próprio, fora de cfg');

ok(
  /const\s*\[\s*regrasRascunho\s*,\s*setRegrasRascunho\s*\]\s*=\s*useState\b/.test(pagina),
  '🔴 A1: IntegrationsPage tem o estado regrasRascunho / setRegrasRascunho'
);
ok(elRegras.length > 0, 'A2: IntegrationsPage renderiza <RulesSection …/>');
ok(
  !/setCfg\(\s*\{\s*\.\.\.cfg\s*,\s*regras\s*\}\s*\)/.test(pagina),
  '🔴 A3: nenhum setCfg({ ...cfg, regras }) — o rascunho não entra em cfg'
);
const onChangeRegras = elRegras.match(/\bonChange=\{([\s\S]*?)\}\s*\n/)?.[1] ?? '';
ok(
  /\bsetRegrasRascunho\b/.test(onChangeRegras) && !/\bsetCfg\b/.test(onChangeRegras),
  '🔴 A4: o onChange de <RulesSection> escreve no rascunho, não em cfg',
  onChangeRegras.trim().slice(0, 120)
);
const valorRegras = elRegras.match(/\bregras=\{([^}]*)\}/)?.[1]?.trim() ?? '';
const definicaoValor = /^\w+$/.test(valorRegras)
  ? (pagina.match(new RegExp(`const\\s+${valorRegras}\\s*=([^;]*);`))?.[1] ?? '')
  : '';
ok(
  /\bregrasRascunho\b/.test(valorRegras) || /\bregrasRascunho\b/.test(definicaoValor),
  'A5: <RulesSection regras=…> mostra o rascunho',
  valorRegras
);

/* ---------------- B. Só "Salvar regras" grava regras ---------------- */

console.log('\n  B. Só salvarRegras grava regras, e só com { regras, empresaId }');

ok(corpoSalvarRegras.length > 0, '🔴 B1: existe const salvarRegras = async (…) => { … }');
ok(/\bonSalvar=\{\s*salvarRegras\s*\}/.test(elRegras), '🔴 B2: <RulesSection onSalvar={salvarRegras}>');
const putsDeRegras = corposDePut(corpoSalvarRegras);
ok(
  putsDeRegras.length === 1 &&
    /^body:\s*JSON\.stringify\(\{\s*regras(?:\s*:\s*[\w.]+)?\s*,\s*empresaId\s*\}\),?$/.test(putsDeRegras[0]),
  '🔴 B3: o PUT de salvarRegras manda só { regras, empresaId }',
  JSON.stringify(putsDeRegras)
);
ok(
  argumentosDasChamadas(corpoSalvarRegras, 'setCfg').some((a) => /\bregras\b/.test(a)),
  'B4: no sucesso, salvarRegras põe as regras gravadas em cfg'
);

/* ---------------- C. Os outros "Salvar" não mandam regras ---------------- */

console.log('\n  C. O salvar das outras abas não manda regras');

ok(corpoSalvar.length > 0, 'C1: existe const salvar = async (…) => { … }');
const semRegras = corpoSalvar.match(/const\s*\{\s*regras\s*:\s*\w+\s*,\s*\.\.\.(\w+)\s*\}\s*=/)?.[1] ?? '';
ok(Boolean(semRegras), '🔴 C2: salvar tira regras do corpo (const { regras: _, ...resto } = …)', semRegras || '(nada)');
const putsDeSalvar = corposDePut(corpoSalvar);
ok(
  putsDeSalvar.length === 1 &&
    Boolean(semRegras) &&
    new RegExp(`^body:\\s*JSON\\.stringify\\(\\{\\s*\\.\\.\\.${semRegras}\\s*,\\s*empresaId\\s*\\}\\),?$`).test(putsDeSalvar[0]),
  '🔴 C3: o PUT de salvar manda { ...semRegras, empresaId }',
  JSON.stringify(putsDeSalvar)
);
ok(
  !putsDeSalvar.some((c) => /\bregras/.test(c)),
  'C4: a linha body: do PUT de salvar não cita regras',
  JSON.stringify(putsDeSalvar)
);
ok(!/\bregrasRascunho\b/.test(corpoSalvar), '🔴 C5: salvar não lê o rascunho das regras');
ok(
  argumentosDasChamadas(corpoSalvar, 'setCfg').every((a) => /\bregras\s*:\s*\w+\.regras\b/.test(a)),
  '🔴 C6: o setCfg de salvar mantém as regras gravadas (regras: <estado>.regras), nunca as do chamador',
  JSON.stringify(argumentosDasChamadas(corpoSalvar, 'setCfg'))
);
const chamadasDeSalvar = argumentosDasChamadas(pagina, 'salvar');
ok(chamadasDeSalvar.length >= 5, 'C7: as outras abas ainda gravam por salvar(…)', String(chamadasDeSalvar.length));
ok(
  chamadasDeSalvar.every((a) => !/\bregras\w*\b/i.test(a)),
  '🔴 C8: nenhuma chamada salvar(…) passa regras',
  JSON.stringify(chamadasDeSalvar.filter((a) => /\bregras\w*\b/i.test(a)))
);
const todosOsPuts = corposDePut(pagina);
ok(
  todosOsPuts.length === 2 && todosOsPuts.filter((c) => /\bregras\b/.test(c)).length === 1,
  '🔴 C9: a tela tem 2 PUTs e só UM (o de salvarRegras) leva regras',
  JSON.stringify(todosOsPuts)
);

/* ---------------- D. Aviso de regras não salvas ---------------- */

console.log('\n  D. Aviso de regras não salvas');

ok(/const\s+regrasSujas\s*=/.test(pagina), 'D1: existe regrasSujas');
ok(
  argumentosDasChamadas(pagina, 'marcarRascunho').some((a) => /\bregrasSujas\b/.test(a)),
  '🔴 D2: regrasSujas alimenta marcarRascunho (aviso da troca vinda de outra aba)',
  JSON.stringify(argumentosDasChamadas(pagina, 'marcarRascunho'))
);
ok(/\bsujas=\{\s*regrasSujas\s*\}/.test(elRegras), 'D3: <RulesSection sujas={regrasSujas}>');
ok(
  /<StatusDot\s+tone="warning"[^>]*>\s*Regras alteradas, não salvas\s*<\/StatusDot>/.test(secao),
  '🔴 D4: RulesSection mostra StatusDot warning "Regras alteradas, não salvas"'
);
const botaoSalvarRegras = secao.match(/<Button\b[^>]*>(?:(?!<\/Button>)[\s\S])*Salvar regras/)?.[0] ?? '';
ok(
  /\bvariant=\{\s*sujas\b/.test(botaoSalvarRegras),
  'D5: o botão "Salvar regras" fica em destaque quando há alteração (variant depende de sujas)',
  botaoSalvarRegras.split('\n')[0]
);
ok(
  /\bonDescartar\b/.test(secao) && /Descartar alterações/.test(secao) && /\bonDescartar=\{/.test(elRegras),
  'D6: há "Descartar alterações" nas regras, ligado a onDescartar'
);
ok(
  /addEventListener\(\s*'beforeunload'/.test(pagina) && /removeEventListener\(\s*'beforeunload'/.test(pagina),
  'D7: fechar a aba com regra não salva pede confirmação (beforeunload)'
);

/* ---------------- E. Erro: motivo e digitado intacto ---------------- */

console.log('\n  E. Erro mostra o motivo e mantém o digitado');

for (const [rotulo, corpo] of [
  ['salvar', corpoSalvar],
  ['salvarRegras', corpoSalvarRegras],
]) {
  const pega = blocoCatch(corpo);
  ok(pega.length > 0, `E1: ${rotulo} tem catch`);
  ok(!/\bcarregar\(/.test(pega), `🔴 E2: o catch de ${rotulo} não chama carregar() (não apaga o digitado)`);
  ok(
    /\btoast\.error\(/.test(pega) || /\bavisarErroAoSalvar\(/.test(pega),
    `E3: o catch de ${rotulo} mostra um toast de erro`
  );
}
const avisar = corpoDaFuncao(pagina, 'avisarErroAoSalvar');
const motivo = corpoDaFuncao(pagina, 'motivoDoErro');
ok(motivo.length > 0, 'E4: existe motivoDoErro(e)');
ok(
  /\bErroApi\b/.test(motivo) && /\.dados\b/.test(motivo) && /\berros\b/.test(motivo),
  '🔴 E5: motivoDoErro lê a lista erros do servidor (ErroApi.dados.erros), não só a mensagem geral'
);
ok(
  /\btoast\.error\([^)]*,\s*\{\s*description:[^\n]*\bmotivoDoErro\(/.test(avisar),
  '🔴 E6: o toast de erro (avisarErroAoSalvar) leva o motivo na descrição'
);
ok(/Descartar e recarregar/.test(pagina), '🔴 E7: recarregar é botão explícito ("Descartar e recarregar")');
ok(avisar.length > 0 && /Recarregar agora/.test(avisar), 'E8: no 409 (empresa trocada) o toast oferece "Recarregar agora"');

/* ---------------- F. carregar não apaga o rascunho ---------------- */

console.log('\n  F. carregar() não apaga o rascunho das regras');

ok(corpoCarregar.length > 0, 'F1: existe carregar');
ok(!/\bsetRegrasRascunho\(/.test(corpoCarregar), '🔴 F2: carregar ("Atualizar", "Testar destino") não mexe no rascunho das regras');
const descartar = corpoDaFuncao(pagina, 'descartarERecarregar');
ok(
  /\bcarregar\(/.test(descartar) && /\bsetRegrasRascunho\(/.test(descartar),
  'F3: "Descartar e recarregar" relê o disco E descarta o rascunho — só por clique'
);

/* ---------------- Fim ---------------- */

if (globalThis.fetch !== fetchFalso) {
  console.log('  FALHA  alguém trocou o fetch falso no meio do teste');
  falhas++;
}

console.log(
  falhas === 0
    ? '\n  Regras em rascunho: só "Salvar regras" grava regras, os outros Salvar não as mandam, o erro diz o motivo e o digitado fica.'
    : `\n  ${falhas} falha(s).`
);
process.exit(falhas === 0 ? 0 : 1);
