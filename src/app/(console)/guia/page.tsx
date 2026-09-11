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
import { useUserStore } from '@/stores/useUserStore';
import consoleStyles from '@/components/layout/console.module.css';

export default function Guia() {
  const [abertos, setAbertos] = useState<string[]>([]);
  const animar = usePodeAnimar();

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
      <GuideHero animar={animar} />

      <div className={consoleStyles.guideGrid}>
        <GuideIndex onIr={irPara} />

        <div className="flex min-w-0 flex-col gap-5">
          {TOPICOS.map((topico) => (
            <TopicCard
              key={topico.id}
              topico={topico}
              aberto={abertos.includes(topico.id)}
              onToggle={alternar}
              animar={animar}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

/** Movimento so com a preferencia ligada e sem prefers-reduced-motion. */
function usePodeAnimar() {
  const fundoAnimado = useUserStore((s) => s.fundoAnimado);
  const [calmo, setCalmo] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const avaliar = () => setCalmo(mq.matches);
    avaliar();
    mq.addEventListener('change', avaliar);
    return () => mq.removeEventListener('change', avaliar);
  }, []);

  return fundoAnimado && !calmo;
}
