import type { ElementType, ReactNode } from 'react';

import styles from './console.module.css';

/**
 * Cabecalho de todas as paginas do console (V-03).
 *
 * Historico curto: primeiro foi um quadrado de 44px com gradiente ao lado do
 * titulo, igual em cinco telas; depois virou chip de 28px + rotulo em caixa
 * alta ACIMA do titulo. As duas versoes eram a mesma coisa — um enfeite
 * ocupando a linha mais valiosa da pagina. O rotulo acima do titulo ("Visao
 * da empresa", "Primeiro passo") nao dizia nada que o titulo e a descricao
 * logo abaixo ja nao dissessem; era rotulo de rotulo.
 *
 * Agora o titulo e a primeira coisa da pagina, e o icone da area entra DENTRO
 * dele, na mesma linha, so como glifo na tinta do assunto — sem caixa, sem
 * borda, sem fundo. A tinta vem do `data-area` que cada <main> declara.
 */
export function ConsolePageHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description: ReactNode;
  icon: ElementType;
  action?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderLead}>
        <h1 className={styles.pageTitle}>
          <span className={styles.pageTitleMark} aria-hidden="true">
            <Icon size={28} strokeWidth={1.75} />
          </span>
          {title}
        </h1>
        <p className={styles.pageDescription}>{description}</p>
      </div>
      {action && <div className={styles.pageHeaderActions}>{action}</div>}
    </header>
  );
}
