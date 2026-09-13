/**
 * Formato de `config/integracoes.json` visto pelo navegador.
 *
 * Nasceu na FASE A do plano multi-empresa: até então estas interfaces moravam
 * dentro de `IntegrationsPage.tsx`, e a tela de Instalação — que passou a ser
 * outra rota — não tinha como descrevê-las sem importar um componente de
 * cliente inteiro só para pegar um tipo. Módulo NEUTRO de propósito: nada aqui
 * importa `server-only`, então servidor e navegador usam a mesma definição.
 *
 * 🔴 Espelha `Integracoes` de `src/lib/config-store.ts`. Campo novo lá precisa
 * de campo novo aqui, senão a tela grava um objeto incompleto no PUT.
 */

import type { RegraRoteamento } from '@/lib/config-store';
import type { ConfigTag } from '@/lib/tag-dominios';

export type EventoRelay = 'dispatch.success' | 'dispatch.error' | 'inbox.received';

export interface Destino {
  id: string;
  nome: string;
  url: string;
  headers: Record<string, string>;
  eventos: EventoRelay[];
  ativo: boolean;
}

export interface Integracoes {
  /** `rotulo` é o apelido público da URL; o segredo continua sendo o último segmento. */
  entrada: { segredo: string; modo: 'fila' | 'auto'; rotulo?: string };
  regras: RegraRoteamento[];
  saida: Destino[];
  /** Chave publica da tag do site e dominios autorizados a usa-la. */
  tag: ConfigTag;
}

export interface Entrega {
  id: string;
  em: string;
  destinoNome: string;
  evento: string;
  httpStatus: number;
  duracaoMs: number;
  tentativas: number;
  ok: boolean;
  erro?: string;
}
