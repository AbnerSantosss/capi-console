/**
 * Resolve import relativo sem extensao ('./tag-eventos') para o .ts vizinho.
 *
 * Dentro de src/lib quem resolve e o bundler do Next, que dispensa a extensao.
 * O Node cru nao: ele exige o caminho completo. Enquanto os modulos de lib so
 * importavam TIPO um do outro isso nao aparecia (tipo some na compilacao), mas
 * config-store.ts passou a importar regrasSementeTag() de verdade — e ai TODO
 * teste que carrega config-store.ts morre no import, antes da primeira
 * asserçao.
 *
 * O que se perde sem isto: a suite inteira para de rodar e as travas de
 * dinheiro (heranca de fbc, lista branca de evento, dedup) deixam de ser
 * verificadas — passam a falhar em silencio, em producao, semanas depois.
 *
 * Carregado por `node --import ./scripts/_resolver-ts.mjs` nos scripts de
 * teste. So vale no teste: o build de producao nunca passa por aqui.
 */
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Duas resolucoes a mais, para os testes conseguirem carregar um `route.ts`
 * inteiro (C19, C20, C32 e o diff de C16b precisam do handler de verdade, nao
 * de uma copia da logica escrita de novo dentro do teste):
 *
 *  - `@/lib/x`     → `<raiz>/src/lib/x.ts`, o alias do tsconfig, que o Node cru
 *                    nao conhece;
 *  - `next/server` → `next/server.js`, porque o pacote do Next nao publica o
 *                    especificador sem extensao para o Node fora do bundler.
 *
 * Ambas so valem em teste. O build de producao nunca passa por aqui.
 */
const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = pathToFileURL(path.join(RAIZ, 'src') + path.sep).href;

/**
 * O sufixo `.ts` so pode ser acrescentado a import de DENTRO de src/. O Next
 * publica CommonJS que faz `require('../next-url')` — sem esta cerca, o gancho
 * reescrevia aquilo para `../next-url.ts` e o carregamento de `next/server`
 * morria com MODULE_NOT_FOUND.
 */
const dentroDoSrc = (pai) => typeof pai === 'string' && pai.startsWith(SRC);

/**
 * `server-only` vira modulo vazio.
 *
 * O pacote so existe para EXPLODIR quando um modulo de servidor e importado do
 * navegador: o entry padrao dele nada mais faz do que lancar. Sob
 * `--conditions=react-server` ele ja e um no-op, mas `scripts/rotas-api.test.mjs`
 * NAO pode usar essa condicao — carregar um route.ts arrasta
 * meta-capi -> meta-events -> lucide-react, e o react da condicao react-server
 * nao tem `createContext`. Entao o stub aqui faz o mesmo papel sem a condicao.
 * Nao ha nada a preservar: o modulo real nao exporta coisa nenhuma.
 */
const VAZIO = 'data:text/javascript,';

registerHooks({
  resolve(especificador, contexto, seguinte) {
    if (especificador === 'server-only') {
      return { url: VAZIO, format: 'module', shortCircuit: true };
    }
    if (especificador.startsWith('@/')) {
      const alvo = SRC + especificador.slice(2);
      return seguinte(path.extname(especificador) ? alvo : alvo + '.ts', contexto);
    }
    if (especificador === 'next/server') {
      return seguinte('next/server.js', contexto);
    }
    if (especificador.startsWith('.') && !path.extname(especificador) && dentroDoSrc(contexto.parentURL)) {
      return seguinte(especificador + '.ts', contexto);
    }
    return seguinte(especificador, contexto);
  },
});
