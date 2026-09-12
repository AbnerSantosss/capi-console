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

registerHooks({
  resolve(especificador, contexto, seguinte) {
    if (especificador.startsWith('.') && !path.extname(especificador)) {
      return seguinte(especificador + '.ts', contexto);
    }
    return seguinte(especificador, contexto);
  },
});
