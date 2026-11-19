'use client';

/**
 * M-01 — as recusas da Meta por Pixel, para a faixa da empresa e para o cartão
 * do Pixel.
 *
 * Só LÊ: `GET /api/inbox/resumo?dias=7`. Não envia nada à Meta.
 *
 * - Manda o `X-Empresa-Id` explícito e descarta a resposta de outra empresa
 *   (o mesmo cuidado de `VisaoGeral.tsx`).
 * - Devolve só os Pixels que AINDA estão com problema (`aceitouDepois` falso).
 * - Falha de leitura não vira erro de tela: sem leitura, sem aviso.
 * - `releitura` é só um gatilho: quando muda (a faixa passa o endereço da
 *   tela), o resumo é lido de novo. O aviso não pisca: o valor antigo fica
 *   até o novo chegar.
 */

import { useEffect, useState } from 'react';

import { pedir } from '@/lib/cliente-api';
import { DIAS_DO_AVISO } from '@/lib/erro-meta';
import type { RecusaPorPixel, ResumoInbox } from '@/lib/inbox-resumo';

export interface RecusasDaMeta {
  /** Do Pixel com mais recusas para o com menos. Vazio = nada a avisar. */
  recusas: RecusaPorPixel[];
  /** `false` quando a leitura não alcançou os 7 dias inteiros. */
  cobreAJanela: boolean;
}

const VAZIO: RecusasDaMeta = { recusas: [], cobreAJanela: true };

export function useRecusasDaMeta(empresaId: string, releitura: string | null = ''): RecusasDaMeta {
  const [estado, setEstado] = useState<{ empresaId: string; dados: RecusasDaMeta } | null>(null);

  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    void (async () => {
      try {
        const resposta = await pedir<{ resumo: ResumoInbox; empresaId?: string }>(
          `/api/inbox/resumo?dias=${DIAS_DO_AVISO}`,
          { cache: 'no-store', headers: { 'X-Empresa-Id': empresaId } }
        );
        if (!vivo || resposta.empresaId !== empresaId) return;
        setEstado({
          empresaId,
          dados: {
            recusas: (resposta.resumo.recusasPorPixel ?? []).filter((r) => !r.aceitouDepois),
            cobreAJanela: resposta.resumo.amostraCobreJanela,
          },
        });
      } catch {
        // Aviso não vira erro de tela. Sessão vencida já redireciona em `pedir`.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [empresaId, releitura]);

  return estado && estado.empresaId === empresaId ? estado.dados : VAZIO;
}
