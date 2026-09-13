/**
 * Helper único de requisições fetch no cliente (D8).
 *
 * Tratamento centralizado de autenticação e erros:
 * - Em HTTP 401: redireciona imediatamente para `/login?destino=<pathname>` e lança `SessaoExpirada`.
 * - Em HTTP não-2xx: parseia a resposta e lança `ErroApi` com a mensagem real do servidor.
 * - Em sucesso (2xx): retorna o payload JSON tipado `T`.
 */

import { destinoSeguroDoPathname } from './rotas-console';

/**
 * ⚠️ Import CIRCULAR, e deliberado: `useEmpresaStore` importa `pedir` daqui.
 *
 * Estático, e não `await import()`, porque o ciclo se resolve nas duas ordens
 * de carga:
 *
 *  - se o store carrega primeiro, ele puxa este módulo, cujo corpo só declara
 *    classes e funções — nada aqui LÊ o store no momento da avaliação;
 *  - se este módulo carrega primeiro, o store puxa `pedir`, que é uma
 *    **declaração de função** (içada e já inicializada mesmo com este módulo
 *    pela metade). `useEmpresaStore` é `const`, mas só é lido DENTRO do corpo
 *    de `comEmpresa()`, ou seja, depois de todo mundo avaliado — nunca em TDZ.
 *
 * Um `await import()` dentro da função também funcionaria, mas transformaria
 * `pedir` numa chamada que espera um módulo a cada requisição para nada. Se um
 * dia algo aqui passar a ler o store no topo do arquivo, a saída é mover
 * `escreverCookieEmpresa`/leitura do id para um módulo pequeno sem dependências
 * — não trocar por import dinâmico.
 */
import { useEmpresaStore } from '@/stores/useEmpresaStore';

export class SessaoExpirada extends Error {
  constructor(mensagem = 'Sessão expirada. Entre novamente.') {
    super(mensagem);
    this.name = 'SessaoExpirada';
  }
}

export class ErroApi extends Error {
  public readonly status: number;
  public readonly erros: string[];
  public readonly dados: unknown;

  constructor(mensagem: string, status: number, erros: string[] = [], dados?: unknown) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.erros = erros;
    this.dados = dados;
  }
}

/**
 * Acrescenta `X-Empresa-Id` sem derrubar o que quem chamou já mandou.
 *
 * Por que o header existe: ele é o caminho EXPLÍCITO da empresa ativa. A tela
 * diz de qual empresa está falando em toda chamada, sem depender do que o
 * navegador guardou. O cookie `capi_empresa` é a reserva — ele existe para as
 * páginas de servidor (RSC), que renderizam antes de qualquer fetch e não
 * recebem header de aplicação nenhum. `empresaDaRequisicao()` resolve
 * header → cookie → 'default', nessa ordem.
 *
 * 🔴 O header SELECIONA, não autoriza. Trocá-lo à mão não dá acesso a nada:
 * quem autoriza continua sendo o cookie de sessão (`capi_sessao`), que toda
 * rota exige antes de olhar para a empresa.
 *
 * `new Headers(init?.headers)` porque `init.headers` pode chegar como objeto
 * literal, como `Headers` ou como array de pares — um spread de objeto
 * silenciosamente perderia os dois últimos formatos, e a chamada iria sem o
 * `Content-Type` que ela mesma pediu.
 */
function comEmpresa(init?: RequestInit): RequestInit | undefined {
  // Fora do navegador não há store nem escolha de empresa; quem chama `pedir`
  // do servidor já sabe de qual empresa está falando por outros meios.
  if (typeof window === 'undefined') return init;

  try {
    const headers = new Headers(init?.headers);
    // Quem chamou explicitamente vence: um diálogo que acabou de criar a
    // empresa precisa salvar o primeiro Pixel NA EMPRESA NOVA (D-19), antes de
    // a escolha ativa ter trocado.
    if (headers.has('X-Empresa-Id')) return init;

    const id = useEmpresaStore.getState().empresaAtivaId;
    if (!id) return init;

    headers.set('X-Empresa-Id', id);
    return { ...init, headers };
  } catch {
    // Ler o store não pode derrubar TODA requisição do console. Sem o header, o
    // servidor cai no cookie `capi_empresa` e, na falta dele, na empresa padrão
    // — degradação prevista por `resolverEmpresaId`, não falha.
    return init;
  }
}

export async function pedir<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const resposta = await fetch(input, comEmpresa(init));

  if (resposta.status === 401) {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const destino = destinoSeguroDoPathname(pathname);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?destino=${encodeURIComponent(destino)}`);
    }
    throw new SessaoExpirada();
  }

  if (!resposta.ok) {
    let dados: Record<string, unknown> | null = null;
    try {
      dados = (await resposta.json()) as Record<string, unknown>;
    } catch {
      // Resposta não é JSON
    }

    let mensagem = `Erro HTTP ${resposta.status}`;
    let erros: string[] = [];

    if (dados) {
      if (typeof dados.erro === 'string') {
        mensagem = dados.erro;
        erros = [dados.erro];
      } else if (Array.isArray(dados.erros) && dados.erros.length > 0) {
        erros = dados.erros.map(String);
        mensagem = erros.join(' · ');
      }
    } else if (resposta.statusText) {
      mensagem = `${mensagem}: ${resposta.statusText}`;
    }

    throw new ErroApi(mensagem, resposta.status, erros, dados);
  }

  return (await resposta.json()) as T;
}
