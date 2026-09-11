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

interface BrandState {
  marcas: MarcaPublica[];
  marcaAtivaId: string;
  carregando: boolean;
  carregado: boolean;

  carregar: () => Promise<void>;
  setMarcaAtiva: (id: string) => void;
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

export const useBrandStore = create<BrandState>()(
  persist(
    (set, get) => ({
      marcas: [],
      marcaAtivaId: 'default',
      carregando: false,
      carregado: false,

      carregar: async () => {
        if (get().carregando) return;
        set({ carregando: true });
        try {
          const dados = await pedir<{ marcas: MarcaPublica[] }>('/api/marcas', { cache: 'no-store' });
          const marcas = dados.marcas ?? [];
          set((s) => ({
            marcas,
            carregado: true,
            marcaAtivaId: marcas.some((m) => m.id === s.marcaAtivaId)
              ? s.marcaAtivaId
              : (marcas[0]?.id ?? 'default'),
          }));
        } catch {
          set({ carregado: true });
        } finally {
          set({ carregando: false });
        }
      },

      setMarcaAtiva: (id) => set({ marcaAtivaId: id }),

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
