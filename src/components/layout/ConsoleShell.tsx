import type { ReactNode } from 'react';

import { BarraDeAbas } from './BarraDeAbas';
import { ConsoleBackground } from './ConsoleBackground';
import styles from './console.module.css';

/**
 * A casca de toda tela protegida: fundo, conteúdo e a navegação de rodapé.
 *
 * A barra de abas fica AQUI, e não dentro do cabeçalho, porque ela é fixa na
 * base da janela: montada no `<header>` ela herdaria o `z-index` e o `sticky`
 * de lá. Ela mora depois do conteúdo também na ordem do DOM, que é a ordem em
 * que o leitor de tela encontra as coisas — o cabeçalho já abre a página com
 * a navegação de telas largas.
 *
 * Nada de conteúdo fica atrás dela: todas as páginas do console usam
 * `.page` (`console.module.css`), que reserva
 * `var(--altura-barra-abas) + env(safe-area-inset-bottom) + 1.5rem` de respiro
 * embaixo até 80rem — exatamente onde a barra some.
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <ConsoleBackground />
      <div className={styles.content}>{children}</div>
      <BarraDeAbas />
    </div>
  );
}
