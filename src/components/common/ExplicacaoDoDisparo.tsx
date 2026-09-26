import type { CSSProperties, ElementType } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Plug, Send, Workflow } from '@/components/ui/icones';

import { cn } from '@/lib/utils';

/**
 * As duas telas de disparo, lado a lado, na própria tela em que o operador
 * está.
 *
 * Motivo de existir: "Disparo manual" e "Disparo automático" se parecem no
 * nome e as duas mandam evento para a Meta. Quem abre o console pela primeira
 * vez não tem como saber qual das duas é a sua. Em vez de repetir a distinção
 * na descrição de cada página — onde ela some, porque só se lê o lado em que
 * já se está —, as duas aparecem juntas, e a atual vem marcada.
 *
 * A tinta de cada área (coral no manual, violeta no automático) entra só no
 * chip do ícone e na barra da lateral, nunca em texto (DS-1.5′). Os valores
 * chegam por `--c`, declarado no artigo, para não repetir a variável em cada
 * propriedade.
 */

type Tela = 'manual' | 'automatico';

interface Descricao {
  titulo: string;
  href: string;
  icone: ElementType;
  tinta: string;
  /** O que a tela faz. Uma frase. */
  faz: string;
  /** Em que situação o operador abre esta tela. Uma frase. */
  quando: string;
}

const TELAS: Record<Tela, Descricao> = {
  manual: {
    titulo: 'Envio manual',
    // V7: o envio manual mora na aba Eventos de cada empresa; o endereço de
    // verdade sai de `hrefDoManual(slug)`. Sem empresa, a lista de empresas.
    href: '/empresas',
    icone: Send,
    tinta: 'var(--tinta-manual)',
    faz: 'Você monta o evento a partir de um pedido real e confere antes de enviar. Um por vez.',
    quando:
      'para recuperar uma venda que o Pixel do navegador perdeu, como PIX que só confirmou depois.',
  },
  automatico: {
    titulo: 'Envio automático',
    href: '/automatico',
    icone: Workflow,
    tinta: 'var(--tinta-automatico)',
    faz: 'Os eventos que chegam pelo webhook e pela tag passam pelas regras e vão para a Meta sozinhos, sem você digitar nada.',
    quando: 'para o dia a dia, depois que as regras estão conferidas.',
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

export function ExplicacaoDoDisparo({
  atual,
  slug,
  className,
}: {
  /** A tela em que o operador está agora: ela vem marcada, sem link. */
  atual: Tela;
  /** Apelido da empresa desta tela: leva o cartão "Envio manual" à aba Eventos dela. */
  slug?: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="explicacao-disparo-titulo"
      className={cn(
        'rounded-panel border border-line-strong bg-surface-1 p-4 shadow-realce sm:p-5',
        className
      )}
    >
      <h2
        id="explicacao-disparo-titulo"
        className="text-title font-semibold text-fg-strong"
      >
        Qual tela faz o quê
      </h2>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {ORDEM.map((tela) => (
          <CartaoDeTela
            key={tela}
            dados={
              tela === 'manual' ? { ...TELAS.manual, href: hrefDoManual(slug) } : TELAS[tela]
            }
            aqui={tela === atual}
          />
        ))}
      </div>

      <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-caption text-fg-muted">
        <Plug className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Quem faz o evento <strong className="font-semibold">chegar</strong> é a{' '}
          <Link
            href="/instalacao"
            className="text-tinta-texto underline-offset-2 hover:underline"
          >
            tela de Instalação
          </Link>
          . Manual e automático só decidem o que sai daqui para a Meta.
        </span>
      </p>
    </section>
  );
}

function CartaoDeTela({ dados, aqui }: { dados: Descricao; aqui: boolean }) {
  const { titulo, href, icone: Icone, faz, quando } = dados;

  const conteudo = (
    <>
      {aqui && (
        <span
          aria-hidden
          className="absolute inset-y-2.5 left-0 w-0.5 rounded-full"
          style={{ background: 'var(--c)' }}
        />
      )}

      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-control border"
          style={{
            color: 'var(--c)',
            background: 'color-mix(in srgb, var(--c) 14%, transparent)',
            borderColor: 'color-mix(in srgb, var(--c) 22%, transparent)',
          }}
        >
          <Icone className="size-4" />
        </span>

        <h3 className="min-w-0 flex-1 truncate text-label font-semibold text-fg-strong">
          {titulo}
        </h3>

        {aqui ? (
          <span className="shrink-0 rounded-control border border-line-control bg-surface-3 px-2 py-0.5 text-caption font-medium text-fg-muted">
            Você está aqui
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-caption font-medium text-tinta-texto">
            Abrir
            <ArrowUpRight className="size-3.5" aria-hidden />
          </span>
        )}
      </div>

      <p className="mt-2 text-caption text-fg-body">{faz}</p>
      <p className="mt-1 text-caption text-fg-muted">
        <span className="font-medium text-fg-body">Quando usar:</span> {quando}
      </p>
    </>
  );

  const base = cn(
    'relative min-w-0 overflow-hidden rounded-control border p-3',
    aqui
      ? 'border-line-control bg-surface-3'
      : 'border-line bg-surface-2 transition-colors hover:border-line-control hover:bg-surface-3'
  );

  const estilo = { '--c': dados.tinta } as CSSProperties;

  if (aqui) {
    return (
      <article className={base} style={estilo}>
        {conteudo}
      </article>
    );
  }

  return (
    <Link
      href={href}
      className={cn(base, 'block')}
      style={estilo}
      aria-label={`Abrir ${titulo}`}
    >
      {conteudo}
    </Link>
  );
}

export default ExplicacaoDoDisparo;
