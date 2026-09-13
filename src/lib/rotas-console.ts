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
 * - `/integracoes` continua na lista mesmo virando 308 para `/automatico` — a decisão
 *   irreversível #10 diz que a URL antiga responde para sempre.
 */

/** Destinos permitidos após o login (D5). */
export const DESTINOS_PERMITIDOS = [
  '/',
  '/instalacao',
  '/pixels',
  '/automatico',
  '/integracoes',
  '/guia',
] as const;

export type DestinoPermitido = (typeof DESTINOS_PERMITIDOS)[number];

/**
 * Versão de navegador: recebe um `location.pathname` já confiável (veio do próprio
 * browser, não de entrada do usuário) e devolve ele mesmo se for uma tela conhecida,
 * ou `/` caso contrário.
 *
 * Para entrada NÃO confiável — o `?destino=` da URL de login — use `validarDestino`
 * de `sessao.ts`, que também barra open redirect, `javascript:` e barra dupla.
 */
export function destinoSeguroDoPathname(pathname: string): DestinoPermitido {
  return (DESTINOS_PERMITIDOS as readonly string[]).includes(pathname)
    ? (pathname as DestinoPermitido)
    : '/';
}
