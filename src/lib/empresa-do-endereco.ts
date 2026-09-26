/**
 * A empresa que o ENDEREÇO diz (V2 do v7) — módulo puro.
 *
 * Nenhum import do projeto, nenhum disco, nenhum Next, nenhum `window`: roda no
 * proxy (Node), no navegador (`EmpresaDoEndereco`, `SeletorDeEmpresa`) e no
 * teste (`scripts/navegacao.test.mjs`) do mesmo jeito.
 *
 * As regras que ele carrega (§6 do v7):
 *
 *  1. o endereço é a única fonte da empresa nas páginas de `/e/`;
 *  2. store e cookie se alinham à empresa do endereço ANTES de qualquer filho
 *     montar — é o que {@link prepararEmpresaDoEndereco} faz;
 *  3. trocar de empresa é navegar — {@link destinoAoTrocar} diz para onde.
 */

/**
 * As 7 abas por nome. Cópia de `ABAS_DA_EMPRESA` (`rotas-console.ts`): este
 * módulo não importa nada do projeto. `navegacao.test.mjs` reprova se as duas
 * listas divergirem.
 */
export const ABAS_DO_ENDERECO = [
  'dominio',
  'fontes',
  'pixels',
  'eventos',
  'teste',
  'regras',
  'configuracoes',
] as const;

/** Teto do slug: o `ROTULO_MAX` de `config-store.ts`. */
const SLUG_MAX = 40;

/** `/e/<slug>` ou `/e/<slug>/<aba>`, no padrão fechado (o mesmo de `rotas-console.ts`). */
const RE_ENDERECO = new RegExp(
  `^/e/([a-z0-9]+(?:-[a-z0-9]+)*)(?:/(${ABAS_DO_ENDERECO.join('|')}))?$`
);

/** O mínimo de uma empresa que este módulo precisa: `Empresa` e `EmpresaPublica` servem. */
export interface EmpresaDoCadastro {
  id: string;
  slug: string;
}

/**
 * O slug de `/e/<slug>[/<aba>]`, ou `null` para qualquer outro caminho
 * (inclusive `/e/Gtech`, `/e/g.tech/pixels`, `/e/gtech/nada`, `/e/gtech/`).
 */
export function slugDoEndereco(pathname: string): string | null {
  if (typeof pathname !== 'string') return null;
  const casa = RE_ENDERECO.exec(pathname);
  if (!casa || casa[1].length > SLUG_MAX) return null;
  return casa[1];
}

/**
 * O `id` da empresa cujo slug está no endereço, ou `null` (caminho fora do
 * padrão ou slug que não existe). É o que o proxy usa para gravar o cookie
 * `capi_empresa` da empresa do endereço (bloco (b), contrato I4).
 */
export function empresaIdDoEndereco(
  pathname: string,
  empresas: ReadonlyArray<EmpresaDoCadastro>
): string | null {
  const slug = slugDoEndereco(pathname);
  if (!slug) return null;
  return empresas.find((e) => e.slug === slug)?.id ?? null;
}

/**
 * O pedaço do store de empresa que o alinhamento usa. O `useEmpresaStore` de
 * verdade serve (zustand expõe `getState`/`setState`); o teste passa um falso.
 */
export interface StoreDeEmpresa {
  getState(): { empresaAtivaId: string };
  setState(parcial: { empresaAtivaId: string }): void;
}

export interface EmpresaPreparada {
  /** Store e cookie apontam para a empresa do endereço: os filhos podem montar. */
  pronto: boolean;
  /** O store estava em outra empresa e foi trocado (quem chama relê os Pixels). */
  trocou: boolean;
}

/**
 * Alinha cookie e store à empresa do endereço e só então diz `pronto`.
 *
 * A ORDEM é a de `setEmpresaAtiva` (`useEmpresaStore.ts`): cookie primeiro,
 * para que qualquer navegação de servidor dali em diante já saia com a
 * empresa certa; estado depois, porque é dele que `pedir()` tira o
 * `X-Empresa-Id` — quando `pronto` volta, a primeira `pedir()` de qualquer
 * filho já diz a empresa do endereço.
 *
 * O cookie é regravado mesmo com o store já certo: é barato, e o proxy pode
 * não ter gravado (slug fora do padrão fechado, cookie apagado à mão).
 *
 * O store só é tocado quando muda. Regravar o mesmo valor faria o `persist`
 * escrever no `localStorage` à toa, e cada escrita que muda o valor vira
 * `storage` nas outras abas.
 */
export function prepararEmpresaDoEndereco(
  empresaId: string,
  store: StoreDeEmpresa,
  escreverCookie: (id: string) => void
): EmpresaPreparada {
  if (typeof empresaId !== 'string' || !empresaId) return { pronto: false, trocou: false };
  escreverCookie(empresaId);
  const trocou = store.getState().empresaAtivaId !== empresaId;
  if (trocou) store.setState({ empresaAtivaId: empresaId });
  return { pronto: true, trocou };
}

/**
 * "Já alinhou uma vez" para uma montagem do `EmpresaDoEndereco`: a função
 * devolvida responde `false` até o store apontar para `empresaId` e, dali em
 * diante, `true` para sempre, mesmo que o store mude de novo.
 *
 * Por que a trava: depois de alinhada, a tela fica montada. Se outra aba
 * trocar a empresa, quem reage é o `SeletorDeEmpresa` (navega, ou só avisa
 * quando há rascunho); desmontar aqui apagaria justamente o rascunho que o
 * aviso protege.
 *
 * É o `getSnapshot` do `useSyncExternalStore`: lê o store, nunca escreve.
 */
export function travaDeAlinhamento(
  empresaId: string,
  store: Pick<StoreDeEmpresa, 'getState'>
): () => boolean {
  let alinhou = false;
  return () => {
    if (!alinhou && !!empresaId && store.getState().empresaAtivaId === empresaId) alinhou = true;
    return alinhou;
  };
}

/**
 * Para onde ir ao trocar de empresa estando em `pathname`: a MESMA aba na
 * empresa nova, quando se está numa aba; a Visão geral dela, em qualquer outro
 * lugar (`/empresas`, `/guia`, rota antiga, aba desconhecida).
 *
 * A query não vai junto: `?vista=`, `?evento=` e o período são da empresa que
 * se está deixando.
 */
export function destinoAoTrocar(pathname: string, slugNovo: string): string {
  const base = `/e/${encodeURIComponent(slugNovo)}`;
  const casa = typeof pathname === 'string' ? /^\/e\/[^/]+\/([^/]+)/.exec(pathname) : null;
  const aba = casa?.[1];
  return aba && (ABAS_DO_ENDERECO as readonly string[]).includes(aba) ? `${base}/${aba}` : base;
}
