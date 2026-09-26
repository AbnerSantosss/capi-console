'use client';

import { useEffect, useState } from 'react';

/**
 * A largura em px do elemento, acompanhada por `ResizeObserver`.
 *
 * O funil e a receita desenham o SVG com `viewBox` do tamanho REAL da caixa
 * (1 unidade = 1 px). Com um `viewBox` fixo, o texto do SVG encolheria junto
 * com a tela: num celular de 390px, a legenda de 12px viraria 6px. Assim os
 * rótulos ficam no tamanho da escala (`text-caption`, `text-title`...) em
 * qualquer largura, e só o desenho se estica.
 *
 * Devolve uma ref de FUNÇÃO (`ref={caixa}`): o gráfico pode aparecer depois
 * (ao trocar "Hoje" por "Últimos 7 dias"), e a medida acompanha o elemento que
 * montou, não o que existia no primeiro render.
 *
 * `inicial` é a largura usada até a primeira medida (e no servidor).
 */
export function useLargura<T extends HTMLElement>(inicial: number) {
  const [elemento, setElemento] = useState<T | null>(null);
  const [largura, setLargura] = useState(inicial);

  useEffect(() => {
    if (!elemento || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width ?? 0;
      if (w > 0) setLargura(Math.round(w));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [elemento]);

  return [setElemento, largura] as const;
}
