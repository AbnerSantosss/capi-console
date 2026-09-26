/**
 * As rotas de antes da V2 (v7) e para onde cada uma leva agora.
 *
 * Módulo PURO: nenhum import do projeto, nenhum disco, nenhum Next. Quem o usa:
 *
 *  - o proxy (`src/proxy.ts`), que responde 307 num salto só, com
 *    `Cache-Control: private, no-store`, para a aba nova da empresa ativa;
 *  - as páginas antigas, como reserva caso o proxy não responda antes;
 *  - `scripts/navegacao.test.mjs`, uma asserção por linha da tabela.
 *
 * Regra (v6 §3.2 e a irreversível nº 10): endereço publicado não expira. Toda
 * rota antiga continua respondendo e leva à aba nova REPASSANDO A QUERY. O
 * `?aba=` do Disparo automático é o único parâmetro traduzido: ele vira
 * vista, âncora ou some, e nunca é repassado cru.
 *
 * Por que 307 e não 308: o destino depende da empresa ativa. O navegador
 * guarda um 308 para sempre, e `/painel` continuaria abrindo a Gtech depois de
 * o dono trocar para o Código Vencedor.
 */

/** A âncora de cada bloco de Regras que tinha aba própria no Disparo automático. */
export const ANCORA_TESTES_INTERNOS = 'testes-internos';
export const ANCORA_REPASSE = 'repasse';

/**
 * Os caminhos que {@link destinoDaRotaAntiga} traduz — as mesmas linhas do
 * `switch` dela. O proxy pergunta aqui ANTES de ler o registro de empresas:
 * nenhuma outra página paga a leitura do disco.
 */
export const ROTAS_ANTIGAS: ReadonlySet<string> = new Set([
  '/',
  '/painel',
  '/painel/compras',
  '/painel/eventos',
  '/pixels',
  '/instalacao',
  '/automatico',
  '/integracoes',
]);

/** `true` quando o caminho é uma rota de antes da V2 (e o proxy responde 307). */
export function ehRotaAntiga(pathname: string): boolean {
  return typeof pathname === 'string' && ROTAS_ANTIGAS.has(pathname);
}

/** A busca de uma URL como `URLSearchParams`, aceitando `?a=1`, `a=1` ou vazio. */
function lerBusca(search: string | null | undefined): URLSearchParams {
  const bruto = typeof search === 'string' ? search : '';
  return new URLSearchParams(bruto.startsWith('?') ? bruto.slice(1) : bruto);
}

/**
 * Monta o destino: caminho, depois os parâmetros FIXOS do destino (a `vista`)
 * na frente, depois o resto da busca original, e a âncora por último.
 */
function montar(
  caminho: string,
  busca: URLSearchParams,
  fixos: Record<string, string> = {},
  ancora = ''
): string {
  const saida = new URLSearchParams();
  for (const [nome, valor] of Object.entries(fixos)) saida.set(nome, valor);
  for (const [nome, valor] of busca) {
    if (nome in fixos) continue;
    saida.append(nome, valor);
  }
  const consulta = saida.toString();
  return `${caminho}${consulta ? `?${consulta}` : ''}${ancora ? `#${ancora}` : ''}`;
}

/**
 * Para onde vai uma rota antiga, com o slug da empresa ativa. `null` quando o
 * caminho não é rota antiga: `/guia`, `/empresas`, `/e/**`, `/api/**` e
 * qualquer outro seguem como estão.
 *
 * | Rota antiga                    | Destino                                  |
 * |--------------------------------|------------------------------------------|
 * | `/`                            | `/e/<s>` (Visão geral)                   |
 * | `/painel`                      | `/e/<s>/eventos`                         |
 * | `/painel/compras`              | `/e/<s>/eventos?vista=compras`           |
 * | `/painel/eventos?evento=X`     | `/e/<s>/eventos?evento=X`                |
 * | `/pixels`                      | `/e/<s>/pixels`                          |
 * | `/instalacao`                  | `/e/<s>/fontes`                          |
 * | `/automatico`, `/integracoes`  | `/e/<s>/regras`                          |
 * |   `?aba=inbox`                 | `/e/<s>/eventos?vista=fila`              |
 * |   `?aba=regras`                | `/e/<s>/regras`                          |
 * |   `?aba=testes`                | `/e/<s>/regras#testes-internos`          |
 * |   `?aba=retornos`              | `/e/<s>/regras#repasse`                  |
 * |   `?aba=recebimento`           | `/e/<s>/fontes#webhook`                  |
 * |   `?aba=tag`                   | `/e/<s>/fontes#tag`                      |
 *
 * As duas últimas linhas não estão na tabela do v6: são os links que o próprio
 * Disparo automático já mandava para `/instalacao#webhook` e `/instalacao#tag`
 * (o `ROTA_LEGADA` de `IntegrationsPage.tsx`). Sem elas, um favorito antigo de
 * `?aba=tag` cairia em Regras em vez de cair na tag.
 *
 * O `#` de quem digitou (por exemplo `/pixels#emp_x`) o servidor nunca vê; o
 * navegador o mantém sozinho quando a `Location` do 307 não traz âncora.
 */
export function destinoDaRotaAntiga(
  pathname: string,
  search: string | null | undefined,
  slugAtiva: string
): string | null {
  if (typeof pathname !== 'string' || typeof slugAtiva !== 'string' || !slugAtiva) return null;
  const base = `/e/${encodeURIComponent(slugAtiva)}`;
  const busca = lerBusca(search);

  switch (pathname) {
    case '/':
      return montar(base, busca);
    case '/painel':
      return montar(`${base}/eventos`, busca);
    case '/painel/compras':
      return montar(`${base}/eventos`, busca, { vista: 'compras' });
    case '/painel/eventos':
      // Sem `?evento=` a página antiga já mandava para o Painel; aqui a mesma
      // coisa acontece sozinha: sem recorte, Eventos abre no resumo.
      return montar(`${base}/eventos`, busca);
    case '/pixels':
      return montar(`${base}/pixels`, busca);
    case '/instalacao':
      return montar(`${base}/fontes`, busca);
    case '/automatico':
    case '/integracoes': {
      const aba = busca.get('aba');
      busca.delete('aba');
      switch (aba) {
        case 'inbox':
          return montar(`${base}/eventos`, busca, { vista: 'fila' });
        case 'testes':
          return montar(`${base}/regras`, busca, {}, ANCORA_TESTES_INTERNOS);
        case 'retornos':
          return montar(`${base}/regras`, busca, {}, ANCORA_REPASSE);
        case 'recebimento':
          return montar(`${base}/fontes`, busca, {}, 'webhook');
        case 'tag':
          return montar(`${base}/fontes`, busca, {}, 'tag');
        default:
          // `regras`, ausente ou desconhecida: Regras.
          return montar(`${base}/regras`, busca);
      }
    }
    default:
      return null;
  }
}

/**
 * Hashes que o Disparo automático já entende sozinho (o `HASH_LEGADO` de
 * `IntegrationsPage.tsx`). Com um deles na URL, a aba certa já abre.
 */
const HASH_QUE_O_AUTOMATICO_ENTENDE = new Set(['inbox', 'regras', 'retornos', 'historico']);

/**
 * Qual sub-aba do Disparo automático a aba Regras deve abrir, até a V7 trocar
 * as sub-abas por blocos numa página só.
 *
 * Por que existe: o `IntegrationsPage` abre na Caixa de entrada quando não há
 * `?aba=`, e não conhece as âncoras novas (`#repasse`, `#testes-internos`).
 * Sem esta tradução, `/automatico?aba=retornos` → `/e/<s>/regras#repasse`
 * abriria a Caixa de entrada dentro da aba chamada "Regras".
 *
 * Devolve o valor para `?aba=`, ou `null` quando não há nada a traduzir
 * (a URL já diz a aba, ou traz um hash que o componente entende).
 */
export function abaDasRegrasPeloEndereco(
  aba: string | null | undefined,
  hash: string | null | undefined
): 'regras' | 'testes' | 'retornos' | null {
  if (aba) return null;
  const ancora = String(hash ?? '').replace(/^#/, '');
  if (ancora === ANCORA_REPASSE) return 'retornos';
  if (ancora === ANCORA_TESTES_INTERNOS) return 'testes';
  if (HASH_QUE_O_AUTOMATICO_ENTENDE.has(ancora)) return null;
  return 'regras';
}
