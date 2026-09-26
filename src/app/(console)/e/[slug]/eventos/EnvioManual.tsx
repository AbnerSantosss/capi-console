'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Send, Target } from '@/components/ui/icones';

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
import { Section } from '@/components/common/primitives';
import { ExplicacaoDoDisparo } from '@/components/common/ExplicacaoDoDisparo';
import { useEventStore, agoraLocal } from '@/stores/useEventStore';
import { EntraESai, Entrada } from '@/components/common/motion';
import type { DispatchResult } from '@/components/dispatch/tipos';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';
import { buttonVariants } from '@/components/ui/button';

/**
 * O envio manual, dentro de Eventos (`/e/<slug>/eventos?vista=manual`, V2 do v7).
 *
 * É a antiga tela `/` (Disparo manual) inteira, sem mudar nada do que o
 * operador faz nela: formulário, conferência, `DispatchPanel` e a barra fixa
 * de baixo. A V2 só a mudou de endereço — `/` agora é a Visão geral da
 * empresa — e trocou o caminho até os Pixels para o da empresa do endereço
 * (`/e/<slug>/pixels`), para o "cadastrar token" não sair da empresa aberta.
 *
 * A tela inteira, e não só o `DispatchPanel`: o painel sozinho dispara o que
 * estiver no formulário, e sem o formulário na mesma tela o operador não teria
 * como montar o evento. O seletor de vistas de Eventos é da V7.
 */
export function EnvioManual({ slug }: { slug: string }) {
  const router = useRouter();
  const [resultado, setResultado] = useState<DispatchResult | null>(null);

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

  // Os Pixels da empresa do endereço, e não a rota antiga `/pixels` (que
  // levaria para a empresa do cookie, num salto a mais).
  const abrirPixels = () => router.push(`/e/${slug}/pixels`);

  return (
    <>
      <main className={consoleStyles.page} data-area="manual">
        <ConsolePageHeader
          title="Envio manual"
          description="Prepare os dados, confira o pixel e envie o evento à Meta."
          icon={Send}
          action={
            <Link
              href="/guia#como-usar"
              className={buttonVariants({ variant: 'outline' })}
            >
              <BookOpen className="size-4" aria-hidden />
              Abrir guia
            </Link>
          }
        />

        <ExplicacaoDoDisparo atual="manual" className="mb-6" />

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
          <div className={consoleStyles.reviewColumn}>
            {/* O id fica aqui porque e o alvo do Stepper. */}
            <Section
              id="secao-disparo"
              step={4}
              icon={Target}
              variant="card"
              title="Conferir e enviar"
              description="Para onde vai e o que a Meta vai receber."
            >
              <Entrada atraso={0.06}>
                <QualityPanel />
              </Entrada>
              <div className="xl:hidden">
                <DestinationSummary />
              </div>
              {/* Abaixo de xl a ação vive na barra fixa, não aqui. */}
              <div className="hidden flex-col gap-4 xl:flex">
                <DispatchPanel
                  onResult={aoReceberResultado}
                  onAbrirMarcas={abrirPixels}
                />
              </div>
            </Section>
          </div>
        </div>
      </main>

      {/* Criar e editar Pixel acontecem na aba Pixels da empresa. O que sobra
          nesta tela é o caminho até lá, para quando o disparo para por falta
          de token. */}
      <DispatchBar onResult={aoReceberResultado} onAbrirMarcas={abrirPixels} />
    </>
  );
}
