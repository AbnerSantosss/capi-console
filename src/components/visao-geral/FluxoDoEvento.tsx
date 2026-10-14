'use client';

/**
 * A faixa discreta do cabeçalho da Visão geral (spec :22): Site → Pixel →
 * CAPI → Meta, em TEXTO, com o estado que cada etapa consegue provar.
 *
 *  - Site: a última chamada da tag (`ultimoHit` do domínio ou entrada de
 *    origem `tag`).
 *  - Pixel: "token cadastrado" quando há token. Nunca "válido": o console não
 *    testa o token sem enviar nada à Meta.
 *  - CAPI: as duas travas do envio automático (a chave do Pixel e a regra).
 *  - Meta: o último evento real aceito.
 *
 * Sem prova, a etapa diz "sem sinal". Nenhuma palavra aqui afirma uma
 * ligação que não foi medida.
 *
 * HyperFrames E1: a legenda de cada nó tem até 4 palavras ("ligado", "sem
 * token", "sem regra automática", "desligado", "sem sinal"); a frase longa e a
 * data vão para o `title` e para o leitor de tela. Sem animação: a única cena
 * da aba é o funil.
 */

import { StatusDot } from '@/components/common/primitives';
import type { EnvioAutomatico, SinaisDaEmpresa } from '@/lib/checklist-empresa';
import { cn } from '@/lib/utils';
import { dataHoraDeBrasilia } from '@/lib/visao-geral-calculos';

type Tom = 'success' | 'warning' | 'neutral';

interface Etapa {
  nome: string;
  /** A legenda curta, na tela. */
  estado: string;
  /** A frase longa (com a data, quando há), no `title`. */
  detalhe: string;
  tom: Tom;
}

const SEM_SINAL = 'sem sinal';
const SEM_SINAL_LONGO = 'Nada medido ainda nesta etapa';

function etapasDoFluxo(
  sinais: SinaisDaEmpresa,
  envio: EnvioAutomatico | null,
  aceitosNoPeriodo: number | null
): Etapa[] {
  const site: Etapa = sinais.ultimoHitDaTag
    ? {
        nome: 'Site',
        estado: 'ligado',
        detalhe: `A tag chamou em ${dataHoraDeBrasilia(sinais.ultimoHitDaTag)}`,
        tom: 'success',
      }
    : { nome: 'Site', estado: SEM_SINAL, detalhe: 'A tag ainda não chamou o console', tom: 'neutral' };

  // Com token é "com token", nunca "válido": o console não testa o token sem
  // enviar nada à Meta.
  const pixel: Etapa =
    sinais.pixelsComToken > 0
      ? {
          nome: 'Pixel',
          estado: 'com token',
          detalhe:
            sinais.pixelsComToken === 1
              ? 'Token cadastrado'
              : `Token cadastrado em ${sinais.pixelsComToken} Pixels`,
          tom: 'success',
        }
      : sinais.pixelsCadastrados > 0
        ? { nome: 'Pixel', estado: 'sem token', detalhe: 'Pixel cadastrado sem token', tom: 'warning' }
        : { nome: 'Pixel', estado: 'sem Pixel', detalhe: 'Nenhum Pixel cadastrado', tom: 'warning' };

  const capi: Etapa =
    envio === null
      ? { nome: 'CAPI', estado: 'sem leitura', detalhe: 'Sem leitura da configuração desta empresa', tom: 'warning' }
      : envio.ligado
        ? { nome: 'CAPI', estado: 'ligado', detalhe: 'Envio automático ligado', tom: 'success' }
        : envio.chaveLigada
          ? // A aba Pixels mostra a chave como "Ligado"; dizer "desligado" aqui
            // seria o oposto na tela vizinha. O que falta é a regra.
            {
              nome: 'CAPI',
              estado: 'sem regra automática',
              detalhe: 'Chave ligada, sem regra automática',
              tom: 'warning',
            }
          : { nome: 'CAPI', estado: 'desligado', detalhe: 'Envio automático desligado', tom: 'warning' };

  const meta: Etapa = sinais.ultimoAceito
    ? {
        nome: 'Meta',
        estado: 'aceitou',
        detalhe: `Último aceito em ${dataHoraDeBrasilia(sinais.ultimoAceito)}`,
        tom: 'success',
      }
    : aceitosNoPeriodo !== null && aceitosNoPeriodo > 0
      ? { nome: 'Meta', estado: 'aceitou', detalhe: 'Aceitou eventos no período', tom: 'success' }
      : { nome: 'Meta', estado: SEM_SINAL, detalhe: SEM_SINAL_LONGO, tom: 'neutral' };

  return [site, pixel, capi, meta];
}

export function FluxoDoEvento({
  sinais,
  envio,
  aceitosNoPeriodo,
  className,
}: {
  sinais: SinaisDaEmpresa;
  envio: EnvioAutomatico | null;
  /** `qualidade.aceitos` do período, quando o resumo já veio. */
  aceitosNoPeriodo: number | null;
  className?: string;
}) {
  const etapas = etapasDoFluxo(sinais, envio, aceitosNoPeriodo);
  return (
    <ol
      aria-label="Caminho do evento: site, Pixel, CAPI e Meta"
      className={cn('flex flex-wrap items-center gap-x-2 gap-y-1.5 text-caption', className)}
    >
      {etapas.map((e, i) => (
        <li key={e.nome} className="flex items-center gap-2">
          <span className="font-semibold text-fg-body">{e.nome}</span>
          <span title={e.detalhe}>
            <StatusDot tone={e.tom}>{e.estado}</StatusDot>
            <span className="sr-only">: {e.detalhe}</span>
          </span>
          {i < etapas.length - 1 ? (
            <span aria-hidden className="text-fg-muted">
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
