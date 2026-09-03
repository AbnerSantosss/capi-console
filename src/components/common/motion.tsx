'use client';

/**
 * Movimento do console.
 *
 * Regra que vale para tudo aqui: a animação existe para explicar uma relação de
 * causa e efeito — algo entrou, algo mudou, algo saiu. Nada se move só para
 * enfeitar. O console mostra dinheiro real; movimento gratuito compete com os
 * números e atrapalha a leitura.
 *
 * Durações vêm do design system (plano-redesign-ux-v2.md, seção 3.8):
 *   entrada 220ms · saída 140ms (~65% da entrada) · hover 150ms
 *
 * `useReducedMotion` da lib desliga tudo para quem pediu menos movimento no
 * sistema operacional, sem depender só do @media do CSS.
 */

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import { cn } from '@/lib/utils';

const SUAVE = [0.2, 0.8, 0.2, 1] as const;

/** Entrada de um bloco que acabou de aparecer na tela. */
export function Entrada({
  children,
  atraso = 0,
  className,
}: {
  children: React.ReactNode;
  atraso?: number;
  className?: string;
}) {
  const semMovimento = useReducedMotion();

  return (
    <motion.div
      initial={semMovimento ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: atraso, ease: SUAVE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Bloco que entra e sai — o painel de resultado, por exemplo. */
export function EntraESai({
  mostrar,
  children,
  className,
}: {
  mostrar: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const semMovimento = useReducedMotion();

  return (
    <AnimatePresence initial={false} mode="wait">
      {mostrar && (
        <motion.div
          key="bloco"
          initial={semMovimento ? false : { opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={semMovimento ? { opacity: 0 } : { opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.22, ease: SUAVE }}
          className={cn('overflow-hidden', className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Número que transiciona dígito a dígito. Usado na nota do EMQ: o valor muda a
 * cada tecla digitada, e ver o número correr comunica "isto respondeu ao que
 * você acabou de preencher" melhor do que um corte seco.
 */
export function NumeroAnimado({
  valor,
  casas = 1,
  className,
}: {
  valor: number;
  casas?: number;
  className?: string;
}) {
  const semMovimento = useReducedMotion();

  if (semMovimento) {
    return <span className={className}>{valor.toFixed(casas)}</span>;
  }

  return (
    <NumberFlow
      value={valor}
      format={{ minimumFractionDigits: casas, maximumFractionDigits: casas }}
      locales="pt-BR"
      className={className}
      transformTiming={{ duration: 500, easing: 'cubic-bezier(0.2,0.8,0.2,1)' }}
      spinTiming={{ duration: 500, easing: 'cubic-bezier(0.2,0.8,0.2,1)' }}
    />
  );
}

/** Barra de progresso que cresce a partir do valor anterior. */
export function BarraAnimada({
  percentual,
  className,
  corBarra,
}: {
  percentual: number;
  className?: string;
  corBarra: string;
}) {
  const semMovimento = useReducedMotion();

  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-0', className)}>
      <motion.div
        className={cn('h-full rounded-full', corBarra)}
        initial={false}
        animate={{ width: `${Math.max(2, percentual)}%` }}
        transition={
          semMovimento ? { duration: 0 } : { duration: 0.45, ease: SUAVE }
        }
      />
    </div>
  );
}

/** Lista cujos itens entram escalonados. Usado na caixa de entrada. */
export function ItemDeLista({
  children,
  indice = 0,
  className,
}: {
  children: React.ReactNode;
  indice?: number;
  className?: string;
}) {
  const semMovimento = useReducedMotion();

  return (
    <motion.li
      layout={!semMovimento}
      initial={semMovimento ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={semMovimento ? { opacity: 0 } : { opacity: 0, x: 12 }}
      // 35ms por item: perceptível como sequência, sem virar espera
      transition={{ duration: 0.2, delay: Math.min(indice * 0.035, 0.2), ease: SUAVE }}
      className={className}
    >
      {children}
    </motion.li>
  );
}

export { AnimatePresence, motion };
