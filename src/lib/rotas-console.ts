/**
 * Allowlist de rotas do console — módulo NEUTRO (sem `server-only`).
 *
 * Por que existe um módulo só para isto: `sessao.ts` começa com `import 'server-only'`,
 * então nenhum componente de cliente consegue importar a lista de lá. Antes da FASE 4
 * havia duas cópias literais da mesma allowlist — uma em `sessao.ts` (servidor, usada
 * por `validarDestino`) e outra inline em `cliente-api.ts` (navegador, usada no 401) —
 * e elas saíram de sincronia assim que `/pixels` e `/automatico` nasceram: um 401 nessas
 * telas jogava o usuário para `/` em vez de devolvê-lo a onde estava.
 *
 * 🔴 Este arquivo é a ÚNICA fonte da verdade. Ao criar uma rota nova do console que o
 * usuário possa estar olhando quando a sessão expira, acrescente-a aqui — e em mais
 * nenhum lugar.
 *
 * Regras que a lista carrega (D5):
 * - Só pathname. Nunca query string, nunca hash, nunca origem.
 * - `/login` NÃO entra: seria um laço de redirecionamento.
 * - `/api/*` NÃO entra: não é tela.
 * - As rotas antigas (`/painel`, `/instalacao`, `/automatico`, `/integracoes`…)
 *   continuam na lista: a decisão irreversível #10 diz que a URL antiga responde
 *   para sempre. Desde a V2 do v7 quem responde é o proxy, com 307 para a aba
 *   nova da empresa ativa.
 *
 * V2 (v7): a empresa virou o primeiro nível do endereço. Além da lista exata,
 * vale UM padrão fechado — `/e/<slug>` e `/e/<slug>/<aba>`, com as 7 abas por
 * nome. Fechado quer dizer: slug só com minúsculas, dígitos e hífen entre
 * palavras (a mesma forma que `erroDoRotulo` exige ao gravar), aba só uma das
 * sete, nada de barra no fim, nada de segmento a mais.
 */

/** Destinos permitidos após o login (D5), comparados pelo pathname inteiro. */
export const DESTINOS_PERMITIDOS = [
  '/painel',
  // As duas telas de "quem" abertas por um clique no Painel. Entram aqui como
  // pathname puro: o recorte delas (`?evento=`, `?compras=1`) e o período
  // viajam na query, que esta lista nunca compara — ver a regra logo acima.
  '/painel/compras',
  '/painel/eventos',
  '/',
  '/instalacao',
  '/pixels',
  '/automatico',
  '/integracoes',
  '/guia',
  // A lista de todas as empresas (V2). É a "home" da Stape.
  '/empresas',
] as const;

/**
 * As 7 abas de uma empresa, por nome e na ordem da tela. A Visão geral não
 * tem nome: é `/e/<slug>` sozinho.
 *
 * 🔴 `empresa-do-endereco.ts` guarda uma cópia desta lista porque é puro e não
 * importa nada do projeto; `scripts/navegacao.test.mjs` reprova se as duas
 * divergirem.
 */
export const ABAS_DA_EMPRESA = [
  'dominio',
  'fontes',
  'pixels',
  'eventos',
  'teste',
  'regras',
  'configuracoes',
] as const;

export type AbaDaEmpresa = (typeof ABAS_DA_EMPRESA)[number];

/** `/e/<slug>` ou `/e/<slug>/<aba>`, depois de passar por {@link ehEnderecoDeEmpresa}. */
export type EnderecoDeEmpresa = `/e/${string}`;

export type DestinoPermitido = (typeof DESTINOS_PERMITIDOS)[number] | EnderecoDeEmpresa;

/** Teto do slug: o mesmo `ROTULO_MAX` de `config-store.ts`. */
const SLUG_MAX = 40;

/**
 * O padrão fechado de `/e/`. Slug: `[a-z0-9]+(-[a-z0-9]+)*`, a forma do
 * `RE_ROTULO` de `config-store.ts` — maiúscula, ponto, `%`, `_` e barra ficam
 * de fora por construção.
 */
const RE_ENDERECO_DE_EMPRESA = new RegExp(
  `^/e/([a-z0-9]+(?:-[a-z0-9]+)*)(?:/(${ABAS_DA_EMPRESA.join('|')}))?$`
);

/** O caminho é `/e/<slug>` ou `/e/<slug>/<aba>` no padrão fechado? */
export function ehEnderecoDeEmpresa(caminho: string): caminho is EnderecoDeEmpresa {
  const casa = RE_ENDERECO_DE_EMPRESA.exec(caminho);
  return !!casa && casa[1].length <= SLUG_MAX;
}

/** A lista exata ou o padrão de `/e/`. Só pathname: nada de query nem hash. */
export function ehDestinoPermitido(caminho: string): caminho is DestinoPermitido {
  return (
    (DESTINOS_PERMITIDOS as readonly string[]).includes(caminho) || ehEnderecoDeEmpresa(caminho)
  );
}

/**
 * Onde alguém cai quando entra no console sem ter pedido uma tela específica (D-2').
 *
 * Desde a V2 do v7 é `/`, que o proxy manda por 307 para a Visão geral da
 * empresa ativa (`/e/<slug>`). São dois saltos na chegada (`/login` → `/` →
 * `/e/<slug>`), assumidos por escrito no plano (M-3): encurtar exigiria mexer
 * no login, que é intocável.
 *
 * 🔴 Não confundir com o `/` devolvido por `validarDestino` e por
 * `destinoSeguroDoPathname`: aquele é a rede de segurança de um destino RECUSADO
 * (open redirect, rota desconhecida). Hoje os dois coincidem, e é de propósito:
 * a rede de segurança leva à empresa ativa, nunca a uma tela de outra empresa.
 */
export const DESTINO_INICIAL: DestinoPermitido = '/';

/**
 * Versão de navegador: recebe um `location.pathname` já confiável (veio do próprio
 * browser, não de entrada do usuário) e devolve ele mesmo se for uma tela conhecida,
 * ou `/` caso contrário.
 *
 * Para entrada NÃO confiável — o `?destino=` da URL de login — use `validarDestino`
 * de `sessao.ts`, que também barra open redirect, `javascript:`, barra dupla e `..`.
 */
export function destinoSeguroDoPathname(pathname: string): DestinoPermitido {
  return ehDestinoPermitido(pathname) ? pathname : '/';
}
