/**
 * Funil de eventos: até 5 barras que crescem até o valor, em defasagem, e um
 * ramo lateral opcional (âmbar, fino) que sai de uma etapa — o "abandono".
 *
 * Fala de EVENTOS, nunca de gente: o rótulo é o nome do evento ("Visitas",
 * "Checkout", "Compras") e a taxa é "{x%} dos eventos anteriores". Nada de
 * frases sobre quem continuou ou desistiu: o mesmo comprador pode gerar
 * vários eventos.
 *
 * - `valor` ausente ou `null`: barra só com o contorno tracejado e "—".
 * - `taxas`: a linha entre duas barras, com piso 0% e teto 100%.
 * - `ramo`: entra DEPOIS das barras principais, abaixo da etapa `depoisDe`
 *   (índice a partir de 0). `valor: null` mostra o contorno + "sem sinal".
 * - Rótulo de barra: até 22 caracteres; acima disso corta com reticências e o
 *   nome inteiro vai para o `title`.
 *
 * Decorativo para leitor de tela (`aria-hidden`): os números têm de estar
 * também no texto ao lado. Pode ser usado por componentes do servidor: só a
 * `Vigia` vira código do navegador.
 */

import React from 'react';

import { ArrowDownRight } from '@/components/ui/icones';
import { cn } from '@/lib/utils';

import type { Assunto, Ordem } from './assuntos';
import s from './cenas.module.css';
import { Vigia } from './Vigia';

export const MAXIMO_DE_ETAPAS = 5;
export const MAXIMO_DO_ROTULO = 22;

export type EtapaDoFunil = {
  rotulo: string;
  valor?: number | null;
  /** Vai para o `title` da etapa. */
  dica?: string;
};

export type RamoDoFunil = {
  /** Índice (a partir de 0) da etapa de onde o ramo sai. */
  depoisDe: number;
  rotulo: string;
  valor: number | null;
  /** Vai para o `title`; sem ela, o title é o rótulo. */
  dica?: string;
};

export type PropsDoFunil = {
  assunto: Assunto;
  etapas: ReadonlyArray<EtapaDoFunil>;
  taxas?: boolean;
  ramo?: RamoDoFunil;
};

const NUMERO = new Intl.NumberFormat('pt-BR');
const PORCENTO = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

function temValor(valor: number | null | undefined): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function cortar(rotulo: string): string {
  return rotulo.length > MAXIMO_DO_ROTULO ? `${rotulo.slice(0, MAXIMO_DO_ROTULO - 1)}…` : rotulo;
}

/** Fração da barra (0 a 1) em relação ao maior valor do funil. */
function fracao(valor: number, maior: number): number {
  if (maior <= 0) return 0;
  return Math.min(1, Math.max(0, valor / maior));
}

function taxaEntre(anterior: number | null | undefined, atual: number | null | undefined): string | null {
  if (!temValor(anterior) || !temValor(atual) || anterior <= 0) return null;
  const razao = Math.min(1, Math.max(0, atual / anterior));
  return PORCENTO.format(razao);
}

function Barra({ valor, maior, ordem }: { valor: number | null | undefined; maior: number; ordem: Ordem }) {
  const vazia = !temValor(valor);
  return (
    <span className={s.barraFundo} data-vazia={vazia || undefined}>
      {vazia ? null : (
        <span
          className={s.barraCrescer}
          data-ordem={ordem}
          style={{ width: `${(fracao(valor, maior) * 100).toFixed(1)}%` }}
        />
      )}
    </span>
  );
}

export function Funil({ assunto, etapas, taxas = false, ramo }: PropsDoFunil) {
  const visiveis = etapas.slice(0, MAXIMO_DE_ETAPAS);
  const maior = Math.max(0, ...visiveis.map((etapa) => (temValor(etapa.valor) ? etapa.valor : 0)));
  const semSinal = ramo ? !temValor(ramo.valor) : false;
  /* O ramo fica embaixo da etapa de onde sai; índice fora da lista = no fim. */
  const ramoNoMeio = ramo
    ? Number.isInteger(ramo.depoisDe) && ramo.depoisDe >= 0 && ramo.depoisDe < visiveis.length
    : false;

  const linhaDoRamo = ramo ? (
    <div className={cn(s.ramo, 'text-caption')} data-sem-sinal={semSinal || undefined} title={ramo.dica ?? ramo.rotulo}>
      <ArrowDownRight className={s.ramoSeta} aria-hidden />
      <span className={s.etapaRotulo}>{cortar(ramo.rotulo)}</span>
      <span className={s.ramoValor}>{temValor(ramo.valor) ? NUMERO.format(ramo.valor) : 'sem sinal'}</span>
      <Barra valor={ramo.valor} maior={maior} ordem={0} />
    </div>
  ) : null;

  return (
    <div className={cn(s.funil, s.assunto)} data-assunto={assunto} aria-hidden>
      {/* Escreve data-visivel (30% na tela) e data-oculto (aba escondida) no funil. */}
      <Vigia />
      {visiveis.map((etapa, i) => {
        const ordem = Math.min(i, 4) as Ordem;
        const taxa = taxas && i > 0 ? taxaEntre(visiveis[i - 1].valor, etapa.valor) : null;
        const cortado = cortar(etapa.rotulo);
        const titulo = etapa.dica ?? (cortado === etapa.rotulo ? undefined : etapa.rotulo);
        return (
          <React.Fragment key={`${etapa.rotulo}-${i}`}>
            {taxa ? <span className={cn(s.taxa, 'text-caption')}>{taxa} dos eventos anteriores</span> : null}
            <div className={cn(s.etapa, 'text-caption')} title={titulo}>
              <span className={s.etapaRotulo}>{cortado}</span>
              <span className={s.etapaValor}>{temValor(etapa.valor) ? NUMERO.format(etapa.valor) : '—'}</span>
              <Barra valor={etapa.valor} maior={maior} ordem={ordem} />
            </div>
            {ramoNoMeio && ramo?.depoisDe === i ? linhaDoRamo : null}
          </React.Fragment>
        );
      })}
      {ramoNoMeio ? null : linhaDoRamo}
    </div>
  );
}
