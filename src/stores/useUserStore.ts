import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Preferencias locais do operador. Nada aqui e segredo.
 *
 * `fundoAnimado` vem desligado: o console mostra numeros e o fundo em
 * movimento competia com eles. Quem quiser pode religar nas preferencias — e
 * mesmo ligado, o CSS respeita prefers-reduced-motion.
 */
export type Densidade = 'compacta' | 'padrao' | 'confortavel';

interface UserState {
  nome: string;
  /** Multiplica toda a escala em rem. Ver --ui-scale em globals.css. */
  densidade: Densidade;
  fundoAnimado: boolean;
  confeteSoEmTeste: boolean;
  setNome: (v: string) => void;
  setDensidade: (v: Densidade) => void;
  setFundoAnimado: (v: boolean) => void;
  setConfeteSoEmTeste: (v: boolean) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      nome: '',
      densidade: 'compacta',
      fundoAnimado: false,
      confeteSoEmTeste: true,
      setNome: (nome) => set({ nome }),
      setDensidade: (densidade) => set({ densidade }),
      setFundoAnimado: (fundoAnimado) => set({ fundoAnimado }),
      setConfeteSoEmTeste: (confeteSoEmTeste) => set({ confeteSoEmTeste }),
    }),
    { name: 'capi_prefs_v3' }
  )
);
