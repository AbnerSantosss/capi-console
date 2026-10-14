'use client';

/**
 * O olho das peças que animam sozinhas (ícone, funil): um `<span hidden>` que
 * observa o ELEMENTO PAI e escreve nele
 * - `data-visivel` quando pelo menos 30% dele está na tela;
 * - `data-oculto` quando a aba do navegador está escondida.
 * O CSS (`cenas.module.css`) pausa o movimento sem `data-visivel` ou com
 * `data-oculto`, então nada anda fora da vista.
 *
 * Mora num arquivo próprio para que o ícone e o funil possam ser renderizados
 * no servidor: só este pedaço vira código do navegador, e nenhuma função
 * (o desenho do ícone) precisa atravessar a fronteira servidor/navegador.
 */

import React, { useEffect, useRef } from 'react';

export function Vigia() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const alvo = ref.current?.parentElement;
    if (!alvo) return;

    const marcarAba = () => {
      if (document.hidden) alvo.setAttribute('data-oculto', '');
      else alvo.removeAttribute('data-oculto');
    };
    marcarAba();
    document.addEventListener('visibilitychange', marcarAba);

    if (typeof IntersectionObserver === 'undefined') {
      alvo.setAttribute('data-visivel', '');
      return () => document.removeEventListener('visibilitychange', marcarAba);
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting && entrada.intersectionRatio >= 0.3) {
            alvo.setAttribute('data-visivel', '');
          } else {
            alvo.removeAttribute('data-visivel');
          }
        }
      },
      { threshold: [0, 0.3] },
    );
    observador.observe(alvo);

    return () => {
      observador.disconnect();
      document.removeEventListener('visibilitychange', marcarAba);
    };
  }, []);

  return <span ref={ref} hidden />;
}
