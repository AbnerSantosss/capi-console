import type { CSSProperties, ElementType } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Send, Workflow } from '@/components/ui/icones';

import { cn } from '@/lib/utils';

/**
 * As duas formas de envio, numa linha cada, na própria tela em que o operador
 * está.
 *
 * Motivo de existir: "Envio manual" e "Envio automático" se parecem no nome e
 * as duas mandam evento para a Meta. Em vez de repetir a distinção na
 * descrição de cada página — onde ela some, porque só se lê o lado em que já
 * se está —, as duas aparecem juntas, e a atual vem marcada (sem link).
 *
 * E5 (HyperFrames): o cartão "Qual tela faz o quê" virou duas linhas com ícone
 * ESTÁTICO, sem cena. A tinta de cada área (coral no manual, violeta no
 * automático) entra só no chip do ícone e na barra da linha atual, nunca em
 * texto (DS-1.5′). O valor chega por `--c`, declarado na linha.
 */

type Tela = 'manual' | 'automatico';

interface Descricao {
  titulo: string;
  icone: ElementType;
  tinta: string;
  /** O que a forma faz, curto. */
  faz: string;
  /** Quando usar. Opcional: o automático se explica em duas palavras. */
  quando?: string;
  /** Texto do link quando o operador está na outra tela. */
  abrir: string;
}

const TELAS: Record<Tela, Descricao> = {
  manual: {
    titulo: 'Envio manual',
    icone: Send,
    tinta: 'var(--tinta-manual)',
    faz: 'Você monta e envia um por vez.',
    quando: 'Para recuperar venda que o Pixel perdeu (ex.: PIX).',
    abrir: 'Abrir o envio manual',
  },
  automatico: {
    titulo: 'Envio automático',
    icone: Workflow,
    tinta: 'var(--tinta-automatico)',
    faz: 'Sai sozinho.',
    abrir: 'Abrir Regras',
  },
};

const ORDEM: Tela[] = ['manual', 'automatico'];

/**
 * O "Envio manual" da empresa: a vista `manual` da aba Eventos. Sem apelido
 * (tela fora de `/e/<apelido>/…`), a lista de empresas — o operador escolhe
 * de qual empresa é o pedido antes de montar o evento.
 */
export function hrefDoManual(slug?: string): string {
  return slug ? `/e/${encodeURIComponent(slug)}/eventos?vista=manual` : '/empresas';
}

/**
 * O "Envio automático" da empresa: a aba Regras, onde se liga o que sai
 * sozinho. Sem apelido, a lista de empresas, pelo mesmo motivo do manual.
 */
export function hrefDoAutomatico(slug?: string): string {
  return slug ? `/e/${encodeURIComponent(slug)}/regras` : '/empresas';
}

export function ExplicacaoDoDisparo({
  atual,
  slug,
  className,
}: {
  /** A tela em que o operador está agora: ela vem marcada, sem link. */
  atual: Tela;
  /** Apelido da empresa desta tela: leva os links às abas dela. */
  slug?: string;
  className?: string;
}) {
  const destino: Record<Tela, string> = {
    manual: hrefDoManual(slug),
    automatico: hrefDoAutomatico(slug),
  };

  return (
    <section
      aria-label="Envio manual ou automático"
      className={cn('rounded-panel border border-line bg-surface-1 p-3 sm:p-4', className)}
    >
      <ul className="flex flex-col gap-2.5">
        {ORDEM.map((tela) => (
          <LinhaDaTela
            key={tela}
            dados={TELAS[tela]}
            href={destino[tela]}
            aqui={tela === atual}
          />
        ))}
      </ul>
    </section>
  );
}

function LinhaDaTela({
  dados,
  href,
  aqui,
}: {
  dados: Descricao;
  href: string;
  aqui: boolean;
}) {
  const { titulo, icone: Icone, faz, quando, abrir } = dados;
  const estilo = { '--c': dados.tinta } as CSSProperties;

  return (
    <li
      className="relative flex min-w-0 items-start gap-2.5 pl-2.5"
      style={estilo}
      aria-current={aqui ? 'page' : undefined}
    >
      {aqui && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 left-0 w-0.5 rounded-full"
          style={{ background: 'var(--c)' }}
        />
      )}
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-control border"
        style={{
          color: 'var(--c)',
          background: 'color-mix(in srgb, var(--c) 14%, transparent)',
          borderColor: 'color-mix(in srgb, var(--c) 22%, transparent)',
        }}
      >
        <Icone className="size-3.5" />
      </span>
      <p className="min-w-0 flex-1 text-caption text-fg-body">
        <span className="font-semibold text-fg-strong">{titulo}:</span> {faz}
        {quando && <> {quando}</>}
        {!aqui && (
          <>
            {' '}
            <Link
              href={href}
              className="inline-flex items-center gap-0.5 font-medium text-tinta-texto underline-offset-2 hover:underline"
            >
              {abrir}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </>
        )}
      </p>
    </li>
  );
}

export default ExplicacaoDoDisparo;
