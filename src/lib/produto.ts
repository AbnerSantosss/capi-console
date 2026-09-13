/**
 * O nome do produto e o nome da plataforma de vendas, em fonte única.
 *
 * Por que existe: até aqui o console dizia "xWinner" em 28 arquivos — em texto
 * de tela, em rótulo de campo e em comentário — como se houvesse uma única
 * plataforma no mundo. Isso deixou de ser verdade no momento em que o produto
 * passou a rastrear conversão de qualquer plataforma: prometer "webhook do
 * xWinner" na primeira tela de um cliente que usa Hotmart é mentira logo na
 * instalação, e é justamente a tela onde não se pode errar.
 *
 * 🔴 O que NÃO entra aqui: fato sobre o xWinner continua dizendo "xWinner".
 * O formato A do payload é o formato do xWinner; o botão "Testar" que manda
 * `ping` é o do xWinner; o backoffice que só aceita URL sem cabeçalho é o dele.
 * Trocar esses por "a plataforma" apagaria a informação que faz o comentário
 * valer a pena. A regra é: virou genérico quando "xWinner" queria dizer apenas
 * "quem manda o webhook".
 */

/**
 * Nome do produto no cabeçalho e no `<title>`.
 *
 * Mantém o texto que já está publicado — ele nunca citou plataforma nem
 * empresa, então nada muda na tela nesta fase. O valor vive aqui para que
 * renomear o produto seja uma linha, e não uma varredura.
 */
export const NOME_PRODUTO = 'Meta CAPI Console';

/** Como o produto se descreve para buscador e prévia de link. */
export const DESCRICAO_PRODUTO =
  'Console de rastreamento de conversões para a Meta Conversions API.';

/**
 * O nome da plataforma de vendas de uma empresa, pronto para entrar no meio de
 * uma frase.
 *
 * Devolve `'a plataforma'` quando não há nome — com artigo, porque o texto de
 * tela diz "cadastre a URL nova em ${nomeDaPlataforma(p)}" e um retorno sem
 * artigo produziria "cadastre a URL nova em plataforma".
 *
 * Nesta fase todo chamador passa `undefined`: a empresa ainda não guarda o
 * campo. A FASE D começa a passar `empresa.plataforma`, e as mesmas frases
 * passam a dizer "xWinner" para quem usa xWinner e "Hotmart" para quem usa
 * Hotmart, sem tocar em nenhum componente de novo.
 */
export function nomeDaPlataforma(plataforma?: string): string {
  return plataforma?.trim() || 'a plataforma';
}
