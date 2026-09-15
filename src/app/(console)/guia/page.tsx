'use client';

/**
 * Guia — so composicao. O conteudo mora em components/guide/conteudo.ts e a
 * apresentacao nos componentes de components/guide/.
 *
 * Regra de abertura: abre o topico da ancora da URL (/guia#emq) ou, sem
 * ancora, o primeiro. Os outros comecam fechados — a pagina inteira aberta
 * eram ~2.400 palavras de uma vez.
 */

import { useCallback, useEffect, useState } from 'react';

import { TOPICOS } from '@/components/guide/conteudo';
import { GuideHero } from '@/components/guide/GuideHero';
import { GuideIndex } from '@/components/guide/GuideIndex';
import { TopicCard } from '@/components/guide/TopicCard';
import consoleStyles from '@/components/layout/console.module.css';

export default function Guia() {
  const [abertos, setAbertos] = useState<string[]>([]);

  // Ancora da URL manda: /guia#emq chega do console ja no assunto certo.
  useEffect(() => {
    const doHash = () => {
      const alvo = window.location.hash.replace('#', '');
      const valido = TOPICOS.some((t) => t.id === alvo);
      const id = valido ? alvo : TOPICOS[0].id;
      setAbertos((atuais) => (atuais.includes(id) ? atuais : [...atuais, id]));
      if (valido) {
        requestAnimationFrame(() => {
          document.getElementById(id)?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'auto'
              : 'smooth',
            block: 'start',
          });
        });
      }
    };
    doHash();
    window.addEventListener('hashchange', doHash);
    return () => window.removeEventListener('hashchange', doHash);
  }, []);

  const alternar = useCallback((id: string) => {
    setAbertos((atuais) =>
      atuais.includes(id) ? atuais.filter((i) => i !== id) : [...atuais, id]
    );
  }, []);

  const irPara = useCallback((id: string) => {
    setAbertos((atuais) => (atuais.includes(id) ? atuais : [...atuais, id]));
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      });
    });
  }, []);

  return (
    <main className={consoleStyles.page}>
      <GuideHero />

      <div className={consoleStyles.guideGrid}>
        <GuideIndex onIr={irPara} />

        <div className="flex min-w-0 flex-col gap-5">
          {TOPICOS.map((topico) => (
            <TopicCard
              key={topico.id}
              topico={topico}
              aberto={abertos.includes(topico.id)}
              onToggle={alternar}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

/* Aqui vivia o `usePodeAnimar`, que cruzava a preferencia "Fundo com
   movimento" com o prefers-reduced-motion para decidir se as capas dos topicos
   e o feixe dos caminhos podiam se mexer. Na FASE 3b nada mais se mexe nesta
   pagina: as capas viraram retangulo de tinta e o feixe saiu. Hook que decide
   sobre movimento inexistente e so mais um lugar para o proximo leitor achar
   que existe animacao aqui. */
