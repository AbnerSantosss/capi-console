import 'server-only';

import { listarMarcas, type Marca } from '@/lib/config-store';

/**
 * A trava do Pixel (PARTE 9, alteracao 9.B).
 *
 * O modelo inteiro cabe numa frase (§9.3.1):
 *
 *   A REGRA responde "este evento deve ser automatico?".
 *   O PIXEL responde "eu aceito disparo automatico?".
 *   O evento so sai sozinho quando as DUAS respostas forem sim.
 *
 * Este arquivo e o "UM lugar" exigido pela regra 2 de §9.5.1. Ele existe como
 * modulo proprio — e nao inline no `webhook-handler.ts` como o rascunho do
 * blueprint sugere — porque ha DOIS caminhos que decidem disparo automatico:
 * o webhook da plataforma (`webhook-handler.ts`) e a tag do site
 * (`tag-handler.ts`). Espalhar a mesma decisao por dois arquivos e exatamente
 * a "segunda fonte de verdade" que a regra 2 proibe; uma funcao compartilhada
 * e o oposto disso.
 *
 * `auto-dispatch.ts` NAO re-decide: recebe `marcasAuto` pronto. A unica coisa
 * que ele faz com o campo e uma conferencia final que so sabe RECUSAR (B4-a).
 */

/** Modo efetivo de UM pixel para UM evento. `ignorar` nunca chega aqui (§9.5.1 regra 3). */
export type ModoEfetivo = 'auto' | 'fila';

/**
 * Por que o item ficou na fila. Vocabulario fechado de §9.4.3.
 *
 * Alimenta o texto da tela e nada mais: nenhuma decisao le este campo.
 */
export type MotivoFila = 'regra-em-fila' | 'auto-do-pixel-desligado' | 'sem-token';

export interface DecisaoPorMarca {
  /** Modo efetivo de cada marca-alvo. Sempre tem uma entrada por marca pedida. */
  modoPorMarca: Record<string, ModoEfetivo>;
  /** So as marcas que ficaram em `fila`, com o porque. */
  motivoFila: Record<string, MotivoFila>;
  /** As marcas que podem sair sozinhas agora. E o que vai para `dispararItem`. */
  marcasAuto: string[];
}

/**
 * 🔴 A UNICA leitura aceita do campo, em qualquer lugar do codigo (§9.5.1 regra 1).
 *
 * PROIBIDOS: `!!marca.autoDisparo`, `marca.autoDisparo ?? true`,
 * `marca.autoDisparo !== false`. Os tres LIGAM o automatico quando o campo
 * falta — e ele falta em todo `marcas.json` gravado antes da FASE 6.
 */
export function pixelAceitaAuto(marca: Marca | undefined): boolean {
  return marca?.autoDisparo === true;
}

/** Decisao vazia: usada quando o evento e `ignorar` e nao ha destino nenhum. */
export const SEM_DECISAO: DecisaoPorMarca = Object.freeze({
  modoPorMarca: Object.freeze({}) as Record<string, ModoEfetivo>,
  motivoFila: Object.freeze({}) as Record<string, MotivoFila>,
  marcasAuto: Object.freeze([]) as unknown as string[],
});

/**
 * Aplica a trava do Pixel DEPOIS da regra e ANTES do envio (B4-b).
 *
 * Ordem das perguntas, e ela importa para o motivo que a tela mostra:
 *   1. a regra nao pediu automatico  -> 'regra-em-fila'
 *   2. o Pixel nao aceita automatico -> 'auto-do-pixel-desligado'
 *   3. o Pixel aceita mas nao tem token/pixelId -> 'sem-token'
 *
 * O passo 3 nao esta no rascunho de §9.5, mas o vocabulario de §9.4.3 o prevê
 * e ele so RESTRINGE: ligar sem token ja e recusado no PUT (B3-e), porem o
 * token pode ser apagado depois, e sem token nada sai mesmo. Dizer "sem token"
 * e mais honesto do que deixar o item bater no disparo para descobrir la.
 *
 * Marca desconhecida cai em 'auto-do-pixel-desligado' de proposito: aqui NAO
 * ha o fallback de `acharMarca` para a primeira marca da lista. Mandar uma
 * conversao para o pixel errado por causa de um id digitado errado e pior do
 * que deixar o item na fila.
 */
export async function resolverModoPorMarca(
  modoDaRegra: 'auto' | 'fila' | 'ignorar',
  marcas: string[]
): Promise<DecisaoPorMarca> {
  const alvos = marcas.length ? marcas : ['default'];

  // Na duvida, fila: se o cadastro de marcas nao puder ser lido, nada sai.
  let todas: Marca[] = [];
  if (modoDaRegra === 'auto') {
    try {
      todas = await listarMarcas();
    } catch {
      todas = [];
    }
  }

  const modoPorMarca: Record<string, ModoEfetivo> = {};
  const motivoFila: Record<string, MotivoFila> = {};
  const marcasAuto: string[] = [];

  for (const id of alvos) {
    if (modoDaRegra !== 'auto') {
      modoPorMarca[id] = 'fila';
      motivoFila[id] = 'regra-em-fila';
      continue;
    }

    const marca = todas.find((m) => m.id === id);
    if (!pixelAceitaAuto(marca)) {
      modoPorMarca[id] = 'fila';
      motivoFila[id] = 'auto-do-pixel-desligado';
      continue;
    }

    if (!marca?.pixelId?.trim() || !marca?.accessToken?.trim()) {
      modoPorMarca[id] = 'fila';
      motivoFila[id] = 'sem-token';
      continue;
    }

    modoPorMarca[id] = 'auto';
    marcasAuto.push(id);
  }

  return { modoPorMarca, motivoFila, marcasAuto };
}

/**
 * A sonda de conexao NAO passa pela trava do Pixel — e isso e deliberado.
 *
 * O `ping` do botao "Testar" do xWinner so vira evento quando alguma marca de
 * destino tem `test_event_code`, e o que sai e sempre `ViewContent`, nunca uma
 * conversao (`EVENTO_DA_SONDA`, `webhook-handler.ts`). Aplicar a trava aqui
 * quebraria um recurso que ja funciona, contra a promessa da FASE 6 de que
 * "nada muda ate alguem clicar no Switch" e contra a proibicao §42 de remover
 * funcionalidade existente. Um teste de conexao nao e disparo automatico de
 * conversao: e o console se identificando para o Gerenciador de Eventos.
 */
export function decisaoDaSonda(marcas: string[]): DecisaoPorMarca {
  const alvos = marcas.length ? marcas : ['default'];
  const modoPorMarca: Record<string, ModoEfetivo> = {};
  for (const id of alvos) modoPorMarca[id] = 'auto';
  return { modoPorMarca, motivoFila: {}, marcasAuto: [...alvos] };
}
