import { hostDaTag, type DominioTag } from '@/lib/tag-dominios';

/**
 * Para onde a tag do site manda os eventos, e se o endereço próprio do cliente
 * já está pronto para receber (V8 do plano v7, acréscimos de 24/09 05:25 e
 * 08:50).
 *
 * A REGRA QUE ESTE ARQUIVO GUARDA: a tag nunca pode parar de coletar. Com
 * subdomínio cadastrado mas sem certificado, `https://m.cliente.com.br` não
 * responde (ou responde com erro de TLS) e toda visita do site se perde em
 * silêncio. Por isso o endereço do cliente só entra na tag depois de MEDIDO: o
 * próprio endereço dele respondeu, com HTTPS válido, que é este console.
 * Enquanto isso não acontece, a tag chama o nosso endereço, que já funciona.
 *
 * É o que o comentário de `hostDaTag` (`tag-dominios.ts`) pede: a tag "nunca
 * deve ficar apontando para um subdomínio do cliente que ainda não tem
 * certificado (aí não coleta nada)".
 *
 * A ÚNICA chamada de rede daqui é `enderecoProprioPronto`: um GET em
 * `https://<sub>.<host>/api/health` de um domínio cadastrado pelo operador.
 * Nenhuma consulta de DNS, nenhuma API de provedor, nenhum agendador.
 */

/**
 * Caminho do coletor público. Uma letra errada aqui não quebra nada no
 * console: quebra semanas depois, no site do cliente, como uma tag instalada
 * que nunca coletou um evento.
 */
export const CAMINHO_COLETOR = '/api/tag/coletar';

/** Último recurso quando não há PUBLIC_BASE_URL nem origem na requisição. */
export const BASE_FALLBACK = 'http://localhost:3333';

/**
 * URL completa do coletor que a tag deste domínio vai chamar.
 *
 * - Sem domínio, ou com `certificadoPronto === false`: SEMPRE o coletor da
 *   nossa base, mesmo com subdomínio cadastrado. A tag continua coletando.
 * - Com subdomínio e certificado pronto: `https://<sub>.<host>/api/tag/coletar`.
 *
 * `hostDaTag` devolve o hostname SEM porta; por isso a nossa base volta como
 * origem inteira. Se não, o console rodando em :3333 geraria tag apontando para
 * a porta 80, que não responde.
 */
export function endpointDoDominio(
  dominio: DominioTag | undefined,
  base: string,
  certificadoPronto: boolean
): string {
  let origemBase: URL;
  try {
    origemBase = new URL(base);
  } catch {
    // Base torta no .env não pode derrubar a tela inteira; a tag sai apontando
    // para o padrão local e o aviso de localhost aparece no console.
    origemBase = new URL(BASE_FALLBACK);
  }
  const nossoColetor = `${origemBase.origin}${CAMINHO_COLETOR}`;
  if (!dominio || certificadoPronto !== true) return nossoColetor;
  const host = hostDaTag(dominio, base);
  if (!host || host === origemBase.hostname) return nossoColetor;
  return `https://${host}${CAMINHO_COLETOR}`;
}

/* ------------------------------------------------------------------ */
/* O endereço próprio já responde? (medido, nunca suposto)             */
/* ------------------------------------------------------------------ */

/** Nome que o `/api/health` deste console devolve em `servico`. */
const SERVICO_DO_CONSOLE = 'capi-console';

/**
 * A resposta veio deste console? Só com 200, `ok: true` e o nome do serviço.
 *
 * Um 200 qualquer não basta: uma página de estacionamento do registrador, ou o
 * site do cliente respondendo pelo subdomínio errado, também dá 200. O corpo do
 * `/api/health` é que prova que o pedido chegou aqui.
 */
export function respostaEhDoConsole(status: number, corpo: unknown): boolean {
  if (status !== 200) return false;
  if (!corpo || typeof corpo !== 'object') return false;
  const c = corpo as { ok?: unknown; servico?: unknown };
  return c.ok === true && c.servico === SERVICO_DO_CONSOLE;
}

/** Quanto tempo o console espera o endereço do cliente responder. */
const TEMPO_LIMITE_MS = 2500;
/** Pronto costuma continuar pronto: 5 min sem perguntar de novo. */
const VALIDADE_PRONTO_MS = 5 * 60 * 1000;
/** Não pronto pode mudar a qualquer hora (o cliente criou o CNAME): 60 s. */
const VALIDADE_NAO_PRONTO_MS = 60 * 1000;

/**
 * Hostname aceitável para a sonda: letras, dígitos, hífen e ponto, com pelo
 * menos um ponto. Barra, `@`, dois-pontos ou espaço não passam: o endereço
 * montado abaixo não pode virar outra URL.
 */
const HOST_ACEITO = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

const cache = new Map<string, { pronto: boolean; ate: number }>();

/** Esquece o que foi medido. Existe para o teste; a tela não chama. */
export function limparCacheDoEndereco(): void {
  cache.clear();
}

/**
 * O endereço próprio do cliente (`<sub>.<host>`) já responde por este console,
 * com HTTPS válido?
 *
 * Faz `GET https://<host>/api/health` sem seguir redirecionamento, sem cache e
 * com tempo limite curto. Qualquer erro (DNS, TLS, 404, tempo esgotado, corpo
 * que não é JSON) dá `false`, e a função nunca lança: quem chama é a rota que
 * gera a tag, e ela não pode cair porque o endereço do cliente não respondeu.
 *
 * O resultado fica guardado por host, em memória: 5 min quando `true` e 60 s
 * quando `false`. Assim abrir a aba várias vezes não bate no site do cliente a
 * cada clique.
 */
export async function enderecoProprioPronto(
  host: string,
  buscar: Buscar = (url, init) => fetch(url, init)
): Promise<boolean> {
  const chave = String(host ?? '').trim().toLowerCase();
  if (!HOST_ACEITO.test(chave)) return false;

  const guardado = cache.get(chave);
  if (guardado && guardado.ate > Date.now()) return guardado.pronto;

  let pronto = false;
  try {
    const resposta = await buscar(`https://${chave}/api/health`, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    let corpo: unknown = null;
    try {
      corpo = await resposta.json();
    } catch {
      corpo = null;
    }
    pronto = respostaEhDoConsole(resposta.status, corpo);
  } catch {
    pronto = false;
  }

  cache.set(chave, {
    pronto,
    ate: Date.now() + (pronto ? VALIDADE_PRONTO_MS : VALIDADE_NAO_PRONTO_MS),
  });
  return pronto;
}
