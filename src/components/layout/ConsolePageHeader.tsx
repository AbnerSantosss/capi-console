import type { ReactNode } from 'react';

import type { Icone } from '@/components/ui/icones';

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
 *
 * 🔴 `description`: TETO DE 120 CARACTERES no texto renderizado. Nao ha como o
 * tipo cobrar isso (ela aceita ReactNode, porque duas telas precisam de um
 * <span className="font-mono"> no meio), entao a regra vive aqui e na revisao.
 * Motivo em `console.module.css` (.pageDescription): passando disso a linha
 * abaixo do h1 vira paragrafo, e paragrafo nesse lugar ninguem le. Instrucao
 * que nao couber vai para o Guia, na ancora do assunto.
 */
export function ConsolePageHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  /** Uma frase, no maximo 120 caracteres renderizados. Veja o bloco acima. */
  description: ReactNode;
  /**
   * Tipado como `Icone` (e nao `ElementType`) porque este e o UNICO lugar do
   * console que passa `weight` — e `ElementType` aceitaria qualquer coisa,
   * inclusive um componente que ignora a prop em silencio.
   */
  icon: Icone;
  action?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderLead}>
        <h1 className={styles.pageTitle}>
          <span className={styles.pageTitleMark} aria-hidden="true">
            {/* 1em, nao 28px: o titulo e fluido e o glifo acompanha a letra
                ao lado. Ver `.pageTitleMark` em console.module.css.

                `duotone` e o UNICO peso fora do `regular` em todo o produto, e
                vive so aqui: um glifo por tela, no lugar mais alto dela. A
                segunda camada do duotone e a mesma cor a 20% de opacidade,
                entao o glifo ganha um corpo preenchido na tinta da area sem
                virar um segundo bloco de cor — e o que faz o titulo da pagina
                se distinguir dos 18 titulos de `Section`, que ficam em
                `regular`. Espalhar duotone seria repetir a forma outra vez e
                cair no mesmo erro do quadradinho que a FASE 3a matou. */}
            <Icon size="1em" weight="duotone" />
          </span>
          {title}
        </h1>
        <p className={styles.pageDescription}>{description}</p>
      </div>
      {action && <div className={styles.pageHeaderActions}>{action}</div>}
    </header>
  );
}
