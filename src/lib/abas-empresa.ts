/**
 * As 8 abas do topo de uma empresa (V3 do v7; "Teste" em 25/09) — módulo puro.
 *
 * Nenhum Next, nenhum `window`, nenhum disco: o único import é o módulo puro
 * do endereço (`empresa-do-endereco.ts`), que também não importa nada. Por
 * isso roda igual na casca (`AbasDaEmpresa`, `Header`, `LateralDeEmpresas`) e
 * no teste (`scripts/casca.test.mjs`).
 *
 * O nome da lista é `ABAS_DO_TOPO`, e não `ABAS_DA_EMPRESA`, de propósito:
 * `rotas-console.ts` já tem uma `ABAS_DA_EMPRESA` com as 7 abas por nome (sem a
 * Visão geral, que não tem segmento). Duas constantes com o mesmo nome e
 * conteúdos diferentes seriam a primeira confusão de quem importar a errada.
 */

import { destinoAoTrocar, slugDoEndereco } from './empresa-do-endereco';

export interface AbaDoTopo {
  /** O pedaço do endereço depois de `/e/<slug>`: `''` é a Visão geral. */
  segmento: '' | 'dominio' | 'fontes' | 'pixels' | 'eventos' | 'teste' | 'regras' | 'configuracoes';
  /** O nome que o operador lê na aba e na trilha do cabeçalho. */
  rotulo: string;
  /** A ilustração da aba, em `public/brand/nav/` (72px, desenhada a 36px). */
  icone: string;
}

/**
 * As 8 abas, na ordem do desenho do dono. "Teste" (25/09) entrou depois de
 * Eventos, com a ilustração de Eventos emprestada até ganhar a arte própria.
 */
export const ABAS_DO_TOPO: ReadonlyArray<AbaDoTopo> = [
  { segmento: '', rotulo: 'Visão geral', icone: '/brand/nav/visao-geral-72.png' },
  { segmento: 'dominio', rotulo: 'Domínio', icone: '/brand/nav/dominio-72.png' },
  { segmento: 'fontes', rotulo: 'Fontes', icone: '/brand/nav/fontes-72.png' },
  { segmento: 'pixels', rotulo: 'Pixels', icone: '/brand/nav/pixels-72.png' },
  { segmento: 'eventos', rotulo: 'Eventos', icone: '/brand/nav/eventos-72.png' },
  // PENDENTE: arte própria (`teste-72.png`). Por ora, a mesma de Eventos.
  { segmento: 'teste', rotulo: 'Teste', icone: '/brand/nav/eventos-72.png' },
  { segmento: 'regras', rotulo: 'Regras', icone: '/brand/nav/regras-72.png' },
  {
    segmento: 'configuracoes',
    rotulo: 'Configurações',
    icone: '/brand/nav/configuracoes-72.png',
  },
];

/** O endereço de uma aba de uma empresa: `/e/<slug>` ou `/e/<slug>/<segmento>`. */
export function enderecoDaAba(slug: string, segmento: AbaDoTopo['segmento']): string {
  return segmento ? `/e/${slug}/${segmento}` : `/e/${slug}`;
}

/**
 * Qual das 8 abas o endereço mostra para a empresa `slug`: o `segmento` dela
 * (`''` na Visão geral), ou `null` quando o endereço não é uma aba DESTA
 * empresa (outra empresa, `/empresas`, `/guia`, aba que não existe).
 */
export function abaAtiva(pathname: string, slug: string): AbaDoTopo['segmento'] | null {
  if (!slug || slugDoEndereco(pathname) !== slug) return null;
  const resto = pathname.slice(`/e/${slug}`.length).replace(/^\//, '');
  const aba = ABAS_DO_TOPO.find((a) => a.segmento === resto);
  return aba ? aba.segmento : null;
}

/** O rótulo da aba que o endereço mostra, para a trilha do cabeçalho. */
export function rotuloDaAba(pathname: string, slug: string): string | null {
  const segmento = abaAtiva(pathname, slug);
  if (segmento === null) return null;
  return ABAS_DO_TOPO.find((a) => a.segmento === segmento)?.rotulo ?? null;
}

/**
 * O que o ouvinte de outra aba faz quando o endereço muda com o aviso de
 * "outra aba trocou a empresa" ainda de pé (ressalva 1 da revisão da V2:
 * nunca mostrar dados de uma empresa sob o endereço de outra).
 *
 *  - `nada`: o endereço já é da empresa que está valendo (ou nem é página de
 *    empresa, ou é de OUTRA empresa que o operador escolheu abrir). O aviso
 *    perdeu o objeto e pode sair.
 *  - `ir`: o endereço é de outra empresa e não há rascunho a perder. Vai para
 *    a mesma tela na empresa que está valendo (`destinoAoTrocar`).
 *  - `manterAviso`: há rascunho, ou não se sabe o slug da empresa que está
 *    valendo. Nada se move sozinho; o aviso fixo continua dizendo de quem são
 *    os dados na tela e oferecendo "Recarregar agora".
 *
 * Nunca decide escrever no store nem no cookie: escrever faria duas abas
 * trocarem uma com a outra sem fim.
 */
export type ReacaoAoNavegar =
  | { tipo: 'nada' }
  | { tipo: 'ir'; destino: string }
  | { tipo: 'manterAviso' };

export interface SituacaoAoNavegar {
  /** O endereço novo, para montar o destino. */
  pathname: string;
  /** O slug que o endereço novo diz (`slugDoEndereco`), ou `null` fora de `/e/`. */
  slugDoEndereco: string | null;
  /** O slug da empresa ativa no store, ou `null` quando ela não está na lista. */
  slugDoStore: string | null;
  /** Há rascunho sem salvar na tela (`rascunhoSujo` do store). */
  temRascunho: boolean;
  /**
   * O slug da empresa que a tela mostrava quando o aviso subiu. O perigo é
   * só um: seguir navegando DENTRO dessa empresa, porque a árvore dela não
   * remonta (mesma `key`) e ninguém realinha o store. Se o endereço novo é de
   * OUTRA empresa, o operador escolheu ir para lá (lista, link, endereço
   * digitado): a árvore remonta e o `EmpresaDoEndereco` alinha o store a ela.
   * Mandá-lo para a empresa do store seria desfazer a escolha dele.
   */
  slugComAviso?: string | null;
}

export function reacaoAoNavegar({
  pathname,
  slugDoEndereco: slugDaTela,
  slugDoStore,
  temRascunho,
  slugComAviso,
}: SituacaoAoNavegar): ReacaoAoNavegar {
  if (!slugDaTela) return { tipo: 'nada' };
  if (slugComAviso && slugComAviso !== slugDaTela) return { tipo: 'nada' };
  if (slugDoStore === slugDaTela) return { tipo: 'nada' };
  if (!slugDoStore || temRascunho) return { tipo: 'manterAviso' };
  return { tipo: 'ir', destino: destinoAoTrocar(pathname, slugDoStore) };
}
