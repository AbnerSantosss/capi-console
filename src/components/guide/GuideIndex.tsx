'use client';

/**
 * Indice do Guia. Barra horizontal rolavel no mobile, coluna fixa no desktop.
 *
 * Clicar num item faz duas coisas, nao uma: rola ate o topico E abre o topico.
 * Um indice que so rola ate um card fechado nao serve para nada.
 */

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { TOPICOS } from './conteudo';
import { CLASSE_HUE } from './hue';
import styles from './guide.module.css';

export function GuideIndex({ onIr }: { onIr: (id: string) => void }) {
  const emVista = useTopicoEmVista();

  const itens = TOPICOS.map((t) => ({
    id: t.id,
    rotulo: t.indice,
    hue: t.hue,
    ativo: emVista === t.id,
  }));

  return (
    <>
      {/* Mobile / tablet */}
      <nav aria-label="Assuntos do guia" className={styles.indexBar}>
        {itens.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onIr(i.id)}
            aria-current={i.ativo ? 'true' : undefined}
            className={cn(
              styles.indexChip,
              CLASSE_HUE[i.hue],
              i.ativo && styles.indexChipOn
            )}
          >
            <span className={styles.indexDot} aria-hidden />
            {i.rotulo}
          </button>
        ))}
      </nav>

      {/* Desktop */}
      <aside className={styles.side}>
        <p className="px-2 pb-2 text-micro font-semibold tracking-[0.14em] text-fg-muted uppercase">
          Neste guia
        </p>
        <nav aria-label="Assuntos do guia" className={styles.sideList}>
          {itens.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => onIr(i.id)}
              aria-current={i.ativo ? 'true' : undefined}
              className={cn(
                styles.sideItem,
                CLASSE_HUE[i.hue],
                i.ativo && styles.sideItemOn
              )}
            >
              <span className={styles.sideRail} aria-hidden />
              {i.rotulo}
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}

/** Qual topico esta ocupando a parte de cima da janela. */
function useTopicoEmVista() {
  const [id, setId] = useState<string>(TOPICOS[0].id);

  useEffect(() => {
    const alvos = TOPICOS.map((t) => document.getElementById(t.id)).filter(
      (el): el is HTMLElement => Boolean(el)
    );
    if (alvos.length === 0) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visivel?.target.id) setId(visivel.target.id);
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 }
    );

    alvos.forEach((el) => observador.observe(el));
    return () => observador.disconnect();
  }, []);

  return id;
}
