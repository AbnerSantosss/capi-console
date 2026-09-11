/**
 * Helper único de requisições fetch no cliente (D8).
 *
 * Tratamento centralizado de autenticação e erros:
 * - Em HTTP 401: redireciona imediatamente para `/login?destino=<pathname>` e lança `SessaoExpirada`.
 * - Em HTTP não-2xx: parseia a resposta e lança `ErroApi` com a mensagem real do servidor.
 * - Em sucesso (2xx): retorna o payload JSON tipado `T`.
 */

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

export async function pedir<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const resposta = await fetch(input, init);

  if (resposta.status === 401) {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const destino = ['/', '/integracoes', '/guia'].includes(pathname) ? pathname : '/';
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
