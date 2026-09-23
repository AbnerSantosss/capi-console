import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pedir } from '@/lib/cliente-api';

/**
 * Marcas no cliente.
 *
 * O token de acesso NAO mora aqui. Ele fica em config/marcas.json, no servidor.
 * O cliente so conhece `temToken: boolean`. Antes desta versao o token era
 * persistido em localStorage, o que contraria a regra 2 do CLAUDE.md.
 * `limparLegado()` apaga a chave antiga se ela ainda existir no navegador.
 *
 * Desde a rota /pixels este store tambem GRAVA. O motivo nao e comodidade: a
 * lista saiu do modal e virou pagina, entao criar, editar e apagar passaram a
 * acontecer num lugar e a precisar aparecer em outro (cabecalho e disparo
 * manual) sem recarga. Concentrar a escrita aqui e o que garante que os dois
 * leem a mesma lista — e e o que permite ao formulario nunca escrever o nome
 * do campo de segredo (decisao irreversivel #8): a traducao acontece nesta
 * camada, fora de src/components.
 */

/**
 * COPIA da `MarcaPublica` de `src/lib/config-store.ts`.
 *
 * 🔴 Nao da para importar de la: aquele arquivo abre com `import 'server-only'`
 * e este store roda no navegador. A copia e obrigatoria — o que nao e
 * obrigatorio e ela divergir. Ao mexer na forma publicada por
 * `publicarMarca()`, mexa TAMBEM aqui: o `tsc` nao liga os dois lados, entao
 * um campo esquecido aqui nao quebra a compilacao, so some silenciosamente da
 * tela.
 */
export interface MarcaPublica {
  id: string;
  nome: string;
  pixelId: string;
  temToken: boolean;
  testCode: string;
  adAccountId?: string;
  doEnv?: boolean;
  /**
   * Disparo automatico DESTE Pixel. Chega do servidor ja NORMALIZADO por
   * `publicarMarca()` (`m.autoDisparo === true`), por isso aqui e booleano
   * firme, nunca opcional: quem le este tipo nao precisa — e nao deve —
   * repetir a normalizacao com `!!`, `?? true` ou `!== false`.
   */
  autoDisparo: boolean;
  /**
   * Empresa dona do Pixel, ja resolvida no servidor por `empresaDaMarca()` —
   * firme, como `autoDisparo`. O servidor ja mandava; faltava so aqui. O
   * disparo manual usa para nunca abrir marcado o Pixel de outra empresa (F1).
   */
  empresaId: string;
}

/** O que o formulario de Pixel devolve. `token` vazio mantem o do servidor. */
export interface EntradaDeMarca {
  /** Ausente em Pixel novo: o store gera o id. */
  id?: string;
  nome: string;
  pixelId: string;
  /** So de ida. Nunca volta do servidor, nunca e guardado no navegador. */
  token: string;
  testCode: string;
  adAccountId: string;
}

interface BrandState {
  marcas: MarcaPublica[];
  marcaAtivaId: string;
  carregando: boolean;
  carregado: boolean;
  /** Mensagem da ultima falha de leitura. Null quando a lista esta boa. */
  erro: string | null;

  carregar: () => Promise<void>;
  setMarcaAtiva: (id: string) => void;
  salvarMarca: (dados: EntradaDeMarca) => Promise<void>;
  /** Liga ou desliga o disparo automatico DE UM Pixel (FASE 6, 9.C). */
  definirAutoDisparo: (id: string, ligado: boolean) => Promise<void>;
  removerMarca: (id: string) => Promise<void>;
  ativa: () => MarcaPublica | undefined;
}

const CHAVE_LEGADO = 'capi_marcas_v2';

/** Remove o token que versoes anteriores deixaram no navegador. */
export function limparLegado(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(CHAVE_LEGADO)) {
      window.localStorage.removeItem(CHAVE_LEGADO);
      return true;
    }
  } catch {
    /* storage bloqueado — nada a fazer */
  }
  return false;
}

/** Id novo de marca. Fora do render de proposito: Date.now() la e impuro. */
function novoId(): string {
  return `marca_${Date.now().toString(36)}`;
}

export const useBrandStore = create<BrandState>()(
  persist(
    (set, get) => ({
      marcas: [],
      marcaAtivaId: 'default',
      carregando: false,
      carregado: false,
      erro: null,

      carregar: async () => {
        if (get().carregando) return;
        set({ carregando: true });
        try {
          const dados = await pedir<{ marcas: MarcaPublica[] }>('/api/marcas', { cache: 'no-store' });
          const marcas = dados.marcas ?? [];
          set((s) => ({
            marcas,
            carregado: true,
            erro: null,
            marcaAtivaId: marcas.some((m) => m.id === s.marcaAtivaId)
              ? s.marcaAtivaId
              : (marcas[0]?.id ?? 'default'),
          }));
        } catch (e) {
          // Ate aqui a falha era engolida em silencio e a tela ficava com uma
          // lista vazia indistinguivel de "nao ha Pixel nenhum" — que em
          // /pixels seria um convite a cadastrar o que ja existe.
          set({
            carregado: true,
            erro: e instanceof Error ? e.message : 'Não foi possível ler os Pixels.',
          });
        } finally {
          set({ carregando: false });
        }
      },

      setMarcaAtiva: (id) => set({ marcaAtivaId: id }),

      salvarMarca: async (dados) => {
        const id = dados.id?.trim() || novoId();
        await pedir('/api/marcas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            nome: dados.nome.trim(),
            pixelId: dados.pixelId.trim(),
            accessToken: dados.token,
            testCode: dados.testCode.trim(),
            adAccountId: dados.adAccountId.trim(),
          }),
        });
        // Relemos em vez de mesclar no cliente: uma marca sem token proprio
        // herda o do .env, e so o servidor sabe dizer se `temToken` virou true.
        await get().carregar();
      },

      /**
       * O Switch do cartao de Pixel.
       *
       * Vai pelo mesmo PUT /api/marcas do formulario — nao ha rota nova (9.C,
       * "Backend: nenhuma rota nova"). O que muda e a INTENCAO do corpo:
       *
       *   - `accessToken: ''` significa "nao mexer no token" (a regra de
       *     mesclagem de `salvarMarca` no servidor). O token nunca sobe daqui:
       *     o cliente nao o tem e nao deve ter (decisao irreversivel #8).
       *   - `autoDisparo` sobe como booleano de verdade. O servidor so aceita
       *     booleano; qualquer outra coisa ele ignora em vez de coagir.
       *
       * Os demais campos vao com o valor publico atual porque o PUT valida
       * `nome` e `pixelId` obrigatorios. Se o Pixel nao estiver na lista, nao
       * ha o que mandar — e mandar um corpo inventado seria pior.
       *
       * Nao ha atualizacao otimista: quem decide se ligou e o servidor, e a
       * lista e relida. C-6 — o switch nao volta sozinho; o cartao mostra
       * "Salvando…" ate a resposta e o erro sobe para quem chamou.
       */
      definirAutoDisparo: async (id, ligado) => {
        const marca = get().marcas.find((m) => m.id === id);
        if (!marca) throw new Error('Pixel não encontrado na lista.');
        await pedir('/api/marcas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: marca.id,
            nome: marca.nome,
            pixelId: marca.pixelId,
            accessToken: '',
            testCode: marca.testCode,
            adAccountId: marca.adAccountId ?? '',
            autoDisparo: ligado,
          }),
        });
        await get().carregar();
      },

      removerMarca: async (id) => {
        await pedir(`/api/marcas?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        // `carregar` reconduz o ativo para o primeiro da lista se o apagado
        // era o ativo — por isso nao ha nada a corrigir aqui.
        await get().carregar();
      },

      ativa: () => {
        const { marcas, marcaAtivaId } = get();
        return marcas.find((m) => m.id === marcaAtivaId) ?? marcas[0];
      },
    }),
    {
      name: 'capi_marca_ativa_v3',
      // so a escolha do usuario e persistida; a lista vem sempre do servidor
      partialize: (s) => ({ marcaAtivaId: s.marcaAtivaId }) as Partial<BrandState>,
    }
  )
);
