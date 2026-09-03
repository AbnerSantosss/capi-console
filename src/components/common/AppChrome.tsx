'use client';

import { useEffect } from 'react';
import { useUserStore } from '@/stores/useUserStore';

/**
 * Aplica as preferências visuais no elemento <html>.
 *
 * Fica num componente próprio, sem UI, para que o <html> do layout continue
 * sendo renderizado no servidor. O atributo `data-densidade` liga os presets
 * de --ui-scale definidos em globals.css.
 */
export function AppChrome() {
  const densidade = useUserStore((s) => s.densidade);
  const fundoAnimado = useUserStore((s) => s.fundoAnimado);

  useEffect(() => {
    document.documentElement.dataset.densidade = densidade;
  }, [densidade]);

  useEffect(() => {
    document.body.classList.toggle('app-mesh-vivo', fundoAnimado);
  }, [fundoAnimado]);

  return null;
}

export default AppChrome;
