'use client';

import React, { useEffect, useState } from 'react';

import { Header } from '@/components/layout/Header';
import { SourceSection } from '@/components/event/SourceSection';
import { TransactionSection } from '@/components/event/TransactionSection';
import { CustomerSection } from '@/components/event/CustomerSection';
import { QualityPanel } from '@/components/quality/QualityPanel';
import { DispatchPanel, DispatchBar } from '@/components/dispatch/DispatchPanel';
import { ResultPanel } from '@/components/dispatch/ResultPanel';
import { ErrorSummary } from '@/components/common/ErrorSummary';
import { CommandPalette } from '@/components/common/CommandPalette';
import { BrandDialog } from '@/components/brand/BrandDialog';
import { useEventStore, agoraLocal } from '@/stores/useEventStore';
import { EntraESai, Entrada } from '@/components/common/motion';
import type { DispatchResult } from '@/components/dispatch/tipos';

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-6">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          {/* ---- Coluna de trabalho ---- */}
          <div className="flex max-w-[760px] flex-col gap-10">
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

          {/* ---- Painel de controle ---- */}
          <aside
            aria-label="Destino e qualidade do evento"
            className="flex flex-col gap-4 xl:sticky xl:top-20"
          >
            <Entrada atraso={0.06}>
              <QualityPanel />
            </Entrada>
            {/* Abaixo de xl a ação vive na barra fixa, não aqui. */}
            <div className="hidden flex-col gap-4 xl:flex">
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
      <CommandPalette onAbrirMarcas={() => setMarcasAbertas(true)} />
    </div>
  );
}
