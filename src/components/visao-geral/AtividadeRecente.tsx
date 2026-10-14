'use client';

/**
 * "Últimas conversões" (V5 do plano v7; spec :26, :64; HyperFrames E1): as 5
 * últimas vendas do período, sem visita de página e sem teste interno ou da
 * plataforma (`ultimasConversoes`; a regra vai no `title` do subtítulo).
 * Colunas Hora · Evento · Valor · Status. O `event_id` saiu da tela (E1) e
 * continua na planilha.
 *
 *  - Status em TEXTO e cor: Aceito, Recusado, Na fila...
 *  - Clicar na linha (ou Enter no nome do evento) abre a aba Eventos filtrada
 *    pelo NOME do evento, no mesmo período: é a tela "quem mandou este evento".
 *    O filtro da aba casa pelo nome que a origem usou (`eventoOrigem`), e não
 *    pelo `event_id`, que abriria uma lista vazia (R4 da revisão da V4).
 *  - Nada de dado pessoal do comprador: a linha só tem o que
 *    `ultimasConversoes` devolve.
 *  - O botão de baixar a planilha mora no cabeçalho da Visão geral, não aqui.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import consoleStyles from '@/components/layout/console.module.css';
import { Esqueleto, RegiaoDeEspera } from '@/components/common/Esqueleto';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import { StatusDot } from '@/components/common/primitives';
import { IconeDoAssunto } from '@/components/cenas';
import { parMeta } from '@/components/integrations/eventos-legiveis';
import { Button, buttonVariants } from '@/components/ui/button';
import { ShoppingBag } from '@/components/ui/icones';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { cn } from '@/lib/utils';
import {
  ROTULO_DO_STATUS,
  SEM_DADO,
  diaDeBrasilia,
  diaMes,
  formatarMoeda,
  horaDeBrasilia,
  type LinhaDeConversao,
  type StatusDaConversao,
} from '@/lib/visao-geral-calculos';

const TOM_DO_STATUS: Record<StatusDaConversao, 'success' | 'danger' | 'warning' | 'neutral' | 'accent'> = {
  aceito: 'success',
  recusado: 'danger',
  fila: 'warning',
  enviado: 'accent',
  teste: 'neutral',
  ignorado: 'neutral',
};

function quando(iso: string): string {
  const dia = diaDeBrasilia(iso);
  return dia ? `${diaMes(dia)} ${horaDeBrasilia(iso)}` : SEM_DADO;
}

export function AtividadeRecente({
  slug,
  busca,
  linhas,
  carregando,
  erro,
  aoTentarDeNovo,
  className,
}: {
  slug: string;
  /** O período atual como busca de URL (`buscaDoPeriodo`): `dias=7`, `de=…&ate=…`. */
  busca: string;
  /** `null` enquanto não veio. */
  linhas: readonly LinhaDeConversao[] | null;
  carregando: boolean;
  erro: boolean;
  aoTentarDeNovo: () => void;
  className?: string;
}) {
  const router = useRouter();
  const idTitulo = `atividade-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const abaEventos = `/e/${encodeURIComponent(slug)}/eventos`;
  const linkDoEvento = (l: LinhaDeConversao) =>
    `${abaEventos}?evento=${encodeURIComponent(l.nomeDoEvento)}&${busca}`;

  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(consoleStyles.painel, 'flex min-w-0 flex-col gap-4 p-4 sm:p-5', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={idTitulo} className="flex items-center gap-2 text-title font-semibold text-fg-strong">
            <IconeDoAssunto assunto="evento" icone={ShoppingBag} />
            Últimas conversões
          </h2>
          <p className="mt-0.5 text-caption text-fg-muted" title="Sem visitas e sem testes internos">
            as 5 últimas vendas
          </p>
        </div>
        <Link href={`${abaEventos}?${busca}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          Ver todas →
        </Link>
      </div>

      {carregando ? (
        <RegiaoDeEspera rotulo="Carregando as últimas conversões" className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Esqueleto key={i} className="h-9" />
          ))}
        </RegiaoDeEspera>
      ) : erro ? (
        <EstadoVazio
          cenario="erro"
          titulo="As últimas conversões não vieram"
          motivo="Sem resposta do servidor. Os números acima continuam valendo."
          acao={
            <Button variant="outline" size="sm" onClick={aoTentarDeNovo}>
              Tentar de novo
            </Button>
          }
        />
      ) : !linhas || linhas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma conversão no período"
          motivo="Nenhuma venda chegou. Confira o webhook em Instalação."
          acao={
            <Link
              href={enderecoDaAba(encodeURIComponent(slug), 'fontes')}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Abrir Instalação
            </Link>
          }
        />
      ) : (
        <div className={cn(consoleStyles.rolagemDoPainel, '-mx-1 px-1')}>
          <table className="w-full min-w-[26rem] border-collapse text-left text-label">
            <thead>
              <tr className="border-b border-line text-caption text-fg-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Hora
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Evento
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Valor
                </th>
                <th scope="col" className="py-2 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const par = parMeta(l.evento);
                const destino = linkDoEvento(l);
                return (
                  <tr
                    key={l.id}
                    onClick={() => {
                      // Quem está selecionando texto não quer sair da tela.
                      if (typeof window !== 'undefined' && window.getSelection()?.toString()) return;
                      router.push(destino);
                    }}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-fg-body">{quando(l.recebidoEm)}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={destino}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-fg-strong underline-offset-2 hover:underline"
                        title={`Ver quem mandou ${l.nomeDoEvento} neste período`}
                      >
                        {par?.pt ?? l.evento}
                      </Link>
                      <span className="block font-mono text-caption text-fg-muted">
                        {l.nomeDoEvento !== l.evento ? `${l.nomeDoEvento} → ${l.evento}` : l.evento}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums text-fg-body">
                      {formatarMoeda(l.valor, l.moeda)}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <StatusDot tone={TOM_DO_STATUS[l.status]}>{ROTULO_DO_STATUS[l.status]}</StatusDot>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
