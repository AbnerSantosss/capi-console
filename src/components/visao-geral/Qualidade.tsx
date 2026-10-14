'use client';

/**
 * "Qualidade do rastreamento" (V5 do plano v7; spec :26, :51, :66): quanto do
 * que foi enviado de verdade a Meta aceitou.
 *
 *  - Aceitação = aceitos ÷ RESPONDIDOS (aceitos + recusados), R3 da revisão
 *    da V4. Sem resposta real no período, "—" e a frase que diz por quê.
 *  - Só envio real. O que foi só para o "Testar eventos" aparece à parte.
 *  - Envio automático em palavra, das duas travas reais (a chave do Pixel e a
 *    regra automática para ele), calculado no servidor
 *    (`envioAutomaticoDaEmpresa`). Sem as duas, "desligado" e o que falta.
 *  - Deduplicação: `dedup.ts` só deduplica entre envios REAIS já aceitos
 *    (modo teste fica de fora), por `event_id` ou `order_id` no mesmo Pixel e
 *    evento; sem os dois ids, a impressão e-mail + valor + dia vale só até o
 *    console reiniciar. Na tela (HyperFrames E1) fica só a dica "?" com a
 *    frase curta; a condição inteira mora neste comentário.
 *  - O número da aceitação é `text-heading`: o que mais importa na aba são
 *    Compras e Faturado.
 */

import { IconeDoAssunto } from '@/components/cenas';
import consoleStyles from '@/components/layout/console.module.css';
import { HelpTip, StatusDot } from '@/components/common/primitives';
import { ShieldCheck } from '@/components/ui/icones';
import type { EnvioAutomatico } from '@/lib/checklist-empresa';
import { cn } from '@/lib/utils';
import {
  SEM_DADO,
  formatarPercentual,
  formatarPtBr,
  type NumerosDaVisaoGeral,
} from '@/lib/visao-geral-calculos';

function contagem(n: number | null, um: string, varios: string): string {
  if (n === null) return `${SEM_DADO} ${varios}`;
  return `${formatarPtBr(n)} ${n === 1 ? um : varios}`;
}

export function Qualidade({
  numeros: n,
  envio,
  className,
}: {
  numeros: NumerosDaVisaoGeral;
  /** `null` quando a configuração da empresa não pôde ser lida. */
  envio: EnvioAutomatico | null;
  className?: string;
}) {
  const p = n.aceitacao;
  const semResposta = p === null;

  return (
    <section
      aria-labelledby="qualidade-titulo"
      className={cn(consoleStyles.painel, 'flex min-w-0 flex-col gap-4 p-4 sm:p-5', className)}
    >
      <div className="min-w-0">
        <h2 id="qualidade-titulo" className="flex items-center gap-2 text-title font-semibold text-fg-strong">
          <IconeDoAssunto assunto="pixel" icone={ShieldCheck} />
          Qualidade do rastreamento
        </h2>
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-heading font-bold tabular-nums tracking-tight text-fg-strong">
            {formatarPercentual(p)}
          </span>
          <span className="text-label text-fg-body tabular-nums">
            {semResposta
              ? 'sem envios ainda'
              : `${formatarPtBr(n.aceitos)} aceitos de ${formatarPtBr(n.respondidos)} respondidos`}
          </span>
        </p>

        <div
          role="progressbar"
          aria-label="Aceitação pela Meta"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={semResposta ? undefined : p}
          aria-valuetext={semResposta ? 'sem envio real respondido' : formatarPercentual(p)}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
        >
          {!semResposta ? (
            <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(Math.max(p, 0), 100)}%` }} />
          ) : null}
        </div>
      </div>

      <ul role="list" className="flex flex-col gap-1.5 text-label text-fg-body">
        <li className={cn('tabular-nums', n.recusados !== null && n.recusados > 0 && 'text-danger')}>
          {contagem(n.recusados, 'recusado pela Meta', 'recusados pela Meta')}
        </li>
        <li className="tabular-nums text-fg-muted">
          {formatarPtBr(n.emTeste)} de teste (não contam)
        </li>
        <li>
          {envio === null ? (
            <StatusDot tone="warning">Envio automático: sem leitura</StatusDot>
          ) : (
            // Legenda curta (E1); a frase inteira, com o que falta, vai no `title`.
            <span title={envio.frase}>
              <StatusDot tone={envio.ligado ? 'success' : 'warning'}>
                {envio.ligado
                  ? 'Envio automático: ligado'
                  : envio.chaveLigada
                    ? 'Envio automático: sem regra'
                    : 'Envio automático: desligado'}
              </StatusDot>
              <span className="sr-only">. {envio.frase}</span>
            </span>
          )}
        </li>
        <li className="flex items-center gap-1 text-caption text-fg-muted">
          Deduplicação
          <HelpTip label="Como a deduplicação funciona" content="Mesma venda enviada duas vezes conta uma só." />
        </li>
      </ul>
    </section>
  );
}
