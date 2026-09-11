'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Send } from 'lucide-react';

import { SourceSection } from '@/components/event/SourceSection';
import { TransactionSection } from '@/components/event/TransactionSection';
import { CustomerSection } from '@/components/event/CustomerSection';
import { QualityPanel } from '@/components/quality/QualityPanel';
import {
  DestinationSummary,
  DispatchPanel,
  DispatchBar,
} from '@/components/dispatch/DispatchPanel';
import { ResultPanel } from '@/components/dispatch/ResultPanel';
import { ErrorSummary } from '@/components/common/ErrorSummary';
import { Stepper } from '@/components/common/Stepper';
import { BrandDialog } from '@/components/brand/BrandDialog';
import { useEventStore, agoraLocal } from '@/stores/useEventStore';
import { EntraESai, Entrada } from '@/components/common/motion';
import type { DispatchResult } from '@/components/dispatch/tipos';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';
import { buttonVariants } from '@/components/ui/button';

export default function Home() {
  const [resultado, setResultado] = useState<DispatchResult | null>(null);
  const [marcasAbertas, setMarcasAbertas] = useState(false);

  const eventTime = useEventStore((s) => s.eventTime);
  const setField = useEventStore((s) => s.setField);

  // O rascunho persistido pode trazer uma data velha; sem data, comeca em agora.
  useEffect(() => {
    if (!eventTime) setField('eventTime', agoraLocal());
  }, [eventTime, setField]);

  const aoReceberResultado = (r: DispatchResult) => {
    setResultado(r);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  };

  return (
    <>
      <main className={consoleStyles.page}>
        <ConsolePageHeader
          eyebrow="Operação assistida"
          title="Disparo manual"
          description="Prepare os dados, confira o pixel e envie o evento à Meta."
          icon={Send}
          action={
            <Link
              href="/guia#como-usar"
              className={buttonVariants({ variant: 'outline' })}
            >
              <BookOpen className="size-4" strokeWidth={1.75} aria-hidden />
              Abrir guia
            </Link>
          }
        />

        <Stepper className="mb-8" />

        <div className={consoleStyles.mainGrid}>
          {/* ---- Coluna de trabalho ---- */}
          <div className={consoleStyles.workColumn}>
            <EntraESai mostrar={Boolean(resultado)}>
              {resultado && (
                <ResultPanel
                  resultado={resultado}
                  onClose={() => setResultado(null)}
                />
              )}
            </EntraESai>

            <ErrorSummary />
            <Entrada><SourceSection /></Entrada>
            <Entrada atraso={0.04}><TransactionSection /></Entrada>
            <Entrada atraso={0.08}><CustomerSection /></Entrada>
          </div>

          {/* ---- Etapa 4: conferir e disparar ---- */}
          <aside
            id="secao-disparo"
            aria-labelledby="secao-disparo-titulo"
            className={consoleStyles.reviewColumn}
          >
            {/* Cabecalho igual ao das secoes da esquerda: sem ele, a coluna
                parecia enfeite e o botao principal ficava solto no ar. */}
            <div className="flex items-center gap-3 rounded-xl border border-line-strong bg-surface-1/95 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.14)] sm:p-6">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 font-mono text-caption font-semibold text-fg-muted"
              >
                4
              </span>
              <div className="min-w-0">
                <h2
                  id="secao-disparo-titulo"
                  className="text-title font-semibold text-fg-strong"
                >
                  Conferir e disparar
                </h2>
                <p className="mt-0.5 text-caption text-fg-muted">
                  Para onde vai e o que a Meta vai receber.
                </p>
              </div>
            </div>

            <Entrada atraso={0.06}>
              <QualityPanel />
            </Entrada>
            <div className="min-[1200px]:hidden">
              <DestinationSummary onAbrirMarcas={() => setMarcasAbertas(true)} />
            </div>
            {/* Abaixo de xl a ação vive na barra fixa, não aqui. */}
            <div className="hidden flex-col gap-4 min-[1200px]:flex">
              <DispatchPanel
                onResult={aoReceberResultado}
                onAbrirMarcas={() => setMarcasAbertas(true)}
              />
            </div>
          </aside>
        </div>
      </main>

      <DispatchBar
        onResult={aoReceberResultado}
        onAbrirMarcas={() => setMarcasAbertas(true)}
      />

      <BrandDialog open={marcasAbertas} onOpenChange={setMarcasAbertas} />
    </>
  );
}
