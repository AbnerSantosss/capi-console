'use client';

/**
 * Card de um dos dois caminhos ate a Meta.
 *
 * FASE 3b: saiu daqui o feixe de luz que corria pela borda do caminho ativo
 * (BorderBeam, do Magic UI, que saiu do repositorio junto). A intencao era boa
 * — so o caminho em uso brilhava, entao o brilho informava —, mas quem ve a
 * tela ve um feixe de gradiente correndo, que e a assinatura de template do §8;
 * e a informacao "este e o caminho em uso" ja esta escrita em texto, na linha
 * "Agora" do proprio cartao. Estado se le, nao se pisca.
 *
 * Icone: Phosphor duotone, e so aqui e nos tiles de topico. Todo controle
 * (botao, input, menu) continua em Lucide.
 */

import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Caminho } from './conteudo';
import { CLASSE_HUE } from './hue';
import styles from './guide.module.css';

export function PathCard({
  caminho,
  estado,
}: {
  caminho: Caminho;
  /** Linha de estado: "sempre disponível", "Desligado", "1 em produção". */
  estado: string;
}) {
  const Icone = caminho.icone;

  return (
    <div className={cn(styles.pathCard, CLASSE_HUE[caminho.hue])}>
      <div className="flex items-start gap-3">
        <span className={cn(styles.tile, styles.tileSm)} aria-hidden>
          <Icone size={24} weight="duotone" />
        </span>
        <div className="min-w-0">
          {/* Saiu daqui um "Caminho 1" / "Caminho 2" em caixa alta acima do
              titulo. Os dois caminhos sao alternativas, nao etapas: numerar
              sugeria uma ordem que nao existe — ninguem faz o 1 e depois o 2.
              O titulo diz qual e qual sozinho. */}
          <h2 className={styles.pathTitle}>{caminho.titulo}</h2>
        </div>
      </div>

      <p className="text-body text-fg-body">{caminho.definicao}</p>

      <dl className={styles.pathDl}>
        <div className={styles.pathRow}>
          <dt className={styles.pathTerm}>Use quando</dt>
          <dd className={styles.pathDesc}>{caminho.quandoUsar}</dd>
        </div>
        <div className={styles.pathRow}>
          <dt className={styles.pathTerm}>Quem dispara</dt>
          <dd className={styles.pathDesc}>{caminho.quemAperta}</dd>
        </div>
        <div className={styles.pathRow}>
          <dt className={styles.pathTerm}>Agora</dt>
          <dd className={styles.pathDesc}>{estado}</dd>
        </div>
      </dl>

      <Link
        href={caminho.cta.href}
        className={cn(buttonVariants({ variant: 'outline' }), 'mt-1 w-full')}
      >
        {caminho.cta.rotulo}
      </Link>
    </div>
  );
}
