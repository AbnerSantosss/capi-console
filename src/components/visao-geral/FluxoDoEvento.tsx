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
 * Sem prova, a etapa diz "sem sinal ainda". Nenhuma palavra aqui afirma uma
 * ligação que não foi medida.
 */

import { StatusDot } from '@/components/common/primitives';
import type { EnvioAutomatico, SinaisDaEmpresa } from '@/lib/checklist-empresa';
import { cn } from '@/lib/utils';
import { dataHoraDeBrasilia } from '@/lib/visao-geral-calculos';

type Tom = 'success' | 'warning' | 'neutral';

interface Etapa {
  nome: string;
  estado: string;
  tom: Tom;
}

const SEM_SINAL = 'sem sinal ainda';

function etapasDoFluxo(
  sinais: SinaisDaEmpresa,
  envio: EnvioAutomatico | null,
  aceitosNoPeriodo: number | null
): Etapa[] {
  const site: Etapa = sinais.ultimoHitDaTag
    ? { nome: 'Site', estado: `tag chamou em ${dataHoraDeBrasilia(sinais.ultimoHitDaTag)}`, tom: 'success' }
    : { nome: 'Site', estado: SEM_SINAL, tom: 'neutral' };

  const pixel: Etapa =
    sinais.pixelsComToken > 0
      ? {
          nome: 'Pixel',
          estado:
            sinais.pixelsComToken === 1
              ? 'token cadastrado'
              : `token cadastrado em ${sinais.pixelsComToken} Pixels`,
          tom: 'success',
        }
      : sinais.pixelsCadastrados > 0
        ? { nome: 'Pixel', estado: 'Pixel sem token', tom: 'warning' }
        : { nome: 'Pixel', estado: 'nenhum Pixel cadastrado', tom: 'warning' };

  const capi: Etapa =
    envio === null
      ? { nome: 'CAPI', estado: 'sem leitura da configuração', tom: 'warning' }
      : envio.ligado
        ? { nome: 'CAPI', estado: 'envio automático ligado', tom: 'success' }
        : { nome: 'CAPI', estado: 'envio automático desligado', tom: 'warning' };

  const meta: Etapa = sinais.ultimoAceito
    ? { nome: 'Meta', estado: `último aceito em ${dataHoraDeBrasilia(sinais.ultimoAceito)}`, tom: 'success' }
    : aceitosNoPeriodo !== null && aceitosNoPeriodo > 0
      ? { nome: 'Meta', estado: 'aceitou eventos no período', tom: 'success' }
      : { nome: 'Meta', estado: SEM_SINAL, tom: 'neutral' };

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
          <StatusDot tone={e.tom}>{e.estado}</StatusDot>
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
