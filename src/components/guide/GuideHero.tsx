'use client';

/**
 * Topo do Guia: a pergunta que o operador faz primeiro e "qual caminho eu
 * uso?". Ela e respondida aqui, antes de qualquer passo.
 *
 * O estado do automatico vem do mesmo hook que alimenta o menu, para o Guia
 * nunca contradizer a aba Regras.
 */

import { BookOpenIcon } from '@phosphor-icons/react';

import { DotPattern } from '@/components/ui/dot-pattern';
import { useEstadoAutomatico } from '@/hooks/useEstadoAutomatico';
import { CAMINHOS } from './conteudo';
import { PathCard } from './PathCard';
import styles from './guide.module.css';

const ESTADO_AUTO: Record<string, string> = {
  carregando: 'Consultando as regras…',
  desligado: 'Desligado. Nenhuma regra está em modo automático.',
  teste: 'Ligado em modo teste: aparece no Testar eventos e não entra nas métricas.',
  producao: 'Ligado em produção: as conversões entram nas métricas reais.',
};

export function GuideHero({ animar }: { animar: boolean }) {
  const automatico = useEstadoAutomatico();
  const autoAtivo = automatico.carregado && automatico.regrasAuto > 0;

  const cards = CAMINHOS.map((caminho) => (
    <PathCard
      key={caminho.id}
      caminho={caminho}
      animar={animar}
      ativo={caminho.id === 'auto' ? autoAtivo : !autoAtivo}
      estado={
        caminho.id === 'auto'
          ? ESTADO_AUTO[automatico.situacao]
          : 'Sempre disponível. Não depende de configuração nenhuma.'
      }
    />
  ));

  return (
    <section className={styles.hero} aria-labelledby="guia-titulo">
      <DotPattern
        width={24}
        height={24}
        cr={1.1}
        className={styles.heroPattern}
      />
      <div className={styles.heroInner}>
        <p className="flex items-center gap-2 text-micro font-bold tracking-[0.14em] text-accent-text uppercase">
          <BookOpenIcon size={15} weight="duotone" aria-hidden />
          Referência operacional
        </p>
        <h1 id="guia-titulo" className={styles.heroTitle}>
          Guia
        </h1>
        <p className={styles.heroLead}>
          Dois caminhos levam um evento até a Meta. Escolha o seu, siga os
          passos e confira as regras da API antes de disparar.
        </p>

        {/* Sem animacao de entrada de proposito. O BlurFade deixava os dois
            cards em opacity:0 ate o motion assumir, e num console de operacao
            conteudo invisivel por segundos e defeito, nao efeito. */}
        <div className={styles.paths}>{cards}</div>
      </div>
    </section>
  );
}
