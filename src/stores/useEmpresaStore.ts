import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { pedir } from '@/lib/cliente-api';
import { useBrandStore } from '@/stores/useBrandStore';

/**
 * Empresas no cliente (FASE D do plano `wiki/plano-multi-empresa-instalacao.md`).
 *
 * Molde: `useBrandStore`. A lista SEMPRE vem do servidor; do navegador só sai a
 * ESCOLHA — qual empresa o operador está olhando agora. Duas diferenças em
 * relação ao store de Pixels, e as duas são de propósito:
 *
 *  - a escolha é espelhada num cookie (`capi_empresa`), porque página de
 *    servidor (RSC) não enxerga `localStorage` e não recebe header de
 *    aplicação. Sem o espelho, a tela diria "Empresa B" e o HTML renderizado
 *    pelo servidor viria com os dados da empresa padrão;
 *  - trocar de empresa RECARREGA os Pixels, porque a lista de Pixels é por
 *    empresa. Mostrar o Pixel do cliente A sob o nome do cliente B é o começo
 *    de uma conversão enviada para o Pixel errado, e isso não volta atrás.
 *
 * 🔴 D-19 — **nada de credencial passa por aqui.** Pixel ID, token de acesso e
 * código de teste continuam indo por `PUT /api/marcas` (`useBrandStore`). A
 * rota `/api/empresas` recusa esses campos com 400 explícito; este store nunca
 * os monta.
 */

/**
 * CÓPIA da `EmpresaPublica` de `src/lib/empresas.ts`.
 *
 * 🔴 Não dá para importar de lá: aquele arquivo abre com `import 'server-only'`
 * e este store roda no navegador — a mesma razão da cópia de `MarcaPublica` em
 * `useBrandStore.ts`. A cópia é obrigatória; o que não é obrigatório é ela
 * divergir. Ao mexer na forma publicada por `publicarEmpresa()`, mexa TAMBÉM
 * aqui: o `tsc` não liga os dois lados, então um campo esquecido não quebra a
 * compilação — ele só some da tela, em silêncio.
 */
export interface EmpresaPublica {
  id: string;
  nome: string;
  slug: string;
  plataforma?: string;
  logoDataUrl?: string;
  logoUrl?: string;
  cor?: string;
  criadoEm: string;
}

/** O que o diálogo de empresa devolve. Ausência de `id` significa empresa nova. */
export interface EntradaDeEmpresa {
  /** Ausente em empresa nova: quem gera o id é o servidor (`novoIdEmpresa()`). */
  id?: string;
  nome: string;
  slug?: string;
  plataforma?: string;
  logoDataUrl?: string;
  logoUrl?: string;
  cor?: string;
}

interface EmpresaState {
  empresas: EmpresaPublica[];
  empresaAtivaId: string;
  carregando: boolean;
  carregado: boolean;
  /** Mensagem da última falha de leitura. Null quando a lista está boa. */
  erro: string | null;
  /**
   * A tela aberta tem coisa digitada e não salva (C2, T6). Quem marca são as
   * telas de configuração (Instalação e Automático); quem lê é o seletor, na
   * hora em que OUTRA aba troca a empresa: sem rascunho ele recarrega a tela,
   * com rascunho ele só avisa e oferece "Recarregar agora". Fica FORA do
   * `persist` — é estado desta aba, não preferência.
   */
  rascunhoSujo: boolean;

  carregar: () => Promise<void>;
  setEmpresaAtiva: (id: string) => Promise<void>;
  salvarEmpresa: (dados: EntradaDeEmpresa) => Promise<EmpresaPublica>;
  removerEmpresa: (id: string) => Promise<void>;
  ativa: () => EmpresaPublica | undefined;
  marcarRascunho: (sujo: boolean) => void;
}

/** Nome da chave do `persist` no `localStorage`. */
export const CHAVE_EMPRESA_ATIVA = 'capi_empresa_ativa_v1';

/**
 * Evento de janela disparado quando OUTRA aba trocou a empresa e este store já
 * acompanhou. `detail` é {@link DetalheTrocaFora}. Quem ouve é o
 * `SeletorDeEmpresa`, que decide entre recarregar a tela e só avisar.
 */
export const EVENTO_EMPRESA_TROCADA_FORA = 'capi:empresa-trocada-fora';

export interface DetalheTrocaFora {
  /** A empresa para a qual a outra aba foi. */
  id: string;
  /** A empresa que esta aba mostrava até agora. */
  anterior: string;
}

/**
 * Cookie que o servidor lê (`COOKIE_EMPRESA` de `src/lib/empresa-ativa.ts`).
 *
 * Repetido aqui em vez de importado pelo mesmo motivo da cópia do tipo:
 * `empresa-ativa.ts` é `server-only`. As duas pontas têm que concordar no nome
 * — se divergirem, o cookie é escrito num nome que ninguém lê e a RSC volta
 * silenciosamente para a empresa padrão.
 */
export const COOKIE_EMPRESA = 'capi_empresa';

/**
 * A empresa que sempre existe. Cópia de `EMPRESA_DEFAULT_ID` (`empresas.ts`).
 *
 * É para ela que se cai quando a escolha guardada não está mais na lista — e
 * não para a primeira da lista, como faz o `useBrandStore`. É a regra D-4, que
 * o servidor já aplica em `resolverEmpresaId()`: empresa apagada volta para a
 * padrão. Se as duas pontas discordassem, a tela mostraria uma empresa e o
 * header `X-Empresa-Id` pediria outra.
 */
const EMPRESA_DEFAULT = 'default';

/** 1 ano. Mesmo valor de `COOKIE_EMPRESA_MAX_AGE` em `empresa-ativa.ts`. */
const MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Espelha a empresa escolhida no cookie que o servidor lê.
 *
 * Por que o cookie existe, se `pedir()` já manda o header `X-Empresa-Id`: o
 * header só existe em chamada de API feita pela tela. Página de servidor (RSC)
 * renderiza ANTES de qualquer fetch do cliente e não recebe header de
 * aplicação nenhum — `empresaDaPagina()` só tem o cookie. Sem o espelho, um
 * `localStorage` dizendo "empresa B" conviveria com um servidor renderizando a
 * empresa padrão, e a tela se contradiria.
 *
 * Os atributos batem com `atributosDoCookieEmpresa()` (`empresa-ativa.ts`), e
 * cada um tem motivo:
 *
 *  - `Path=/` — o console inteiro lê a escolha, não só uma rota;
 *  - `Max-Age` de 1 ano — escolher empresa é preferência de trabalho, não
 *    sessão; expirar junto com o login faria o operador voltar para a empresa
 *    padrão toda manhã;
 *  - `SameSite=Lax` — nenhuma navegação de terceiro precisa carregar a escolha;
 *  - **sem `HttpOnly`** — é justamente a tela que escreve este cookie. Ele não
 *    é credencial: SELECIONA, não autoriza. Quem autoriza continua sendo
 *    `capi_sessao`, e toda rota de empresa exige sessão;
 *  - `Secure` **condicional**, nunca fixo — o console também roda em
 *    `http://localhost:3333`, e ali um `Secure` faria o navegador descartar o
 *    cookie em silêncio: a tela trocaria de empresa e o servidor nunca saberia.
 */
export function escreverCookieEmpresa(id: string): void {
  if (typeof document === 'undefined') return;
  try {
    const seguro = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_EMPRESA}=${encodeURIComponent(id)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${seguro}`;
  } catch {
    /* cookies bloqueados — a chamada de API ainda leva o header, que basta para a tela */
  }
}

export const useEmpresaStore = create<EmpresaState>()(
  persist(
    (set, get) => ({
      empresas: [],
      empresaAtivaId: EMPRESA_DEFAULT,
      carregando: false,
      carregado: false,
      erro: null,
      rascunhoSujo: false,

      carregar: async () => {
        if (get().carregando) return;
        set({ carregando: true });
        // A escolha no momento em que a leitura sai. Se ela mudar enquanto a
        // resposta vem (outra aba trocou para uma empresa que acabou de criar),
        // a lista que chega pode ser ANTERIOR à empresa nova, e a regra D-4
        // abaixo reconduziria para a padrão, com o `persist` levando todas as
        // abas junto (revisão da C2, ressalva 5). Nesse caso relê em vez de
        // reconduzir. A segunda leitura já sai com a escolha nova e decide
        // normalmente, então não há laço.
        const pedida = get().empresaAtivaId;
        let reler = false;
        try {
          // `ativa` vem na resposta porque o servidor já resolveu
          // header → cookie → 'default' para poder responder. Não o usamos para
          // sobrescrever a escolha local: `pedir()` MANDOU `empresaAtivaId` no
          // header, então, quando a escolha continua válida, os dois lados já
          // são o mesmo valor. Quando ela não é mais válida, a regra é D-4 —
          // 'default' — e está escrita logo abaixo, de um jeito que não depende
          // da resposta chegar completa.
          const dados = await pedir<{ empresas: EmpresaPublica[]; ativa: string }>('/api/empresas', {
            cache: 'no-store',
          });
          const empresas = dados.empresas ?? [];
          const atual = get().empresaAtivaId;
          if (atual !== pedida && !empresas.some((e) => e.id === atual)) {
            set({ empresas, carregado: true, erro: null });
            reler = true;
            return;
          }
          const escolhida = empresas.some((e) => e.id === atual) ? atual : EMPRESA_DEFAULT;

          set({ empresas, carregado: true, erro: null, empresaAtivaId: escolhida });

          // Espelho do cookie em TODA carga, não só na troca: a primeira
          // abertura do console num navegador que já tinha a escolha em
          // `localStorage` (ou que perdeu o cookie) precisa reconciliar os dois
          // antes da próxima navegação de servidor.
          escreverCookieEmpresa(escolhida);
        } catch (e) {
          // Mesmo tratamento do `useBrandStore`: a falha vira mensagem, nunca
          // silêncio. Lista vazia sem erro seria indistinguível de "não há
          // empresa nenhuma" — e no seletor do cabeçalho isso é um convite a
          // recadastrar um cliente que já existe.
          set({
            carregado: true,
            erro: e instanceof Error ? e.message : 'Não foi possível ler as empresas.',
          });
        } finally {
          set({ carregando: false });
          if (reler) void get().carregar();
        }
      },

      /**
       * Troca a empresa que o operador está olhando.
       *
       * A ORDEM é o ponto:
       *
       *  1. cookie primeiro, para que qualquer navegação de servidor que
       *     aconteça a seguir já renderize a empresa certa;
       *  2. estado depois, porque é dele que `pedir()` lê o header
       *     `X-Empresa-Id` — o passo 3 precisa que ele já esteja trocado;
       *  3. recarga dos Pixels, porque a lista de Pixels é por empresa. Sem
       *     isso a tela ficaria com o nome da empresa nova e o Pixel da antiga.
       *
       * `router.refresh()` NÃO acontece aqui: o store não conhece o router, e
       * fingir que conhece o acoplaria ao Next inteiro. Quem chama decide se a
       * página precisa ser reconstruída.
       */
      setEmpresaAtiva: async (id) => {
        escreverCookieEmpresa(id);
        set({ empresaAtivaId: id });
        await useBrandStore.getState().carregar();
      },

      /**
       * Cria (sem `id`) ou edita (com `id`) uma empresa.
       *
       * 🔴 D-19 — este corpo NUNCA carrega `pixelId`, `accessToken` nem
       * `testCode`. Não é esquecimento nem economia: `PUT /api/empresas` recusa
       * esses campos com 400 de propósito, para que ninguém acredite ter salvo
       * um Pixel por aqui. Credencial vai por `PUT /api/marcas`
       * (`useBrandStore.salvarMarca`), que é o caminho que guarda o token fora
       * do que volta para a tela.
       *
       * Devolve a empresa como o servidor a gravou — é dela que o diálogo tira
       * o `id` recém-criado para, em seguida, salvar o primeiro Pixel.
       */
      salvarEmpresa: async (dados) => {
        const resposta = await pedir<{ empresa: EmpresaPublica; criada: boolean }>('/api/empresas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(dados.id ? { id: dados.id.trim() } : {}),
            nome: dados.nome.trim(),
            ...(dados.slug !== undefined ? { slug: dados.slug.trim() } : {}),
            ...(dados.plataforma !== undefined ? { plataforma: dados.plataforma.trim() } : {}),
            ...(dados.logoDataUrl !== undefined ? { logoDataUrl: dados.logoDataUrl.trim() } : {}),
            ...(dados.logoUrl !== undefined ? { logoUrl: dados.logoUrl.trim() } : {}),
            ...(dados.cor !== undefined ? { cor: dados.cor.trim() } : {}),
          }),
        });
        // Relemos em vez de mesclar no cliente: o servidor normaliza o slug,
        // garante a empresa padrão em primeiro lugar e pode ter gerado o id.
        await get().carregar();
        return resposta.empresa;
      },

      /**
       * Apaga uma empresa (D-17) — e, com ela, os Pixels dela.
       *
       * A confirmação vai NO CORPO porque é o servidor que exige: apagar
       * arrasta os Pixels junto, e isso não pode ser acionável por uma aba
       * velha repetindo a requisição. As três travas (padrão intocável,
       * automático ligado, Pixels antes da empresa) moram em `removerEmpresa()`
       * no servidor; aqui só se pede.
       */
      removerEmpresa: async (id) => {
        await pedir(`/api/empresas?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmar: true }),
        });
        // Se a apagada era a ativa, `carregar()` já reconduz para 'default'
        // (D-4) e reescreve o cookie — por isso não há nada a corrigir aqui.
        await get().carregar();
      },

      /**
       * A empresa ativa.
       *
       * Cai na PADRÃO antes de cair na primeira da lista, ao contrário de
       * `useBrandStore.ativa()`: a padrão é a instalação que já existe, dona do
       * `integracoes.json` de hoje. `empresas[0]` fica como último recurso para
       * a janela entre a montagem e a primeira carga, quando a lista ainda está
       * vazia e nem a padrão chegou.
       */
      ativa: () => {
        const { empresas, empresaAtivaId } = get();
        return (
          empresas.find((e) => e.id === empresaAtivaId) ??
          empresas.find((e) => e.id === EMPRESA_DEFAULT) ??
          empresas[0]
        );
      },

      marcarRascunho: (sujo) => {
        if (get().rascunhoSujo !== sujo) set({ rascunhoSujo: sujo });
      },
    }),
    {
      name: CHAVE_EMPRESA_ATIVA,
      // só a escolha do usuário é persistida; a lista vem sempre do servidor
      // (e `rascunhoSujo` é desta aba: não entra aqui)
      partialize: (s) => ({ empresaAtivaId: s.empresaAtivaId }) as Partial<EmpresaState>,
    }
  )
);

/**
 * T6 (C2) — outra aba trocou a empresa.
 *
 * O `persist` grava a escolha no `localStorage`, que é compartilhado entre as
 * abas; o navegador entrega o evento `storage` só às OUTRAS abas. Sem este
 * ouvinte, a aba 2 seguia dizendo "Empresa A" enquanto o cookie (também
 * compartilhado) já dizia "Empresa B" — e o próximo "Salvar" dela gravava os
 * dados de A na empresa B.
 *
 * O valor está no formato do `persist` — `{"state":{"empresaAtivaId":"…"},
 * "version":0}` —, nunca o id cru. Qualquer outra coisa (outra chave, chave
 * apagada, JSON quebrado, formato estranho) é ignorada em silêncio: na dúvida,
 * a aba fica onde está e o servidor continua recusando a escrita divergente.
 *
 * 🔴 O evento só diz QUE a chave mudou; o valor lido é o gravado AGORA, e não
 * o `e.newValue` (revisão da C2, ressalva 1). O `newValue` é histórico: uma
 * aba congelada acorda com vários eventos na fila, e seguir cada um fazia
 * esta aba regravar valores velhos pelo `persist`. Cada regravação virava um
 * `storage` na outra aba, que fazia o mesmo, e as duas trocavam B↔C sem parar.
 * Lendo o valor atual, esta aba só adota o que já está gravado: a escrita do
 * `persist` que se segue é igual ao gravado e, pela especificação, não chega
 * a aba nenhuma.
 *
 * R5: compara com o estado atual ANTES de agir. O próprio `persist` desta aba
 * regrava a chave depois do `setState` abaixo, e esse eco não pode virar uma
 * segunda troca. O resto da fila de eventos atrasados cai aqui também.
 *
 * O store não conhece o router (ver `setEmpresaAtiva`): ele acompanha a troca e
 * avisa a janela com {@link EVENTO_EMPRESA_TROCADA_FORA}. Quem recarrega a tela,
 * ou só avisa porque há rascunho, é o `SeletorDeEmpresa`.
 */
function aoMudarEmOutraAba(e: StorageEvent): void {
  if (e.key !== CHAVE_EMPRESA_ATIVA) return;
  let id: unknown;
  try {
    const agora = window.localStorage.getItem(CHAVE_EMPRESA_ATIVA);
    const gravado = JSON.parse(agora ?? 'null') as { state?: { empresaAtivaId?: unknown } } | null;
    id = gravado?.state?.empresaAtivaId;
  } catch {
    // JSON quebrado, ou `localStorage` bloqueado: a aba fica onde está.
    return;
  }
  if (typeof id !== 'string' || !id.trim()) return;

  const estado = useEmpresaStore.getState();
  const anterior = estado.empresaAtivaId;
  if (id === anterior) return;

  // Mesma ordem de `setEmpresaAtiva`: cookie, estado, Pixels.
  escreverCookieEmpresa(id);
  useEmpresaStore.setState({ empresaAtivaId: id });
  void useBrandStore.getState().carregar();
  // Empresa criada na outra aba ainda não está na lista desta: sem reler, o
  // cabeçalho mostraria o nome errado (`ativa()` cairia na padrão).
  if (!estado.empresas.some((x) => x.id === id)) void useEmpresaStore.getState().carregar();

  const detail: DetalheTrocaFora = { id, anterior };
  window.dispatchEvent(new CustomEvent<DetalheTrocaFora>(EVENTO_EMPRESA_TROCADA_FORA, { detail }));
}

if (typeof window !== 'undefined') {
  // Uma inscrição só por janela, mesmo com o módulo reavaliado pelo HMR.
  const janela = window as Window & { __capiDesligarAbasEmpresa?: () => void };
  janela.__capiDesligarAbasEmpresa?.();
  window.addEventListener('storage', aoMudarEmOutraAba);
  janela.__capiDesligarAbasEmpresa = () => window.removeEventListener('storage', aoMudarEmOutraAba);
}
