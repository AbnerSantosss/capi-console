import 'server-only';

import type { NextRequest } from 'next/server';

import { EMPRESA_DEFAULT_ID, idDeEmpresaValido, listarEmpresas, type Empresa } from './empresas';

/**
 * Qual empresa o OPERADOR está olhando agora (D-4 do plano multi-empresa).
 *
 * Duas fontes, e as duas são necessárias:
 *
 *  - **header `X-Empresa-Id`** — `pedir()` (`cliente-api.ts`) manda em toda
 *    chamada de API. É o caminho explícito: quem chama diz de qual empresa está
 *    falando, sem depender do que o navegador guardou.
 *  - **cookie `capi_empresa`** — páginas de servidor (RSC) precisam saber a
 *    empresa ANTES de renderizar, e ali não existe header de aplicação nenhum.
 *    O cookie é o único jeito de o servidor saber o que a tela escolheu.
 *
 * 🔴 O que este arquivo NÃO decide: de quem é um evento que chega pelo webhook
 * ou pelo coletor da tag. Esses dois são endpoints PÚBLICOS, sem sessão, e a
 * empresa deles sai da CREDENCIAL apresentada (D-5: `acharEmpresaPorSegredo`,
 * `acharEmpresaPorChaveTag`). Se o webhook lesse a empresa ativa, a venda de um
 * cliente cairia na conta de outro só porque o operador deixou o console aberto
 * numa aba — e conversão enviada para o Pixel errado não volta atrás.
 *
 * O cookie NÃO é credencial: ele não autoriza nada, só seleciona. Quem autoriza
 * é `capi_sessao` (`sessao.ts`), e toda rota de empresa continua exigindo
 * sessão. Por isso ele não é `HttpOnly` — a tela precisa escrevê-lo — e por
 * isso trocá-lo à mão não dá acesso a nada que a sessão já não desse.
 */

/** Cookie legível pela tela. Não é credencial — ver o bloco acima. */
export const COOKIE_EMPRESA = 'capi_empresa';

/** Header que `pedir()` manda em toda chamada de API. Comparado em minúsculas. */
export const HEADER_EMPRESA = 'x-empresa-id';

/**
 * 1 ano. Escolher empresa é preferência de trabalho, não sessão: expirar isso
 * junto com o login faria o operador voltar para a empresa padrão toda manhã.
 */
export const COOKIE_EMPRESA_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Atributos do cookie, numa string só, para quem precisar gravá-lo do servidor.
 *
 * `SameSite=Lax` porque nenhuma navegação de terceiro precisa carregar a
 * escolha de empresa; sem `HttpOnly` de propósito (a tela escreve); sem
 * `Secure` fixo porque o console também roda em `http://localhost:3333` durante
 * o desenvolvimento e um `Secure` ali faria o cookie ser descartado em silêncio.
 */
export function atributosDoCookieEmpresa(seguro = process.env.NODE_ENV === 'production'): string {
  return `Path=/; Max-Age=${COOKIE_EMPRESA_MAX_AGE}; SameSite=Lax${seguro ? '; Secure' : ''}`;
}

/**
 * Escolhe a empresa a partir dos candidatos, em ordem de prioridade.
 *
 * Função PURA de propósito: é ela que o teste verifica, sem precisar montar uma
 * requisição do Next nem escrever em disco.
 *
 * Regras, e o porquê de cada uma:
 *
 *  - candidato vazio é pulado (header ausente, cookie ausente);
 *  - candidato com formato inválido é pulado ANTES de qualquer comparação — o
 *    id vira nome de arquivo na FASE E (`integracoes.<id>.json`), e `..%2f` não
 *    pode nem chegar perto de um `path.join`;
 *  - candidato que não está na lista é pulado: empresa apagada não vira 404, a
 *    tela continua funcionando na próxima opção (D-4);
 *  - acabaram os candidatos → `'default'`, que é a empresa que sempre existe.
 */
export function resolverEmpresaId(
  candidatos: (string | undefined | null)[],
  existentes: Empresa[]
): string {
  for (const bruto of candidatos) {
    const id = String(bruto ?? '').trim();
    if (!id || !idDeEmpresaValido(id)) continue;
    if (existentes.some((e) => e.id === id)) return id;
  }
  return EMPRESA_DEFAULT_ID;
}

/** O valor do cookie `capi_empresa`, de um `NextRequest` ou de um `Request` cru. */
function cookieDaRequisicao(req: NextRequest | Request): string | undefined {
  if ('cookies' in req && typeof (req as NextRequest).cookies?.get === 'function') {
    return (req as NextRequest).cookies.get(COOKIE_EMPRESA)?.value;
  }
  // Mesmo caminho de `sessaoDaRequisicao`: o `Request` padrão (o que os testes
  // montam) não tem `.cookies`, e só o header bruto está disponível.
  const cabecalho = req.headers.get('cookie') || '';
  const achado = cabecalho.match(new RegExp(`(?:^|;\\s*)${COOKIE_EMPRESA}=([^;]*)`));
  return achado ? decodeURIComponent(achado[1]) : undefined;
}

/**
 * Empresa ativa de uma chamada de API: header → cookie → `'default'`.
 *
 * Nunca lança por empresa desconhecida. Pode lançar
 * `ErroConfiguracaoIndisponivel` se `config/empresas.json` existir e estiver
 * ilegível — e aí a rota devolve 503 por `erroDeRota`, que é a resposta certa:
 * seguir com a empresa padrão nesse estado gravaria dado do cliente A no lugar
 * do cliente B.
 */
export async function empresaDaRequisicao(req: NextRequest | Request): Promise<string> {
  const doHeader = req.headers.get(HEADER_EMPRESA);
  const doCookie = cookieDaRequisicao(req);
  return resolverEmpresaId([doHeader, doCookie], await listarEmpresas());
}

/**
 * A frase do 409 de aba x navegador. `acao` é o verbo do botão que o operador
 * apertou ("salvar", "enviar"), para a frase falar da coisa que ele fez.
 */
export function mensagemAbaDivergente(acao = 'salvar'): string {
  return `Esta aba está em uma empresa e o navegador em outra. Recarregue a página antes de ${acao}.`;
}

/**
 * Empresa ativa de uma chamada que ESCREVE (T6 do pacote de correção, C1).
 *
 * `empresaDaRequisicao` deixa o header vencer o cookie sem perguntar nada — o
 * que está certo para LER, e errado para gravar. Duas abas do console: a aba 1
 * troca para a empresa B (o cookie, que é do navegador, passa a dizer B); a aba
 * 2 continua mostrando a A e manda header A. Quem vence é o header, e a aba 2
 * grava na A achando que está na A — mas o operador acabou de escolher B, e a
 * próxima tela de servidor que ele abrir vai mostrar a B. Uma das duas pontas
 * está desatualizada, e o servidor não tem como saber qual: por isso recusa as
 * duas e pede para recarregar, em vez de adivinhar.
 *
 * 🔴 A comparação é dos valores CRUS (só `trim()`), ANTES de
 * `resolverEmpresaId`. Resolvido, um id de empresa apagada vira `'default'`:
 * header `emp_apagada` + cookie `default` passariam como "iguais" e a aba presa
 * numa empresa que não existe mais gravaria na padrão — que é justamente a
 * empresa do dono, com o webhook que entrega venda hoje.
 *
 * Só um dos dois presente (chamada de script sem cookie, página de servidor sem
 * header) segue como antes: não há o que comparar.
 *
 * Lança uma `Response` 409 em JSON, no mesmo molde de `exigirSessao`:
 * `erroDeRota` e os `catch` das rotas já devolvem `Response` como veio. Não usa
 * `respostaErro` de propósito — ela puxa `next/server`, e este arquivo é
 * importado por testes que rodam sob `--conditions=react-server`, onde esse
 * especificador não resolve.
 */
export async function empresaParaEscrita(
  req: NextRequest | Request,
  acao = 'salvar'
): Promise<string> {
  const doHeader = String(req.headers.get(HEADER_EMPRESA) ?? '').trim();
  const doCookie = String(cookieDaRequisicao(req) ?? '').trim();
  if (doHeader && doCookie && doHeader !== doCookie) {
    throw new Response(JSON.stringify({ erro: mensagemAbaDivergente(acao) }), {
      status: 409,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
  return empresaDaRequisicao(req);
}

/**
 * Empresa ativa de uma página de servidor (RSC): cookie → `'default'`.
 *
 * `next/headers` entra por `await import` e não por import estático porque os
 * testes carregam os módulos de `src/lib` com o Node cru
 * (`scripts/_resolver-ts.mjs`), e ali o especificador `next/headers` não
 * resolve — um import estático quebraria TODO teste que encostasse neste
 * arquivo, antes da primeira asserção. Sob o bundler do Next o `await import`
 * funciona igual, e nada além desta função precisa de `next/headers`.
 */
export async function empresaDaPagina(): Promise<string> {
  const { cookies } = await import('next/headers');
  const jar = await cookies();
  return resolverEmpresaId([jar.get(COOKIE_EMPRESA)?.value], await listarEmpresas());
}
