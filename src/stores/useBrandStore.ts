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

export interface MarcaPublica {
  id: string;
  nome: string;
  pixelId: string;
  temToken: boolean;
  testCode: string;
  adAccountId?: string;
  doEnv?: boolean;
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
