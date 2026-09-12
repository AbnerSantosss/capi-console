'use client';

/**
 * As duas tarefas que o operador repete: "a venda foi para a Meta?" e "como
 * ligo o envio automatico do Purchase?".
 *
 * Cada cartao entrega pergunta, resposta em uma linha, no maximo tres passos
 * e um link direto. Nada abre, nada anima: a resposta ja esta escrita quando
 * a pagina carrega.
 */

import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TAREFAS } from './conteudo';
import { CLASSE_HUE } from './hue';
import { RichText } from './RichText';
import styles from './guide.module.css';

export function TaskCards() {
  return (
    <ul className={styles.tasks}>
      {TAREFAS.map((tarefa) => {
        const Icone = tarefa.icone;
        return (
          <li key={tarefa.id} className={cn(styles.taskCard, CLASSE_HUE[tarefa.hue])}>
            <h3 className={styles.taskQuestion}>
              <span aria-hidden style={{ color: 'var(--hue)' }}>
                <Icone size={20} weight="duotone" />
              </span>
              {tarefa.pergunta}
            </h3>

            <p className={styles.taskAnswer}>
              <RichText>{tarefa.resposta}</RichText>
            </p>

            <ol className={styles.taskSteps}>
              {tarefa.passos.map((passo) => (
                <li key={passo} className={styles.taskStep}>
                  <span>
                    <RichText>{passo}</RichText>
                  </span>
                </li>
              ))}
            </ol>

            {tarefa.naoConfundir && (
              <p className={styles.taskWarn}>
                <span className={styles.taskWarnLabel}>Não confunda:</span>
                <span>
                  <RichText>{tarefa.naoConfundir}</RichText>
                </span>
              </p>
            )}

            <Link
              href={tarefa.cta.href}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-auto w-full')}
            >
              {tarefa.cta.rotulo}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
