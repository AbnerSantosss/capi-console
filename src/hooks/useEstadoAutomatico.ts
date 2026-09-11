'use client';

/**
 * Estado do disparo automatico, em um lugar so.
 *
 * O menu e o Guia precisam responder a mesma pergunta — "o automatico esta
 * ligado?" — e nunca podem discordar da aba Regras. Por isso a leitura fica
 * num store compartilhado: quem montar primeiro busca, os outros reaproveitam.
 *
 * So LE (GET /api/integracoes). Nao salva regra, nao dispara nada.
 */

import { useEffect } from 'react';
import { create } from 'zustand';

import { pedir } from '@/lib/cliente-api';
import { useBrandStore } from '@/stores/useBrandStore';
import type { Integracoes } from '@/lib/config-store';

interface EstadoAuto {
  regrasAuto: number;
  carregado: boolean;
  carregando: boolean;
  carregar: () => Promise<void>;
}

const useStore = create<EstadoAuto>()((set, get) => ({
  regrasAuto: 0,
  carregado: false,
  carregando: false,
  carregar: async () => {
    if (get().carregando || get().carregado) return;
    set({ carregando: true });
    try {
      const dados = await pedir<{ integracoes: Integracoes }>('/api/integracoes', {
        cache: 'no-store',
      });
      const regras = dados.integracoes?.regras ?? [];
      set({
        regrasAuto: regras.filter((r) => r.ativo && r.modo === 'auto').length,
        carregado: true,
      });
    } catch {
      // 401 ja redireciona no cliente-api; outro erro nao pode derrubar o menu.
      set({ carregado: true });
    } finally {
      set({ carregando: false });
    }
  },
}));

export type SituacaoAuto = 'carregando' | 'desligado' | 'teste' | 'producao';

export interface EstadoAutomatico {
  regrasAuto: number;
  /** A marca ativa esta com codigo de teste preenchido. */
  emTeste: boolean;
  carregado: boolean;
  situacao: SituacaoAuto;
  /** Rotulo curto para selo. Ex.: "Desligado", "2 em produção". */
  rotulo: string;
}

export function useEstadoAutomatico(): EstadoAutomatico {
  const regrasAuto = useStore((s) => s.regrasAuto);
  const carregado = useStore((s) => s.carregado);
  const carregar = useStore((s) => s.carregar);

  const marcas = useBrandStore((s) => s.marcas);
  const marcaAtivaId = useBrandStore((s) => s.marcaAtivaId);
  const marcasCarregadas = useBrandStore((s) => s.carregado);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ativa = marcas.find((m) => m.id === marcaAtivaId) ?? marcas[0];
  const emTeste = Boolean(ativa?.testCode?.trim());

  let situacao: SituacaoAuto = 'carregando';
  let rotulo = '—';

  if (carregado && marcasCarregadas) {
    if (regrasAuto === 0) {
      situacao = 'desligado';
      rotulo = 'Desligado';
    } else if (emTeste) {
      situacao = 'teste';
      rotulo = `${regrasAuto} em teste`;
    } else {
      situacao = 'producao';
      rotulo = `${regrasAuto} em produção`;
    }
  }

  return { regrasAuto, emTeste, carregado: carregado && marcasCarregadas, situacao, rotulo };
}
