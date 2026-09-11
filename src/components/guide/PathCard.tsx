'use client';

/**
 * Card de um dos dois caminhos ate a Meta.
 *
 * O feixe de borda (BorderBeam) so corre no caminho que esta ATIVO. Se ele
 * corresse nos dois viraria enfeite; correndo em um so, ele informa.
 *
 * Icone: Phosphor duotone, e so aqui e nos tiles de topico. Todo controle
 * (botao, input, menu) continua em Lucide.
 */

import Link from 'next/link';

import { BorderBeam } from '@/components/ui/border-beam';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Caminho } from './conteudo';
import { CLASSE_HUE } from './hue';
import styles from './guide.module.css';

export function PathCard({
  caminho,
  estado,
  ativo,
  animar,
}: {
  caminho: Caminho;
  /** Linha de estado: "sempre disponível", "Desligado", "1 em produção". */
  estado: string;
  /** Este e o caminho em uso agora. */
  ativo: boolean;
  animar: boolean;
}) {
  const Icone = caminho.icone;

  return (
    <div className={cn(styles.pathCard, CLASSE_HUE[caminho.hue])}>
      {ativo && animar && (
        <BorderBeam
          size={110}
          duration={9}
          borderWidth={1.4}
          colorFrom="transparent"
          colorTo="var(--hue)"
        />
      )}

      <div className="flex items-start gap-3">
        <span className={cn(styles.tile, styles.tileSm)} aria-hidden>
          <Icone size={24} weight="duotone" />
        </span>
        <div className="min-w-0">
          <p className={styles.pathEyebrow}>{caminho.eyebrow}</p>
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
