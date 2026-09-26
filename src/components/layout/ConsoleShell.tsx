import type { ReactNode } from 'react';

import { ConsoleBackground } from './ConsoleBackground';
import styles from './console.module.css';

/**
 * A casca de toda tela protegida: fundo, lateral de empresas e conteúdo.
 *
 * V3 (v7): a partir de `lg` (64rem) a casca é uma grade de duas colunas, a
 * lateral de empresas (248px) e o conteúdo; abaixo, uma coluna só, e as
 * empresas abrem na gaveta do cabeçalho (`console.module.css`, `.shell`).
 * Quem navega entre as telas de uma empresa são as 7 abas no topo do
 * conteúdo, em qualquer largura; não existe mais barra fixa embaixo, e a
 * página não reserva espaço para ela.
 *
 * `lateral` chega pronta do layout do servidor, com a lista de empresas que
 * ele leu. O atributo `data-console` (V1) fica no `div` raiz da casca: é ele
 * que liga os tokens do console, e a grade não muda isso.
 */
export function ConsoleShell({ lateral, children }: { lateral?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.shell} data-console>
      <ConsoleBackground />
      {lateral}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
