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

  useEffect(() => {
    document.documentElement.dataset.densidade = densidade;
  }, [densidade]);

  /* Aqui havia um segundo efeito ligando `app-mesh-vivo` no <body> conforme a
     preferencia "Fundo com movimento". A classe deixou de existir na FASE 3b
     (o fundo virou uma cor chapada), entao o efeito so podia ligar nada. */

  return null;
}

export default AppChrome;
