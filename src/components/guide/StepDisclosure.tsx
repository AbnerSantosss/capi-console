'use client';

/**
 * Linha expansivel de passo, regra ou dado — o "modal que abre para baixo".
 *
 * Nao e um dialogo: e um disclosure. O cabecalho continua no lugar e o corpo
 * desliza embaixo dele, entao ninguem perde a posicao na pagina. Varios podem
 * ficar abertos ao mesmo tempo.
 */

import { useId, useState } from 'react';
import { AlertTriangle, ChevronDown, MapPin } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ItemGuia } from './conteudo';
import { RichText } from './RichText';
import styles from './guide.module.css';

export function StepDisclosure({
  item,
  numero,
}: {
  item: ItemGuia;
  /** Passo numerado. Sem numero, mostra o icone do item. */
  numero?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const idCorpo = useId();
  const Icone = item.icone;

  return (
    <div className={cn(styles.step, aberto && styles.stepOpen)}>
      <button
        type="button"
        className={styles.stepHead}
        aria-expanded={aberto}
        aria-controls={idCorpo}
        onClick={() => setAberto((v) => !v)}
      >
        <span className={styles.stepBadge} aria-hidden>
          {numero !== undefined ? numero : <Icone size={15} weight="duotone" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn(styles.stepTitle, 'block')}>{item.titulo}</span>
          <span className={cn(styles.stepSummary, 'block')}>{item.resumo}</span>
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-fg-muted transition-transform duration-150',
            aberto && 'rotate-180 text-fg-body'
          )}
          aria-hidden
        />
      </button>

      {aberto && (
        <div id={idCorpo} className={styles.stepBody}>
          <p>
            <RichText>{item.oQue}</RichText>
          </p>

          {item.onde && (
            <p className={cn(styles.stepMeta, 'flex items-start gap-1.5')}>
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold text-fg-body">Onde: </strong>
                <RichText>{item.onde}</RichText>
              </span>
            </p>
          )}

          {item.erro && (
            <p className={styles.stepWarn}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold">Erro comum: </strong>
                <RichText>{item.erro}</RichText>
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
