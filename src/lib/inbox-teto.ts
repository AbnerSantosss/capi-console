/**
 * O teto da memoria da Fila, POR EMPRESA (M-05).
 *
 * Antes a memoria guardava os ultimos 1000 itens somados de TODAS as empresas:
 * uma empresa com muita visita no site empurrava para fora as vendas de outra,
 * e o painel da empresa quieta ficava vazio. Agora cada empresa tem os ultimos
 * `LIMITE_POR_EMPRESA` itens DELA.
 *
 * Arquivo PURO: sem disco, sem relogio, sem `server-only`. `inbox.ts` chama as
 * funcoes daqui; o teste chama direto.
 *
 * M-07 (retencao por idade) entra AQUI, como uma segunda funcao de corte.
 * Nada neste arquivo apaga linha do disco: ele so decide o que fica na memoria.
 */

/** Quantos itens de CADA empresa ficam na memoria. */
export const LIMITE_POR_EMPRESA = 1000;

/**
 * Devolve uma lista nova com, no maximo, os ultimos `limite` itens de cada
 * empresa, na MESMA ordem em que vieram (do mais antigo para o mais novo).
 *
 * Item sem `empresaId` conta como `empresaPadrao`. A lista recebida nao e
 * alterada.
 */
export function manterUltimosPorEmpresa<T extends { empresaId?: string }>(
  itens: readonly T[],
  limite: number,
  empresaPadrao: string
): T[] {
  const vistos = new Map<string, number>();
  const mantidos: T[] = [];
  for (let k = itens.length - 1; k >= 0; k--) {
    const item = itens[k];
    const empresa = item.empresaId ?? empresaPadrao;
    const quantos = vistos.get(empresa) ?? 0;
    if (quantos >= limite) continue;
    vistos.set(empresa, quantos + 1);
    mantidos.push(item);
  }
  return mantidos.reverse();
}
