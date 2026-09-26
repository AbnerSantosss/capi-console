#!/usr/bin/env node
/**
 * Um nome para cada coisa — o verificador de vocabulário da tela (V6 do plano
 * v7; Tarefa 10 do plano v6). Roda em `npm run check`, logo depois do
 * `check:contrast`.
 *
 * O glossário (plano v6 §2.2) diz o nome de cada coisa NA TELA:
 *
 *   Pixel ............ nunca "Marca", "Destino" nem "Fonte de dados"
 *   Fila ............. nunca "Caixa de entrada"
 *   Enviar (verbo) ... nunca "Disparar" nem "Disparo"
 *   Regra ............ nunca "roteamento"
 *   Sites permitidos . nunca "Domínios autorizados"
 *   Repasse .......... nunca "Retornos" nem "Destino de retorno"
 *   Teste interno .... nunca "Testes da equipe"
 *   Fonte ............ nunca "Fontes de dados" nem "Integrações"
 *   hash SHA-256 ..... nunca "criptografia" (SHA-256 é hash, não cifra)
 *   F5 ............... nunca "sobrevive ao Safari"
 *   "Conectado" ...... só com prova; nas telas da Visão geral e do Domínio,
 *                      onde a palavra prometeria o que ninguém conferiu, ela
 *                      é proibida
 *
 * O código NÃO muda de nome: `disparar`, `inbox`, `marcas`, `Marca` continuam
 * nas rotas, tipos, chaves de JSON e nomes de arquivo. Muda o que se lê.
 *
 * O que é lido (API do `typescript`, que já é devDependency): SÓ o texto que a
 * pessoa vê.
 *
 *   - texto JSX (`<p>…</p>`);
 *   - strings e templates nas props de texto (`title`, `label`, `placeholder`,
 *     `aria-label`, `description`, `helper`, `children` e afins) e dentro de
 *     `{…}` filho de JSX;
 *   - valores de chaves de texto em objetos (`titulo`, `descricao`,
 *     `explicacao`, `description` do toast…), argumentos de `toast(…)` e de
 *     `new Error(…)` num componente (a mensagem vira toast);
 *   - em posição ambígua (um `return`, uma constante, um item de lista), a
 *     string conta quando parece frase: tem espaço, maiúscula ou acento.
 *     `'disparado'`, `'/api/inbox/disparar'` e `'tag.pageview'` são código.
 *
 *   Nas rotas de API (`src/app/api/**`), só as mensagens: os valores das
 *   chaves `erro`, `erros`, `mensagem` e `aviso`, que a tela mostra.
 *
 * Fica de fora: comentários (não são nós da árvore), nomes de símbolo,
 * `import`/`export`, `console.*`, `className`, `href`, `id`, `key`, chaves de
 * objeto, comparações (`status === 'disparado'`), `case`, índices, tipos
 * literais e as chamadas de código (`fetch`, `pedir`, `router.push`, `cn`…).
 *
 * Escopo: `src/components/**` menos `auth/` e `ui/`; `src/app/(console)/**`;
 * as mensagens de `src/app/api/**`; e as libs de texto de tela
 * (`src/lib/emq.ts` inteiro; `src/lib/tag-dominios.ts`, só a função
 * `textoDnsParaCliente`, que vira a mensagem copiada para o cliente).
 *
 * Exclusões e exceções ficam listadas abaixo, cada uma com arquivo, texto e
 * motivo. Não há exceção implícita.
 *
 * Uso: node scripts/vocabulario-check.mjs   (sai 1 se achar palavra proibida)
 *      node scripts/vocabulario-check.mjs --todas   (lista também as exceções)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOSTRAR_EXCECOES = process.argv.includes('--todas');
/** `--pulados`: lista as strings com palavra proibida que o verificador julgou código (para conferir o julgamento). */
const MOSTRAR_PULADOS = process.argv.includes('--pulados');
const pulados = [];

/* ------------------------------------------------------------------ */
/* 1. A lista proibida                                                 */
/* ------------------------------------------------------------------ */

/** Fronteira de palavra que entende acento (o `\b` do JS só vê ASCII). */
const A = '(?<![\\p{L}\\p{N}_])';
const Z = '(?![\\p{L}\\p{N}_])';
const termo = (fonte) => new RegExp(`${A}(?:${fonte})${Z}`, 'iu');

const PROIBIDAS = [
  { nome: 'Caixa de entrada', re: termo('caixa de entrada'), usar: 'Fila' },
  { nome: 'Disparar/Disparo', re: new RegExp(`${A}dispar(?!idade)[\\p{L}]*`, 'iu'), usar: 'Enviar / envio' },
  { nome: 'Marca/Marcas', re: termo('marcas?'), usar: 'Pixel' },
  { nome: 'Destino', re: termo('destinos?'), usar: 'Pixel (Meta) ou endereço (Repasse)' },
  { nome: 'Fontes de dados', re: termo('fontes? de dados'), usar: 'Pixel (é o nome da Meta) ou Fonte' },
  { nome: 'roteamento', re: termo('roteamentos?'), usar: 'Regra' },
  { nome: 'Domínios autorizados', re: termo('domínios? autorizados?'), usar: 'Sites permitidos' },
  { nome: 'Retornos', re: termo('retornos'), usar: 'Repasse' },
  { nome: 'Testes da equipe', re: termo('testes? da equipe'), usar: 'Teste interno' },
  { nome: 'Integrações', re: termo('integrações'), usar: 'Fontes / Regras' },
  { nome: 'sobrevive ao Safari', re: /sobrevive ao Safari/iu, usar: '(F5: não prometer)' },
  { nome: 'criptograf*', re: new RegExp(`${A}criptograf[\\p{L}]*`, 'iu'), usar: 'hash SHA-256' },
];

/** "Conectado" sem prova: proibido só nas telas que resumem estado. */
const CONECTADO = { nome: 'Conectado (sem prova)', re: termo('conectad[oa]s?'), usar: 'o estado medido' };
const PASTAS_DO_CONECTADO = ['/visao-geral/', '/dominio/'];

/* ------------------------------------------------------------------ */
/* 2. Escopo, exclusões e exceções                                     */
/* ------------------------------------------------------------------ */

/** `tela`: tudo o que a pessoa vê. `api`: só as mensagens. */
const ESCOPO = [
  { dir: 'src/components', modo: 'tela' },
  { dir: 'src/app/(console)', modo: 'tela' },
  { dir: 'src/app/api', modo: 'api' },
];

/** Libs cujos textos a tela mostra. `funcoes`: só dentro delas. */
const LIBS_DE_TELA = [
  { arquivo: 'src/lib/emq.ts', modo: 'tela' },
  { arquivo: 'src/lib/tag-dominios.ts', modo: 'tela', funcoes: ['textoDnsParaCliente'] },
];

/**
 * Fora do verificador, desde o primeiro commit dele (plano v7, rodada 1, M-9).
 * Prefixo de caminho, com `/` no fim para pasta.
 */
const EXCLUIDOS = [
  { caminho: 'src/components/auth/', motivo: 'login fica como no P0 (D5); ninguém edita' },
  { caminho: 'src/app/login/', motivo: 'login fica como no P0 (D5); ninguém edita' },
  { caminho: 'src/components/ui/', motivo: 'primitivos sem texto de produto; são do esp-visual-tema' },
  {
    caminho: 'src/app/api/fila-disparo/route.ts',
    motivo: 'rota aposentada em 410 pela C11; a mensagem cita o nome interno da rota e fica como a C11 deixou',
  },
];

/**
 * Exceções pontuais: arquivo, trecho do texto (comparado sem diferença de
 * maiúscula e com os espaços juntados) e motivo. Uma exceção só vale para a
 * palavra que ela nomeia, e só naquele trecho: a mesma palavra em outra frase
 * do mesmo arquivo é apontada.
 */
const MENU_DA_META =
  'caminho de menu no Gerenciador de Eventos da Meta: "Fontes de dados" é o nome que a pessoa vai achar na tela ' +
  'da Meta para chegar ao número do Pixel. Trocar o nome faria o passo mandar procurar um menu que não existe';
const MENU_DA_PLATAFORMA =
  'caminho de menu da plataforma de vendas (xWinner, admin.codigovencedor.com): "Integrações" é o nome do menu ' +
  'na tela da plataforma, não uma tela deste console';

const EXCECOES = [
  {
    arquivo: 'src/lib/tag-dominios.ts',
    palavra: 'Destino',
    texto: 'Aponta para (Destino/Valor)',
    motivo:
      'nome do campo no painel de DNS do cliente (Registro.br, Hostinger e outros chamam de "Destino" ou "Valor"); ' +
      'não é o Pixel. O registro para o cliente precisa dizer tipo, nome e destino. tag-dominios.ts não é tocado nesta rodada',
  },
  { arquivo: 'src/components/brand/BrandDialog.tsx', palavra: 'Fontes de dados', texto: 'Gerenciador de Eventos → Fontes de dados →', motivo: MENU_DA_META },
  { arquivo: 'src/components/empresa/EmpresaDialog.tsx', palavra: 'Fontes de dados', texto: 'Gerenciador de Eventos → Fontes de dados →', motivo: MENU_DA_META },
  { arquivo: 'src/components/guide/conteudo.ts', palavra: 'Fontes de dados', texto: 'Fontes de dados → o número fica abaixo do nome', motivo: MENU_DA_META },
  { arquivo: 'src/components/guide/conteudo.ts', palavra: 'Fontes de dados', texto: 'Gerenciador de Eventos → Fontes de dados → selecione o Pixel', motivo: MENU_DA_META },
  { arquivo: 'src/components/guide/conteudo.ts', palavra: 'Integrações', texto: 'Na plataforma de vendas → Integrações → Webhooks', motivo: MENU_DA_PLATAFORMA },
  { arquivo: 'src/components/instalacao/WebhookInstalacao.tsx', palavra: 'Integrações', texto: 'Integrações → aba', motivo: MENU_DA_PLATAFORMA },
];

/**
 * PENDÊNCIAS FORA DA V6 — não são exceções legítimas: são palavras proibidas
 * de verdade em arquivos que a lista "Pode tocar" da V6 (plano v7 §4) não
 * inclui. A V6 não os edita; o verificador os deixa passar, um a um, pelo
 * trecho exato, para que o `check` fique verde sem esconder nada. Quem tocar
 * estes arquivos troca o texto e APAGA a linha daqui. Uma pendência cujo
 * trecho sumiu do arquivo aparece como aviso na saída ("pendência resolvida").
 */
const FORA_DA_V6 = 'arquivo fora da lista "Pode tocar" da V6; o texto fica para quem tocar o arquivo (V7 ou ajuste da sessão principal)';
const PENDENTES_FORA_DA_V6 = [
  { arquivo: 'src/components/common/ErrorSummary.tsx', palavra: 'Disparar/Disparo', texto: 'Corrija 1 campo antes de disparar', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/common/ErrorSummary.tsx', palavra: 'Disparar/Disparo', texto: 'campos antes de disparar', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/dispatch/ConfirmDialog.tsx', palavra: 'Marca/Marcas', texto: 'Não há código de teste ativo nesta marca.', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/event/TransactionSection.tsx', palavra: 'Disparar/Disparo', texto: 'se o Pixel também disparar', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/guide/PathCard.tsx', palavra: 'Disparar/Disparo', texto: 'Quem dispara', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/integrations/ListaDeTestes.tsx', palavra: 'Disparar/Disparo', texto: 'o console para de disparar sozinho', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/integrations/ListaDeTestes.tsx', palavra: 'Disparar/Disparo', texto: 'pode ser disparado por você', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/painel/ListaDePessoas.tsx', palavra: 'Disparar/Disparo', texto: 'carregado no disparo', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/painel/ListaDePessoas.tsx', palavra: 'Testes da equipe', texto: 'teste da equipe fora da lista', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/painel/ListaDePessoas.tsx', palavra: 'Testes da equipe', texto: 'Esconder testes da equipe', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/painel/ListaDePessoas.tsx', palavra: 'Testes da equipe', texto: 'Mostrar testes da equipe', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/painel/ListaDePessoas.tsx', palavra: 'Testes da equipe', texto: 'Nem com os testes da equipe à mostra', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/painel/ListaDePessoas.tsx', palavra: 'Testes da equipe', texto: 'tudo o que entrou seja teste da equipe', motivo: FORA_DA_V6 },
  { arquivo: 'src/components/visao-geral/AtividadeRecente.tsx', palavra: 'Testes da equipe', texto: 'sem teste da equipe', motivo: FORA_DA_V6 },
  {
    arquivo: 'src/app/api/relay/route.ts',
    palavra: 'Destino',
    texto: 'Destino não encontrado.',
    motivo:
      'scripts/rotas-api.test.mjs:729 (test:rotas, dentro do check) compara este texto exato, e o teste não está na ' +
      'lista "Pode tocar" da V6. Trocar para "Endereço de repasse não encontrado." junto com o teste, na mesma tarefa',
  },
];

const EXTENSOES = ['.ts', '.tsx'];

/* ------------------------------------------------------------------ */
/* 3. Onde a string está: texto de tela ou código?                     */
/* ------------------------------------------------------------------ */

/** Props de JSX que são texto para a pessoa. */
const PROPS_DE_TEXTO = new Set([
  'title', 'label', 'placeholder', 'aria-label', 'aria-description', 'aria-valuetext', 'aria-roledescription',
  'description', 'helper', 'children', 'alt', 'hint', 'subtitle', 'caption', 'tooltip', 'heading',
  'titulo', 'subtitulo', 'rotulo', 'texto', 'descricao', 'explicacao', 'mensagem', 'legenda', 'dica',
  'ajuda', 'aviso', 'erro', 'resumo', 'detalhe', 'acao', 'vazio', 'confirmLabel', 'cancelLabel',
]);

/** Props de JSX que são código, mesmo com espaço dentro. */
const PROPS_DE_CODIGO = new Set([
  'className', 'class', 'href', 'id', 'key', 'htmlFor', 'type', 'name', 'value', 'defaultValue', 'role',
  'variant', 'size', 'tone', 'tom', 'icon', 'icone', 'as', 'target', 'rel', 'src', 'srcSet', 'sizes',
  'method', 'action', 'pattern', 'inputMode', 'autoComplete', 'style', 'viewBox', 'd', 'fill', 'stroke',
  'xmlns', 'aria-controls', 'aria-describedby', 'aria-labelledby', 'aria-live', 'aria-current',
  'aria-haspopup', 'aria-expanded', 'aria-hidden', 'aria-selected', 'aria-checked', 'aria-disabled',
  'aria-orientation', 'aria-invalid', 'aria-busy', 'aria-atomic', 'aria-relevant', 'aria-sort', 'lang',
  'dir', 'form', 'accept', 'download', 'side', 'align', 'orientation', 'state', 'estado', 'modo', 'rota',
  'aba', 'vista', 'evento', 'status', 'marca', 'marcaId', 'empresaId', 'slug', 'x', 'y', 'valor',
]);

/** Chaves de objeto cujo valor é texto para a pessoa. */
const CHAVES_DE_TEXTO = new Set([...PROPS_DE_TEXTO, 'message', 'erros', 'motivo', 'frase', 'corpo', 'nota', 'porque', 'porQue', 'oQueFazer', 'proximoPasso']);

/** Chaves de objeto cujo valor é código, mesmo com espaço dentro. */
const CHAVES_DE_CODIGO = new Set([...PROPS_DE_CODIGO, 'base', 'classe', 'classes', 'caminho', 'url', 'path', 'method', 'headers', 'tipo', 'kind', 'event_name', 'eventName', 'cor', 'color', 'chave', 'campo', 'regex']);

/**
 * Só estas chaves contam nas rotas de API (o plano: "só erro, erros, mensagem,
 * aviso"). `message` é a chave do zod (`refine(…, { message })`), que a rota
 * devolve dentro de `erros`.
 */
const CHAVES_DA_API = new Set(['erro', 'erros', 'mensagem', 'aviso', 'message']);

/** Chamadas das rotas cujo argumento vira `erro`/`erros` na resposta. */
const ehChamadaDeMensagemDaApi = (quem) => {
  if (quem === 'respostaErro' || quem === 'erroDeRota') return true;
  const partes = quem.split('.');
  return partes.length > 1 && ['max', 'min', 'length', 'regex', 'refine', 'superRefine', 'nonempty', 'email', 'url'].includes(partes.pop().trim());
};

/** Chamadas cujo argumento é texto para a pessoa. */
const CHAMADAS_DE_TEXTO = /^(toast(\.\w+)?|alert|confirm|prompt|set(Erro|Mensagem|Aviso|Motivo|Texto|Status)\w*|avisar\w*|mostrar\w*)$/;

/** Chamadas cujo argumento é código, mesmo com espaço dentro. */
const CHAMADAS_DE_CODIGO =
  /^(console\.\w+|cn|clsx|cva|twMerge|fetch|pedir\w*|require|import|redirect|permanentRedirect|notFound|router\.\w+|\w+\.(push|replace|prefetch|get|set|has|delete|append|getItem|setItem|removeItem|includes|startsWith|endsWith|indexOf|lastIndexOf|split|match|matchAll|test|search|addEventListener|removeEventListener|dispatchEvent|querySelector|querySelectorAll|getElementById|closest|toLocaleString|toLocaleDateString|toLocaleTimeString|localeCompare|padStart|padEnd|at)|localStorage\.\w+|sessionStorage\.\w+|document\.\w+|JSON\.\w+|Symbol|URL|URLSearchParams|RegExp|Headers|Request|Response|EventSource|CustomEvent|Event|BroadcastChannel|Intl\.\w+|NextResponse\.\w+|useSearchParams|usePathname|useRouter|useState|useRef|useMemo|useCallback|useEffect|useId|z\.\w+|describe|it|test|assert\w*)$/;

const nomeDe = (n) => {
  if (!n) return '';
  if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return n.text;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  if (ts.isPropertyAccessExpression(n)) return `${nomeDe(n.expression)}.${n.name.text}`;
  if (ts.isJsxNamespacedName?.(n)) return `${n.namespace.text}:${n.name.text}`;
  return n.getText?.() ?? '';
};

/** Parece código: sem espaço, sem maiúscula, sem acento (`disparado`, `/api/x`, `tag.pageview`). */
const pareceCodigo = (s) => /^[a-z0-9_./:@#?&=%+*\-[\]{}$]*$/.test(s);

/**
 * Decide se a string está em posição de texto de tela.
 * Devolve 'tela', 'codigo' ou 'ambigua'.
 */
function posicao(no, modo) {
  let filho = no;
  let p = no.parent;
  while (p) {
    // --- sempre código ---
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode?.(p) || ts.isExternalModuleReference(p)) return 'codigo';
    if (ts.isLiteralTypeNode(p) || ts.isTypeNode(p)) return 'codigo';
    if (ts.isExpressionStatement(p) && filho === p.expression) return 'codigo'; // 'use client'
    if (ts.isCaseClause(p) && filho === p.expression) return 'codigo';
    if (ts.isElementAccessExpression(p) && filho === p.argumentExpression) return 'codigo';
    if (ts.isComputedPropertyName(p)) return 'codigo';
    if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind;
      const comparacao = [
        ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken,
        ts.SyntaxKind.InKeyword, ts.SyntaxKind.InstanceOfKeyword,
      ];
      if (comparacao.includes(op)) return 'codigo';
      if (op === ts.SyntaxKind.AmpersandAmpersandToken && filho === p.left) return 'codigo';
      if (op === ts.SyntaxKind.EqualsToken) {
        if (filho === p.left) return 'codigo';
        // x.textContent = '…' / x.title = '…'
        const alvo = nomeDe(p.left).split('.').pop() ?? '';
        if (['textContent', 'innerText', 'title', 'placeholder', 'alt'].includes(alvo)) return 'tela';
        return modo === 'api' ? 'codigo' : 'ambigua';
      }
      // + ?? || && (lado direito): segue subindo
    }
    if (ts.isConditionalExpression(p) && filho === p.condition) return 'codigo';

    // --- API: só as mensagens (chaves erro/erros/mensagem/aviso) ---
    if (modo === 'api') {
      if (ts.isPropertyAssignment(p)) {
        if (filho === p.name) return 'codigo';
        return CHAVES_DA_API.has(nomeDe(p.name)) ? 'tela' : 'codigo';
      }
      if (ts.isShorthandPropertyAssignment(p)) return 'codigo';
      // `const erros = issues.map((i) => \`…\`)`: a variável com nome de mensagem conta
      if (ts.isVariableDeclaration(p)) return CHAVES_DA_API.has(nomeDe(p.name)) ? 'tela' : 'codigo';
      if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
        const quem = nomeDe(p.expression);
        const ehArgumento = filho !== p.expression;
        // `respostaErro(erro, status, erros)` e `erroDeRota(e, mensagem)` (src/lib/erro-api.ts)
        // gravam o texto em `erro`/`erros`; as mensagens do zod viram `erros`.
        if (ehArgumento && ehChamadaDeMensagemDaApi(quem)) return 'tela';
        if (ehArgumento && /^console\.\w+$/.test(quem)) return 'codigo';
      }
      if (
        ts.isReturnStatement(p) ||
        ts.isExpressionStatement(p) ||
        ts.isThrowStatement(p) ||
        ts.isFunctionDeclaration(p) ||
        ts.isMethodDeclaration(p) ||
        ts.isBlock(p) ||
        ts.isSourceFile(p)
      ) {
        return 'codigo';
      }
      filho = p;
      p = p.parent;
      continue;
    }

    // --- JSX ---
    if (ts.isJsxAttribute(p)) {
      const nome = nomeDe(p.name);
      if (PROPS_DE_TEXTO.has(nome)) return 'tela';
      if (PROPS_DE_CODIGO.has(nome) || nome.startsWith('data-') || /^on[A-Z]/.test(nome)) return 'codigo';
      return 'ambigua';
    }
    if (ts.isJsxSpreadAttribute(p)) return 'codigo';
    if (ts.isJsxExpression(p) && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent))) return 'tela';

    // --- objetos ---
    if (ts.isPropertyAssignment(p)) {
      if (filho === p.name) return 'codigo';
      const chave = nomeDe(p.name);
      if (CHAVES_DE_TEXTO.has(chave)) return 'tela';
      if (CHAVES_DE_CODIGO.has(chave) || /^on[A-Z]/.test(chave)) return 'codigo';
      return 'ambigua';
    }
    if (ts.isShorthandPropertyAssignment(p)) return 'codigo';
    // `[…].join('\n')`, `'…'.trim()`: o texto segue sendo o valor; sobe
    if (ts.isPropertyAccessExpression(p)) {
      if (filho !== p.expression) return 'codigo';
      filho = p;
      p = p.parent;
      continue;
    }

    // --- chamadas ---
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      if (filho === p.expression) {
        if (ts.isPropertyAccessExpression(filho)) {
          filho = p;
          p = p.parent;
          continue;
        }
        return 'codigo';
      }
      const quem = nomeDe(p.expression);
      if (ts.isNewExpression(p) && /^(Error|TypeError|RangeError)$/.test(quem)) return 'tela';
      if (CHAMADAS_DE_TEXTO.test(quem)) return 'tela';
      if (CHAMADAS_DE_CODIGO.test(quem)) return 'codigo';
      return 'ambigua';
    }
    if (ts.isTaggedTemplateExpression(p)) return 'codigo';

    // --- fronteiras: a string ficou sem dono claro ---
    if (
      ts.isReturnStatement(p) ||
      ts.isVariableDeclaration(p) ||
      ts.isArrowFunction(p) ||
      ts.isParameter(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isEnumMember(p) ||
      ts.isExportAssignment(p) ||
      ts.isBlock(p) ||
      ts.isSourceFile(p)
    ) {
      return 'ambigua';
    }

    // parênteses, ternário (ramos), `+`, `??`, `||`, template, lista, `as`, `!`, `satisfies`: sobe
    filho = p;
    p = p.parent;
  }
  return 'ambigua';
}

/** O texto que a pessoa lê, de um nó de string ou template. */
function textoDe(no) {
  if (ts.isJsxText(no)) return no.text;
  if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) return no.text;
  if (ts.isTemplateExpression(no)) return [no.head.text, ...no.templateSpans.map((s) => s.literal.text)].join('…');
  return '';
}

/**
 * Tira do texto o que é nome de código escrito na tela: trecho entre crases
 * (`purchase_approved`), caminho em minúsculas (`config/marcas.json`,
 * `/api/marcas`, `logs/disparos.md`) e nome de arquivo. Nomes de arquivo e de
 * rota não mudam (glossário, "No código (não muda)"). Um caminho com
 * maiúscula (`Destino/Valor`) é frase e continua sendo lido.
 */
const semCodigo = (s) =>
  s
    .replace(/`[^`]*`/g, ' ')
    .replace(/(^|[\s(«"'])(?:[a-z0-9_.@[\]-]*\/)+[a-z0-9_.@[\]-]*(?=$|[\s)»"',;:.])/g, '$1 ')
    .replace(/(?<![\p{L}\p{N}_])[a-z0-9_-]+\.(?:json|jsonl|md|ts|tsx|mjs|js)(?![\p{L}\p{N}_])/gu, ' ');

/* ------------------------------------------------------------------ */
/* 4. A varredura                                                      */
/* ------------------------------------------------------------------ */

const barra = (c) => c.split(sep).join('/');
const rel = (abs) => barra(relative(RAIZ, abs));
const excluido = (r) => EXCLUIDOS.find((e) => (e.caminho.endsWith('/') ? r.startsWith(e.caminho) : r === e.caminho));

function arquivosDe(dirRel) {
  const raiz = join(RAIZ, dirRel);
  if (!existsSync(raiz)) return [];
  const fora = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (EXTENSOES.some((e) => nome.endsWith(e)) && !nome.endsWith('.d.ts')) fora.push(caminho);
    }
  };
  andar(raiz);
  return fora.sort();
}

/** Minúsculas e espaços juntados: o texto JSX quebra linha no meio da frase. */
const normal = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** A exceção vale para o arquivo, a palavra que ela nomeia e o trecho citado. */
function excecaoPara(r, regra, texto) {
  const t = normal(texto);
  return [...EXCECOES, ...PENDENTES_FORA_DA_V6].find(
    (e) => e.arquivo === r && regra.nome === e.palavra && t.includes(normal(e.texto))
  );
}

const achados = [];
const excecoesUsadas = [];
let lidos = 0;

function varrer(abs, modo, funcoes) {
  const r = rel(abs);
  const fonte = readFileSync(abs, 'utf8');
  const kind = abs.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const arvore = ts.createSourceFile(r, fonte, ts.ScriptTarget.Latest, true, kind);
  lidos++;

  const regras = [...PROIBIDAS];
  if (PASTAS_DO_CONECTADO.some((p) => `/${r}`.includes(p))) regras.push(CONECTADO);

  const dentroDasFuncoes = (no) => {
    if (!funcoes) return true;
    for (let p = no.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) && p.name && funcoes.includes(p.name.text)) return true;
    }
    return false;
  };

  const examinar = (no) => {
    const texto = textoDe(no);
    if (!texto.trim()) return;
    if (!dentroDasFuncoes(no)) return;
    const lido = semCodigo(texto);
    const casou = regras.filter((regra) => regra.re.test(lido));
    if (casou.length === 0) return;

    const onde = ts.isJsxText(no) ? 'tela' : posicao(no, modo);
    const pulado = onde === 'codigo' || (onde === 'ambigua' && (modo === 'api' || pareceCodigo(texto)));
    if (pulado) {
      if (MOSTRAR_PULADOS) {
        const { line } = arvore.getLineAndCharacterOfPosition(no.getStart(arvore));
        pulados.push(`${r}:${line + 1}  (${onde})  «${texto.replace(/\s+/g, ' ').trim().slice(0, 90)}»`);
      }
      return;
    }

    const { line } = arvore.getLineAndCharacterOfPosition(no.getStart(arvore));
    for (const regra of casou) {
      const exc = excecaoPara(r, regra, texto);
      const item = { arquivo: r, linha: line + 1, palavra: regra.nome, usar: regra.usar, texto: texto.replace(/\s+/g, ' ').trim() };
      if (exc) excecoesUsadas.push({ ...item, motivo: exc.motivo, regraUsada: exc });
      else achados.push(item);
    }
  };

  const andar = (no) => {
    if (
      ts.isJsxText(no) ||
      ts.isStringLiteral(no) ||
      ts.isNoSubstitutionTemplateLiteral(no) ||
      ts.isTemplateExpression(no)
    ) {
      examinar(no);
      if (!ts.isTemplateExpression(no)) return;
    }
    ts.forEachChild(no, andar);
  };
  andar(arvore);
}

for (const { dir, modo } of ESCOPO) {
  for (const abs of arquivosDe(dir)) {
    if (excluido(rel(abs))) continue;
    varrer(abs, modo);
  }
}
for (const { arquivo, modo, funcoes } of LIBS_DE_TELA) {
  const abs = join(RAIZ, arquivo);
  if (!existsSync(abs)) {
    console.error(`vocabulario: a lib de tela ${arquivo} sumiu; atualize LIBS_DE_TELA`);
    process.exit(1);
  }
  varrer(abs, modo, funcoes);
}

/* ------------------------------------------------------------------ */
/* 5. Saída                                                            */
/* ------------------------------------------------------------------ */

console.log(`vocabulario: ${lidos} arquivos lidos (componentes, rotas do console, mensagens da API, emq.ts e textoDnsParaCliente).`);
console.log(
  `vocabulario: ${EXCLUIDOS.length} exclusões, ${EXCECOES.length} exceção(ões) e ` +
    `${PENDENTES_FORA_DA_V6.length} pendência(s) fora da V6 listadas no script.`
);

// Exceção ou pendência que não casou com nada: o texto mudou ou saiu. Não
// reprova (quem corrige o texto não deve quebrar o check), mas avisa para
// apagar a linha, e a lista não cresce esquecida.
const semUso = [...EXCECOES, ...PENDENTES_FORA_DA_V6].filter((e) => !excecoesUsadas.some((u) => u.regraUsada === e));
if (semUso.length) {
  console.log(`\nvocabulario: ${semUso.length} exceção(ões)/pendência(s) sem uso — o trecho sumiu; apague a linha do script:`);
  for (const e of semUso) console.log(`  ${e.arquivo}  [${e.palavra}]  «${e.texto}»`);
}
const pendentesEmUso = excecoesUsadas.filter((u) => PENDENTES_FORA_DA_V6.includes(u.regraUsada));
if (pendentesEmUso.length) {
  console.log(`\nvocabulario: ${pendentesEmUso.length} texto(s) de tela ainda fora do glossário, em arquivos fora da V6 (pendência, não exceção):`);
  for (const p of pendentesEmUso) console.log(`  ${p.arquivo}:${p.linha}  [${p.palavra} → ${p.usar}]  «${p.texto.slice(0, 90)}»`);
}

if (MOSTRAR_PULADOS) {
  console.log(`\nJulgados como código (${pulados.length}):`);
  for (const p of pulados) console.log(`  ${p}`);
}

if (MOSTRAR_EXCECOES && excecoesUsadas.length) {
  console.log('\nExceções aplicadas:');
  for (const e of excecoesUsadas) {
    if (PENDENTES_FORA_DA_V6.includes(e.regraUsada)) continue;
    console.log(`  ${e.arquivo}:${e.linha}  [${e.palavra}]  «${e.texto.slice(0, 90)}»  — ${e.motivo}`);
  }
}

if (achados.length) {
  console.log(`\n${achados.length} texto(s) de tela fora do glossário (plano v6 §2.2):\n`);
  for (const a of achados) {
    console.log(`  ${a.arquivo}:${a.linha}  [${a.palavra} → ${a.usar}]  «${a.texto.slice(0, 110)}${a.texto.length > 110 ? '…' : ''}»`);
  }
  const porArquivo = new Map();
  for (const a of achados) porArquivo.set(a.arquivo, (porArquivo.get(a.arquivo) ?? 0) + 1);
  console.log(`\n${porArquivo.size} arquivo(s):`);
  for (const [arquivo, n] of [...porArquivo].sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(3)}  ${arquivo}`);
  process.exit(1);
}

console.log('vocabulario: nenhuma palavra fora do glossário na tela.');
