/**
 * Os quatro estados do Pixel — a funcao pura (8.2.3) e os textos (12.6).
 *
 * Esta funcao nao usa React, nao le store, nao busca nada: recebe tres fatos e
 * devolve um estado. E de proposito. O estado do Pixel e a frase mais cara de
 * errar do produto — quem le "Disparando sozinho" para de procurar o problema —
 * entao ele precisa ser conferivel lendo doze linhas, sem montar componente.
 *
 * A ORDEM DE AVALIACAO E OBRIGATORIA (8.2.3):
 *
 *   1. !temToken                        -> 🔴 Sem token
 *   2. !autoDisparo                     -> ⚪ So acumulando fila
 *   3. autoDisparo && zero regra 'auto' -> 🟡 Automatico ligado, mas nada acontece
 *   4. autoDisparo && >=1 regra 'auto'  -> 🟢 Disparando sozinho
 *
 * 🔴 VENCE TUDO. Um Pixel sem credencial com o interruptor ligado nao esta
 * "disparando sozinho": nao esta disparando nada. Mostrar 🟢 ali seria mentir
 * no estado mais caro de diagnosticar. Nao reordene os `if` abaixo.
 */

import type { RegraRoteamento } from '@/lib/config-store';

export type FaixaDePixel =
  | 'sem-token'
  | 'so-fila'
  | 'ligado-sem-regra'
  | 'disparando';

/** Tom visual — os mesmos nomes que `StatusDot`/`Callout` aceitam. */
export type TomDePixel = 'danger' | 'neutral' | 'warning' | 'success';

export interface EstadoDePixel {
  faixa: FaixaDePixel;
  /** O nome do estado. Sempre visivel, sempre escrito (PX-3 / SC 1.4.1). */
  rotulo: string;
  /** A explicacao A2 de 12.6, verbatim. Nunca reescreva por conta propria. */
  explicacao: string;
  tom: TomDePixel;
}

/**
 * Os textos de 12.6, palavra por palavra. Ficam numa constante, e nao inline
 * no `if`, para que uma auditoria de microcopy consiga comparar os quatro sem
 * ler o fluxo de controle.
 */
const TEXTO: Record<FaixaDePixel, Omit<EstadoDePixel, 'faixa'>> = {
  'sem-token': {
    rotulo: 'Sem token',
    explicacao:
      'Este Pixel não tem token de acesso. Nada pode ser enviado, nem automático nem manual.',
    tom: 'danger',
  },
  'so-fila': {
    rotulo: 'Só acumulando fila',
    explicacao: 'Disparo automático desligado. Tudo fica esperando você enviar.',
    tom: 'neutral',
  },
  'ligado-sem-regra': {
    rotulo: 'Automático ligado, mas nada acontece',
    explicacao:
      'O disparo automático está ligado neste Pixel, mas nenhuma regra está no modo automático. Nada será enviado sozinho.',
    tom: 'warning',
  },
  disparando: {
    rotulo: 'Disparando sozinho',
    explicacao:
      'Eventos que casam com uma regra automática vão para a Meta sem você fazer nada.',
    tom: 'success',
  },
};

export interface EntradaDeEstado {
  /** `MarcaPublica.temToken`. O cliente so conhece o booleano. */
  temToken: boolean;
  /**
   * O interruptor de disparo automatico DESTE Pixel.
   *
   * 🟠 COSTURA COM A FASE 6 — leia antes de ligar isto a um campo.
   * O campo do Pixel que responde por este parametro ainda NAO existe: ele
   * entra na FASE 6 (alteracao 15.A), junto do Switch. Ate la, quem chama
   * passa `false`, e o resultado honesto e que todo Pixel com credencial
   * mostra ⚪ — porque nada dispara sozinho por Pixel ainda.
   *
   * 🔴 Quando o campo existir, a UNICA leitura aceita e
   *        marca?.autoDisparo === true
   * Decisao irreversivel #12 / 9.5.1. Estao PROIBIDOS `!!x`, `x ?? true` e
   * `x !== false`: os tres transformam "campo ausente" em "ligado", e campo
   * ausente e exatamente o estado de todo Pixel que existe hoje no
   * config/marcas.json. O primeiro deploy da FASE 6 ligaria o disparo
   * automatico de todos eles de uma vez.
   */
  autoDisparo: boolean;
  /** Quantas regras em `auto`, ativas, apontam para ESTE Pixel. */
  regrasAuto: number;
}

/** A funcao. Quatro ramos, nesta ordem, sem excecao. */
export function estadoDePixel({
  temToken,
  autoDisparo,
  regrasAuto,
}: EntradaDeEstado): EstadoDePixel {
  // 1 — 🔴 vence tudo, inclusive o interruptor ligado.
  if (!temToken) return { faixa: 'sem-token', ...TEXTO['sem-token'] };
  // 2 — interruptor desligado: a fila enche, nada sai sozinho.
  if (!autoDisparo) return { faixa: 'so-fila', ...TEXTO['so-fila'] };
  // 3 — o "No Data" do painel: ligado e sem nenhuma regra para acionar.
  if (regrasAuto < 1)
    return { faixa: 'ligado-sem-regra', ...TEXTO['ligado-sem-regra'] };
  // 4 — o unico estado em que evento sai sem ninguem clicar.
  return { faixa: 'disparando', ...TEXTO.disparando };
}

/* ------------------------------------------------------------------ */
/* Contagem de regras por Pixel                                        */
/* ------------------------------------------------------------------ */

/**
 * Uma regra sem destino explicito vale para o Pixel `default`.
 *
 * Isto NAO e suposicao: e o que o servidor faz, medido em dois lugares —
 * `auto-dispatch.ts:53` (`params.marcas.length ? params.marcas : ['default']`)
 * e `webhook-handler.ts:263` (a mesma linha). A tela precisa contar do mesmo
 * jeito que o disparo roteia, senao a contagem vira ficcao.
 */
export function regraApontaPara(regra: RegraRoteamento, marcaId: string): boolean {
  const alvos = regra.marcas?.length ? regra.marcas : ['default'];
  return alvos.includes(marcaId);
}

/** Quantas regras ATIVAS em modo `auto` mandam evento para este Pixel. */
export function contarRegrasAuto(
  regras: RegraRoteamento[],
  marcaId: string
): number {
  return regras.filter(
    (r) => r.ativo && r.modo === 'auto' && regraApontaPara(r, marcaId)
  ).length;
}

/**
 * QUAIS regras automaticas mandam evento para este Pixel, pelo nome do evento.
 *
 * A confirmacao de ligar o automatico (9.7.1) precisa citar a contagem real, e
 * citar so o numero ainda deixa ligar as cegas: "3 regras" nao diz se uma
 * delas e Purchase. O nome mostrado e o evento da META — e ele que aparece no
 * Gerenciador de Eventos e e por ele que o operador reconhece o estrago.
 *
 * Duplicatas saem: duas regras que mandam Purchase nao viram "Purchase,
 * Purchase" no texto do dialogo.
 */
export function nomesDasRegrasAuto(
  regras: RegraRoteamento[],
  marcaId: string
): string[] {
  const nomes = regras
    .filter((r) => r.ativo && r.modo === 'auto' && regraApontaPara(r, marcaId))
    .map((r) => (r.eventoMeta || r.eventoOrigem || '').trim())
    .filter(Boolean);
  return [...new Set(nomes)];
}

/**
 * Quantas regras ATIVAS mandam evento para este Pixel, em qualquer modo que
 * de fato entregue — `auto` e `fila`.
 *
 * `ignorar` fica de fora porque uma regra de ignorar nao tem destino nenhum:
 * contar ela em "3 regras enviam para ele" seria inflar o numero da
 * confirmacao de apagar, que e justamente onde o numero precisa ser exato
 * (PX-11). Regra desativada tambem fica de fora: ela nao envia nada hoje.
 */
export function contarRegrasQueEnviam(
  regras: RegraRoteamento[],
  marcaId: string
): number {
  return regras.filter(
    (r) => r.ativo && r.modo !== 'ignorar' && regraApontaPara(r, marcaId)
  ).length;
}
