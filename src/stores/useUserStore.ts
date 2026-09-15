import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Preferencias locais do operador. Nada aqui e segredo.
 *
 * `fundoAnimado` e NO-OP desde a FASE 3b do redesign v4: o fundo do console
 * virou uma cor chapada (sem malha, sem grade, sem rede), entao nao ha mais
 * animacao para ligar e o controle saiu da tela de Preferencias. O campo e o
 * setter ficam de proposito — o estado e persistido em localStorage
 * (`capi_prefs_v3`) e remove-lo exigiria uma migracao do persist para nao
 * quebrar quem ja tem a chave gravada. Ler o valor nao muda mais nada em
 * lugar nenhum; nao volte a ligar comportamento nele.
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
