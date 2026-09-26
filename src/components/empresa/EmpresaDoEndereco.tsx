'use client';

/**
 * A empresa do ENDEREÇO manda na tela (V2 do v7).
 *
 * Tudo que fica dentro de `/e/<slug>/…` é montado aqui dentro. Antes de os
 * filhos montarem, o store de empresa e o cookie `capi_empresa` passam a
 * apontar para a empresa do endereço — é o que faz a primeira `pedir()` de
 * qualquer tela já sair com o `X-Empresa-Id` certo.
 *
 * Quem faz o quê:
 *
 *  - o proxy grava o cookie na PRIMEIRA requisição de servidor (bloco (b) de
 *    `src/proxy.ts`): a página de servidor já nasce com a empresa certa;
 *  - este componente alinha o store (de onde `pedir()` tira o header) e o
 *    `document.cookie`, pela mesma função pura que o teste exercita
 *    (`prepararEmpresaDoEndereco`, `navegacao.test.mjs` (d)). A escrita do
 *    cookie aqui é redundante com o proxy de propósito.
 *
 * Quando os filhos aparecem:
 *
 *  - navegando dentro do app (de `/e/alfa` para `/e/beta`), o store ainda está
 *    na empresa anterior no primeiro render: sai só a região de espera; o
 *    `useLayoutEffect` alinha e o React refaz o render ANTES de pintar, já com
 *    os filhos. Ninguém vê a troca, e nenhum filho monta com a empresa errada;
 *  - na primeira carga (HTML do servidor), os filhos vêm prontos do servidor,
 *    que não tem store — escondê-los apagaria a página até o JavaScript
 *    chegar. O alinhamento roda no `useLayoutEffect` da hidratação, que
 *    acontece antes de qualquer `useEffect` dos filhos: a primeira `pedir()`
 *    continua saindo com a empresa do endereço;
 *  - depois de alinhado, fica alinhado. Se outra aba trocar a empresa, quem
 *    reage é o `SeletorDeEmpresa` (leva esta aba à mesma tela da empresa nova,
 *    ou só avisa quando há rascunho). Desmontar os filhos aqui apagaria o
 *    rascunho que aquele aviso existe para proteger.
 *
 * Realinhar a cada mudança do store faria duas abas em empresas diferentes
 * trocarem uma com a outra sem parar (cada escrita vira `storage` na outra).
 * Por isso o alinhamento roda uma vez por empresa: a `key={slug}` do layout e o
 * `[empresaId]` do efeito.
 */

import * as React from 'react';

import { RegiaoDeEspera } from '@/components/common/Esqueleto';
import { prepararEmpresaDoEndereco, travaDeAlinhamento } from '@/lib/empresa-do-endereco';
import { useBrandStore } from '@/stores/useBrandStore';
import { escreverCookieEmpresa, useEmpresaStore } from '@/stores/useEmpresaStore';

export interface EmpresaDoEnderecoProps {
  /** O slug do endereço (`/e/<slug>`). */
  slug: string;
  /** O id da empresa desse slug, resolvido no servidor por `acharEmpresaPorSlug`. */
  empresaId: string;
  /** O nome, para o leitor de tela ouvir o que está abrindo. */
  nome?: string;
  children: React.ReactNode;
}

export function EmpresaDoEndereco({ slug, empresaId, nome, children }: EmpresaDoEnderecoProps) {
  // "Já alinhou uma vez nesta montagem": uma vez verdadeiro, o snapshot não
  // volta a falso, e a troca vinda de outra aba não desmonta a tela.
  const lerAlinhado = React.useMemo(() => travaDeAlinhamento(empresaId, useEmpresaStore), [empresaId]);

  const alinhado = React.useSyncExternalStore(
    useEmpresaStore.subscribe,
    lerAlinhado,
    // Servidor: não há store; os filhos vão no HTML (ver o cabeçalho).
    () => true
  );

  React.useLayoutEffect(() => {
    const { trocou } = prepararEmpresaDoEndereco(empresaId, useEmpresaStore, escreverCookieEmpresa);
    // Mesma sequência de `setEmpresaAtiva`: com a empresa trocada, os Pixels
    // da anterior saem da memória e os desta são lidos.
    if (trocou) void useBrandStore.getState().carregar();
  }, [empresaId]);

  if (!alinhado) {
    return (
      <RegiaoDeEspera rotulo={`Abrindo ${nome || slug}`} className="min-h-40">
        {null}
      </RegiaoDeEspera>
    );
  }

  return <>{children}</>;
}

export default EmpresaDoEndereco;
