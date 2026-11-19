/**
 * FaixaDeKpis — os números do alto da tela num painel só (seção 1.8 do
 * redesenho de 18/11/2026).
 *
 * Quatro células (duas no celular) separadas por divisória fina, alinhadas à
 * esquerda: rótulo `text-label` mudo, valor `text-data` e detalhe opcional
 * `text-caption` mudo. Sem ícone, sem fundo colorido, sem centralizar: o
 * destaque de uma célula é a posição dela, não a cor. Carregando, o valor
 * vira `Esqueleto` e a altura da faixa não muda. O `rodape` opcional ocupa a
 * largura toda, abaixo das células, separado por divisória.
 */

import * as React from 'react';

import { Esqueleto } from '@/components/common/Esqueleto';
import { cn } from '@/lib/utils';

export interface ItemDaFaixa {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
}

export interface FaixaDeKpisProps {
  itens: ItemDaFaixa[];
  rodape?: React.ReactNode;
  carregando?: boolean;
  className?: string;
}

export function FaixaDeKpis({ itens, rodape, carregando = false, className }: FaixaDeKpisProps) {
  return (
    <div
      className={cn('min-w-0 overflow-hidden rounded-panel border border-line bg-surface-1', className)}
      aria-busy={carregando || undefined}
    >
      <dl className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        {itens.map((item) => (
          <div key={item.rotulo} className="flex min-w-0 flex-col bg-surface-1 px-4 py-3">
            <dt className="truncate text-label text-fg-muted">{item.rotulo}</dt>
            <dd className="min-w-0">
              {carregando ? (
                <Esqueleto className="my-1 h-6 w-24" />
              ) : (
                <span className="block truncate text-data font-semibold tabular-nums text-fg-strong">
                  {item.valor}
                </span>
              )}
            </dd>
            {item.detalhe !== undefined && (
              <dd className="truncate text-caption text-fg-muted">{item.detalhe}</dd>
            )}
          </div>
        ))}
      </dl>
      {rodape && (
        <div className="flex min-h-9 items-center border-t border-line px-4 py-2 text-caption text-fg-muted">
          {rodape}
        </div>
      )}
    </div>
  );
}

export default FaixaDeKpis;
