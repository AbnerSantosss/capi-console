'use client';

import { useEffect } from 'react';

import { abaDasRegrasPeloEndereco } from '@/lib/rotas-antigas';

/**
 * Abre a sub-aba certa do Disparo automático dentro da aba Regras, até a V7
 * trocar as sub-abas por blocos numa página só (V2 do v7).
 *
 * O `IntegrationsPage` abre na Caixa de entrada quando a URL não traz
 * `?aba=`, e não conhece as âncoras novas das rotas antigas
 * (`/automatico?aba=retornos` → `/e/<s>/regras#repasse`,
 * `?aba=testes` → `#testes-internos`). Sem esta tradução, a aba chamada
 * "Regras" abriria na Caixa de entrada, que agora mora em Eventos.
 *
 * Só escreve `?aba=` na URL, uma vez, pelo `replaceState` nativo — o mesmo
 * caminho que o `IntegrationsPage` usa para trocar de sub-aba, e que o Next
 * reflete no `useSearchParams` sem reler a página no servidor. Não renderiza
 * nada.
 */
export function AbaInicialDeRegras() {
  useEffect(() => {
    const busca = new URLSearchParams(window.location.search);
    const aba = abaDasRegrasPeloEndereco(busca.get('aba'), window.location.hash);
    if (!aba) return;
    busca.set('aba', aba);
    window.history.replaceState(null, '', `?${busca.toString()}${window.location.hash}`);
  }, []);

  return null;
}
