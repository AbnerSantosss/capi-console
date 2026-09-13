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
import type { Integracoes, RegraRoteamento } from '@/lib/config-store';

interface EstadoAuto {
  /**
   * As regras de roteamento inteiras. `null` significa NAO SEI — leitura ainda
   * nao feita, ou feita e falhada. `null` nunca deve virar `[]`: quem conta
   * regras para dizer um numero ao usuario (PX-11, estado 🟡 de 8.2.3) precisa
   * saber a diferenca entre "zero regras" e "nao consegui ler".
   */
  regras: RegraRoteamento[] | null;
  regrasAuto: number;
  carregado: boolean;
  carregando: boolean;
  carregar: () => Promise<void>;
}

const useStore = create<EstadoAuto>()((set, get) => ({
  regras: null,
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
        regras,
        regrasAuto: regras.filter((r) => r.ativo && r.modo === 'auto').length,
        carregado: true,
      });
    } catch {
      // 401 ja redireciona no cliente-api; outro erro nao pode derrubar o menu.
      // `regras` fica em null de proposito: quem conta prefere nao dizer numero.
      set({ carregado: true });
    } finally {
      set({ carregando: false });
    }
  },
}));

/**
 * As regras de roteamento, lidas UMA vez por sessao de navegacao.
 *
 * 🔴 Existe porque a premissa de `08` §8.4 estava errada: o blueprint dizia que
 * a contagem de regras `auto` por Pixel "ja esta disponivel no cliente". Nao
 * estava — este store reduzia tudo a um unico numero GLOBAL (`regrasAuto`) e o
 * array nunca saia daqui. Sem isto, /pixels precisava fazer um SEGUNDO
 * GET /api/integracoes, alem do que o cabecalho ja faz em toda pagina.
 *
 * So LE. Quem salva regra e a aba Regras, por outro caminho.
 */
export function useRegrasDeRoteamento(): RegraRoteamento[] | null {
  const regras = useStore((s) => s.regras);
  const carregar = useStore((s) => s.carregar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return regras;
}

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
