/**
 * Um passo do roteiro: número + "Passo N" + cena + título + porquê + itens
 * N.1, N.2… + o link para fazer. É um `<li>`: use dentro de `<ol>`.
 *
 * A cena (`cena`, um `<Palco>`) é decorativa; o texto do cartão diz tudo o que
 * ela mostra. `acao.rotulo` é verbo + destino ("Fazer o passo 1").
 */

import React from 'react';

import { ArrowRight } from '@/components/ui/icones';
import { cn } from '@/lib/utils';

import type { Assunto } from './assuntos';
import s from './cenas.module.css';
import { SeloDePasso } from './SeloDePasso';

export type PropsDoCartao = {
  numero: number;
  assunto: Assunto;
  titulo: string;
  porque: string;
  /** Até 3 itens. */
  itens?: readonly string[];
  acao: { href: string; rotulo: string };
  cena?: React.ReactNode;
};

export function CartaoDePasso({ numero, assunto, titulo, porque, itens, acao, cena }: PropsDoCartao) {
  return (
    <li className={cn(s.cartao, s.assunto)} data-assunto={assunto}>
      <div className="flex items-center gap-3">
        <SeloDePasso numero={numero} />
        <span className={cn(s.rotuloDoPasso, 'text-caption')}>Passo {numero}</span>
      </div>
      {cena}
      <h2 className="text-title font-semibold text-fg-strong">{titulo}</h2>
      <p className="text-body text-fg-body">{porque}</p>
      {itens && itens.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {itens.map((item, i) => (
            <li key={item} className="flex items-start gap-2.5 text-label text-fg-strong">
              <span className={cn(s.miniNumero, 'text-caption leading-6')} aria-hidden>
                {numero}.{i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <a href={acao.href} className={cn(s.irAoPasso, 'text-label')}>
        {acao.rotulo}
        <ArrowRight className="size-4" aria-hidden />
      </a>
    </li>
  );
}
