/**
 * O erro da Meta em texto de gente (M-01 e M-09).
 *
 * Módulo PURO — sem `import 'server-only'`, sem rede e sem arquivo — para a
 * tela, as rotas e `scripts/erro-meta.test.mjs` usarem a MESMA tabela.
 *
 * Nunca recebe nem devolve token: só o código do erro (`error.code`) e o
 * subcódigo (`error.error_subcode`) da resposta da Meta.
 *
 * Os textos seguem o glossário do console (`scripts/vocabulario-check.mjs`):
 * "Pixel", "envio", "Fila".
 */

export type TipoDeErroDaMeta = 'token' | 'permissao' | 'dado' | 'outro';

/** O que se lê de `resposta.error` da Meta. Os dois ausentes = sem código. */
export interface ErroDaMetaLido {
  codigo?: number;
  subcodigo?: number;
}

export interface TraducaoDoErroDaMeta {
  tipo: TipoDeErroDaMeta;
  /** O que aconteceu, em uma frase. */
  frase: string;
  /** O próximo passo, em uma frase. */
  oQueFazer: string;
  /** O rótulo da única ação do aviso. */
  acao: string;
  /** `true` quando a saída é trocar o token do Pixel. */
  trocarToken: boolean;
}

/** A janela, em dias, do aviso de recusa (faixa da empresa e cartão do Pixel). */
export const DIAS_DO_AVISO = 7;

const ACAO_TOKEN = 'Trocar o token';
const ACAO_PIXEL = 'Conferir o Pixel';

function numero(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : undefined;
}

/**
 * Lê `error.code` e `error.error_subcode` da resposta da Meta, campo a campo.
 * Resposta de sucesso, resposta sem `error` e valor que não é número viram `{}`.
 */
export function lerErroDaMeta(resposta: unknown): ErroDaMetaLido {
  if (typeof resposta !== 'object' || resposta === null) return {};
  const erro = (resposta as { error?: unknown }).error;
  if (typeof erro !== 'object' || erro === null) return {};
  const lido = erro as { code?: unknown; error_subcode?: unknown };
  const codigo = numero(lido.code);
  const subcodigo = numero(lido.error_subcode);
  return {
    ...(codigo !== undefined ? { codigo } : {}),
    ...(subcodigo !== undefined ? { subcodigo } : {}),
  };
}

/**
 * A tabela. 190 = token vencido ou revogado; 10 e 200 = token sem permissão;
 * 100 = dado errado; o resto = texto genérico, com o código quando existe.
 */
export function traduzirErroDaMeta(erro: ErroDaMetaLido): TraducaoDoErroDaMeta {
  const codigo = erro.codigo;
  if (codigo === 190) {
    return {
      tipo: 'token',
      frase: 'O token deste Pixel venceu ou foi revogado.',
      oQueFazer: 'Gere um token novo no Gerenciador de Eventos da Meta e troque aqui.',
      acao: ACAO_TOKEN,
      trocarToken: true,
    };
  }
  if (codigo === 10 || codigo === 200) {
    return {
      tipo: 'permissao',
      frase: 'O token deste Pixel não tem permissão para enviar eventos.',
      oQueFazer: 'Gere um token novo para este mesmo Pixel no Gerenciador de Eventos da Meta e troque aqui.',
      acao: ACAO_TOKEN,
      trocarToken: true,
    };
  }
  if (codigo === 100) {
    return {
      tipo: 'dado',
      frase: 'A Meta recusou um dado do evento.',
      oQueFazer: 'Confira o ID do Pixel. Se estiver certo, abra o evento na Fila e veja os dados enviados.',
      acao: ACAO_PIXEL,
      trocarToken: false,
    };
  }
  return {
    tipo: 'outro',
    frase:
      codigo === undefined
        ? 'A Meta não aceitou o envio.'
        : `A Meta não aceitou o envio (código ${codigo}).`,
    oQueFazer: 'Tente de novo em alguns minutos. Se continuar, confira o Pixel e o token.',
    acao: ACAO_PIXEL,
    trocarToken: false,
  };
}

/** A tradução em uma linha só: o que aconteceu e o próximo passo. */
export function textoDoErroDaMeta(erro: ErroDaMetaLido): string {
  const t = traduzirErroDaMeta(erro);
  return `${t.frase} ${t.oQueFazer}`;
}

/** O mínimo de uma recusa por Pixel (espelho de `RecusaPorPixel`, de `inbox-resumo.ts`). */
export interface RecusaLida {
  marcaId: string;
  recusados: number;
  codigo?: number;
  subcodigo?: number;
}

/** O aviso pronto para a tela: título, texto e o rótulo da única ação. */
export interface AvisoDeRecusa {
  /** Id interno do Pixel. É âncora de link, nunca texto de tela. */
  marcaId: string;
  titulo: string;
  texto: string;
  acao: string;
}

/**
 * Monta o aviso de um Pixel. `nomeDoPixel` nulo deixa a frase sem o nome (o
 * cartão do Pixel já é o Pixel). `cobreAJanela` falso troca "nos últimos 7
 * dias" por "nos eventos mais recentes": a leitura não alcançou os 7 dias
 * inteiros, e dizer "7 dias" seria número inventado.
 */
export function avisoDeRecusa(
  recusa: RecusaLida,
  nomeDoPixel: string | null,
  cobreAJanela: boolean
): AvisoDeRecusa {
  const quantos = recusa.recusados === 1 ? '1 envio' : `${recusa.recusados} envios`;
  const deQuem = nomeDoPixel ? ` do Pixel ${nomeDoPixel}` : '';
  const quando = cobreAJanela ? `nos últimos ${DIAS_DO_AVISO} dias` : 'nos eventos mais recentes';
  const t = traduzirErroDaMeta(recusa);
  return {
    marcaId: recusa.marcaId,
    titulo: `A Meta recusou ${quantos}${deQuem} ${quando}.`,
    texto: `${t.frase} ${t.oQueFazer}`,
    acao: t.acao,
  };
}

/** O aviso do cartão de um Pixel, ou `null` quando ele não tem recusa. */
export function avisoDoPixel(
  recusas: ReadonlyArray<RecusaLida>,
  marcaId: string,
  cobreAJanela: boolean
): AvisoDeRecusa | null {
  const recusa = recusas.find((r) => r.marcaId === marcaId);
  return recusa ? avisoDeRecusa(recusa, null, cobreAJanela) : null;
}

/**
 * T-M09: a Meta nem respondeu (rede, DNS, tempo esgotado). Uma frase só, usada
 * pelas rotas e pela Fila, para a pessoa ler sempre o mesmo texto.
 */
export const SEM_RESPOSTA_DA_META = 'Não foi possível falar com a Meta. Tente de novo em alguns minutos.';
