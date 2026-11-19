/**
 * Quantas vendas estão paradas na Fila, esperando alguém enviar (T-M08, plano v8).
 *
 * Módulo neutro: sem `server-only`, sem disco e sem rede. A Visão geral (no
 * navegador) e a página de Eventos (no servidor) contam com a MESMA função,
 * para o aviso e a abertura da aba nunca discordarem.
 *
 * A régua é a do "na fila" do resumo (`resumirInbox`, em `inbox-resumo.ts`) e
 * do filtro "Na fila" da própria Fila: `novo` (ninguém abriu) ou `carregado`
 * (alguém abriu no formulário e ainda não enviou). Duas diferenças, de
 * propósito:
 *
 *  - não há recorte de período: venda de ontem parada continua esperando;
 *  - só venda (`ehCompra`): o aviso fala em "vendas".
 *
 * Teste interno e teste da plataforma ficam de fora, como em toda contagem.
 */
import { ehCompra } from '@/lib/inbox-resumo';

/** Só o que a contagem lê de um item da Fila. */
export interface ItemDaFila {
  status: string;
  evento?: string;
  eventoMeta?: string;
  testeInterno?: boolean;
  testePlataforma?: boolean;
  /** Ausente em linha antiga: vale a empresa padrão (`default`). */
  empresaId?: string;
}

/** Vendas reais da empresa que chegaram e ainda não foram enviadas. */
export function vendasEsperando(itens: readonly ItemDaFila[], empresaId: string): number {
  let quantas = 0;
  for (const item of itens) {
    if ((item.empresaId ?? 'default') !== empresaId) continue;
    if (item.testeInterno === true || item.testePlataforma === true) continue;
    if (item.status !== 'novo' && item.status !== 'carregado') continue;
    if (!ehCompra(item)) continue;
    quantas += 1;
  }
  return quantas;
}

/** A frase do aviso: "1 venda esperando você", "12 vendas esperando você". */
export function textoDeVendasEsperando(quantas: number): string {
  return quantas === 1
    ? '1 venda esperando você'
    : `${quantas.toLocaleString('pt-BR')} vendas esperando você`;
}
