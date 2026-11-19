import type { ReactNode } from 'react';

import type { Icone } from '@/components/ui/icones';

import styles from './console.module.css';

/**
 * Cabecalho de todas as paginas do console (secao 1.5 do redesenho de
 * 18/11/2026).
 *
 * Titulo de 20/28 em peso 700 e uma linha de descricao; a direita, os
 * controles da tela (`size="sm"`) ou a acao principal dela. No celular os
 * controles descem para uma linha propria. Sem icone ao lado do titulo: o
 * glifo duotone que morava aqui disputava com o titulo e repetia o icone da
 * aba logo acima.
 *
 * 🔴 `description`: TETO DE 120 CARACTERES no texto renderizado. Nao ha como o
 * tipo cobrar isso (ela aceita ReactNode, porque duas telas precisam de um
 * <span className="font-mono"> no meio), entao a regra vive aqui e na revisao.
 * Passando disso a linha abaixo do h1 vira paragrafo, e paragrafo nesse lugar
 * ninguem le. Instrucao que nao couber vai para o Guia, na ancora do assunto.
 */
export function ConsolePageHeader({
  title,
  description,
  action,
}: {
  title: string;
  /** Uma frase, no maximo 120 caracteres renderizados. Veja o bloco acima. */
  description: ReactNode;
  /**
   * Sem uso desde o redesenho de 18/11/2026: o titulo nao leva mais icone.
   * Fica no tipo porque as oito paginas ainda o passam; nao e desenhado.
   */
  icon?: Icone;
  action?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderLead}>
        <h1 className={styles.pageTitle}>{title}</h1>
        <p className={styles.pageDescription}>{description}</p>
      </div>
      {action && <div className={styles.pageHeaderActions}>{action}</div>}
    </header>
  );
}
