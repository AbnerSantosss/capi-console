/**
 * O vocabulário das cenas (padrão visual HyperFrames, §2.2 e §2.3).
 *
 * - `Assunto` decide a COR de uma cena (o CSS lê `data-assunto`). Cor nunca é
 *   gosto: é o assunto do que a cena mostra.
 * - `Estado` vem SEMPRE do dado real. `esperando` é o único estado com laço
 *   contínuo, e só serve para espera de verdade fora do console (Domínio).
 *   `pausado` é âmbar parado: "falta alguém ligar algo".
 * - `Ordem` é a vez de cada peça entrar (atraso = ordem × defasagem).
 *
 * Os ícones vêm só do barril `@/components/ui/icones`.
 */

import {
  Code2,
  FlaskConical,
  Globe,
  ListFilter,
  Settings,
  Target,
  Webhook,
  Zap,
  type Icone,
} from '@/components/ui/icones';

export type Assunto =
  | 'tag'
  | 'dominio'
  | 'webhook'
  | 'pixel'
  | 'evento'
  | 'teste'
  | 'regra'
  | 'configuracoes';

export type Estado = 'ok' | 'esperando' | 'pausado' | 'erro' | 'apagado';

export type Ordem = 0 | 1 | 2 | 3 | 4;

/** Todos os assuntos, na ordem das abas. */
export const ASSUNTOS: readonly Assunto[] = [
  'tag',
  'dominio',
  'webhook',
  'pixel',
  'evento',
  'teste',
  'regra',
  'configuracoes',
];

/** O ícone padrão de cada assunto, para quem não tem um desenho próprio. */
export const ICONE_DO_ASSUNTO: Readonly<Record<Assunto, Icone>> = {
  tag: Code2,
  dominio: Globe,
  webhook: Webhook,
  pixel: Target,
  evento: Zap,
  teste: FlaskConical,
  regra: ListFilter,
  configuracoes: Settings,
};
