'use client';

/**
 * Pecas comuns do console.
 *
 * Politica de ajuda (plano-redesign-ux-v2.md secao 6.4):
 *   1. helper text persistente  -> explicacao normal de campo
 *   2. <HelpTip>                -> so parametro tecnico que o helper nao cobre.
 *                                  Maximo 1 por linha, 3 por painel, 0 em botao.
 *   3. /guia                    -> tudo que precisa de mais de uma frase
 *
 * Superficies (V-01 / DS-2.6): TRES receitas e nenhuma outra — Cartao, Bloco e
 * Destaque, exportadas abaixo tanto como componente quanto como string de
 * classes (`receitaCartao` e companhia), para quem precisa vesti-las num
 * elemento proprio. O que nao pode voltar: cartao dentro de cartao, opacidade
 * em cor de superficie (`bg-surface-1/95`), sombra projetada em cartao parado
 * alem da `--sombra-cartao`, e mais de um raio por familia.
 *
 * FASE 3a do redesign v4 — SUPERFICIE SE SEPARA POR LUZ, NAO POR LINHA.
 * As tres receitas perderam a borda em volta. Quem separa agora e o degrau de
 * luminancia que a FASE 1 mediu e escreveu no `globals.css` (0.061 entre
 * surface-0 e surface-1, 0.053 entre surface-1 e surface-2), mais a aresta
 * iluminada de 1px (`--realce-interno`). Isso e o que o gate G3′ permite, e a
 * razao de ele existir: a regra antiga obrigava linha em volta de TODA
 * superficie que contem outra, e "linha em volta de tudo" e literalmente o
 * traco minimalista de que o dono reclamou — 18 Sections, 15 Panels e 40
 * Callouts desenhando uma caixa cada um.
 *
 * A borda passou a ser vocabulario de CONTROLE e de mais nada: input, select,
 * botao secundario, checkbox, cartao clicavel. A unica linha que sobrou numa
 * superficie e a de 2px de tinta no topo do `Destaque`, que e identidade de
 * area e nao contorno.
 *
 * 🔴 Consequencia que o G3′ cobra: uma superficie so separa da que a CONTEM se
 * houver 0.04 de degrau de L entre as duas. `bg-surface-1` dentro de outro
 * `bg-surface-1` nao separa por nada e vira uma mancha — dentro de um cartao,
 * o aninhado sobe para `surface-2`.
 */

import * as React from 'react';
import { Info, TriangleAlert } from '@/components/ui/icones';
import Link from 'next/link';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import s from './superficies.module.css';

/* ------------------------------------------------------------------ */
/* As tres receitas de conteiner                                       */
/* ------------------------------------------------------------------ */

/**
 * Cartao — o objeto que o operador manipula. Raio 10, SEM borda: `s.cartao`
 * poe `--surface-1` (0.061 de L acima do fundo), a rampa curta do topo e a
 * aresta de luz de `--realce-interno`. O cartao sobe do fundo; nao e recortado
 * nele.
 */
export const receitaCartao = cn('min-w-0 rounded-panel p-4 sm:p-5', s.cartao);

/**
 * Bloco — grupo aninhado DENTRO de um cartao. Raio 8, superficie chapada e
 * tambem sem borda: `surface-2` esta 0.053 de L acima do cartao, que e o que
 * o G3′ pede. Fora de um cartao ele fica 0.114 acima do fundo — separa nos
 * dois lugares, e por isso e o degrau certo para o que pode ou nao estar
 * dentro de um cartao (filtro de lista, estado vazio, bloco de codigo).
 */
export const receitaBloco = 'min-w-0 rounded-lg bg-surface-2 p-3';

/** Destaque — no maximo um por tela: cartao + linha de tinta + halo da area. */
export const receitaDestaque = cn(receitaCartao, s.destaque, 'p-5 sm:p-6');

export function Cartao({
  children,
  className = '',
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div className={cn(receitaCartao, className)} {...props}>
      {children}
    </div>
  );
}

export function Bloco({
  children,
  className = '',
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div className={cn(receitaBloco, className)} {...props}>
      {children}
    </div>
  );
}

export function Destaque({
  children,
  className = '',
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div className={cn(receitaDestaque, className)} {...props}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* (aqui morava o ChipDeIcone)                                         */
/* ------------------------------------------------------------------ */

/**
 * `ChipDeIcone` e a classe `.chip` foram REMOVIDOS na FASE 3a do redesign v4.
 * "Icone dentro de quadrado arredondado" e uma das assinaturas de template que
 * a pesquisa lista, e o v3 ja tinha apagado a fileira de cinco iguais sem
 * apagar o quadradinho em si. Agora o icone do assunto e glifo solto na tinta
 * da area — no titulo da Section, no `pageTitleMark` do cabecalho de pagina e
 * na estacao do `IntegrationFlow`. Sem caixa, sem borda, sem fundo.
 */

/* ------------------------------------------------------------------ */
/* ParamChip — o nome do parametro da API, fora do rotulo             */
/* ------------------------------------------------------------------ */

export function ParamChip({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <code
      className={cn(
        'rounded border border-line-control bg-surface-2 px-1.5 py-0.5 font-mono text-caption text-fg-body',
        className
      )}
    >
      {children}
    </code>
  );
}

/* ------------------------------------------------------------------ */
/* HelpTip — tooltip com uso restrito                                  */
/* ------------------------------------------------------------------ */

export function HelpTip({
  content,
  side = 'top',
  label = 'Mais informações',
}: {
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className="relative inline-flex size-5 cursor-help items-center justify-center rounded text-fg-muted transition-colors hover:text-tinta-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto after:absolute after:top-1/2 after:left-1/2 after:size-[36px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
      >
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-72">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/* Field — rotulo + chip + controle + helper + erro                   */
/* ------------------------------------------------------------------ */

export interface FieldProps {
  id: string;
  /** No maximo 3 palavras. Sem traducao entre parenteses. */
  label: string;
  /** Nome do parametro da Meta, renderizado como chip mono ao lado. */
  param?: string;
  /** Persistente, 12px. Uma frase, ate ~90 caracteres. */
  helper?: React.ReactNode;
  /** Mensagem de erro. Coexiste com o helper, nao o substitui. */
  error?: string;
  /** Use com parcimonia — ver politica no topo do arquivo. */
  tip?: React.ReactNode;
  required?: boolean;
  /** Conteudo extra a direita do rotulo (ex.: botao "agora"). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  id,
  label,
  param,
  helper,
  error,
  tip,
  required,
  action,
  className = '',
  children,
}: FieldProps) {
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <label
            htmlFor={id}
            className="cursor-pointer text-label font-medium text-fg-body"
          >
            {label}
            {required && (
              <span className="ml-1 text-danger" aria-hidden>
                *
              </span>
            )}
            {required && <span className="sr-only"> (obrigatório)</span>}
          </label>
          {param && <ParamChip>{param}</ParamChip>}
          {tip && <HelpTip content={tip} />}
        </div>
        {action}
      </div>

      {/* O controle recebe os ids de descricao via contexto do consumidor. */}
      <FieldDescribedBy.Provider value={{ describedBy, invalid: Boolean(error) }}>
        {children}
      </FieldDescribedBy.Provider>

      {helper && (
        <p id={helperId} className="text-caption text-fg-muted">
          {helper}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-caption font-medium text-danger"
        >
          {/* V-07: icone de verdade no lugar do glifo literal. */}
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/** Liga automaticamente aria-describedby / aria-invalid ao controle do Field. */
const FieldDescribedBy = React.createContext<{
  describedBy?: string;
  invalid: boolean;
}>({ invalid: false });

export function useFieldA11y() {
  const { describedBy, invalid } = React.useContext(FieldDescribedBy);
  return {
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
  } as const;
}

/* ------------------------------------------------------------------ */
/* Section — o bloco de trabalho de uma pagina                         */
/* ------------------------------------------------------------------ */

export function Section({
  step,
  title,
  description,
  action,
  children,
  className = '',
  id,
  icon: Icon,
  variant = 'plain',
  tinta = false,
}: {
  step?: number;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  icon?: React.ElementType;
  /**
   * Mantida aceita por compatibilidade: dezenas de chamadas ainda passam
   * `variant="card"`. Agora ela mapeia para a receita Cartao — nao existe mais
   * uma quinta superficie propria de Section.
   */
  variant?: 'plain' | 'card';
  /**
   * Troca a receita Cartao pela Destaque (linha de tinta no topo + halo da
   * area no canto). Vale com `variant="card"`, e no maximo uma vez por tela.
   */
  tinta?: boolean;
}) {
  const headingId = id ? `${id}-titulo` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col gap-4 scroll-mt-32',
        variant === 'card' && (tinta ? receitaDestaque : receitaCartao),
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line-strong pb-3">
        <div className="flex min-w-0 items-center gap-3">
          {step !== undefined && (
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 font-mono text-caption font-semibold text-fg-muted"
            >
              {step}
            </span>
          )}
          {/* O icone do titulo e GLIFO, nao selo: a tinta da area entra no
              traco e em mais nada. O quadradinho de 32px que morava aqui
              repetia a mesma forma em 18 secoes — e forma repetida vira
              textura, nao sinal. */}
          {Icon && (
            <Icon
              aria-hidden
              className="size-5 shrink-0 text-tinta"
            />
          )}
          <div className="min-w-0">
            <h2
              id={headingId}
              className="text-title font-semibold text-fg-strong"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-caption text-fg-muted">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* StatusDot — nunca comunica estado so pela cor                       */
/* ------------------------------------------------------------------ */

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

const TONE: Record<Tone, { dot: string; text: string }> = {
  success: { dot: 'bg-success', text: 'text-success' },
  warning: { dot: 'bg-warning', text: 'text-warning' },
  danger: { dot: 'bg-danger', text: 'text-danger' },
  accent: { dot: 'bg-tinta-texto', text: 'text-tinta-texto' },
  neutral: { dot: 'bg-fg-muted', text: 'text-fg-muted' },
};

export function StatusDot({
  tone = 'neutral',
  icon: Icon,
  children,
  className = '',
}: {
  tone?: Tone;
  icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5', t.text, className)}>
      {Icon ? (
        <Icon className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <span className={cn('size-2 shrink-0 rounded-full', t.dot)} aria-hidden />
      )}
      <span className="text-caption font-medium">{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Panel — receita Cartao com um cabecalho curto                       */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className = '',
  tone = 'default',
}: {
  title?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  /* O tom nao contorna mais o painel: ele pinta um FILETE de 2px na aresta
     esquerda, o mesmo vocabulario que o Callout passou a usar na FASE 3a. Um
     retangulo inteiro cercado de ambar dizia "esta caixa e o aviso"; o filete
     diz "esta caixa TEM um aviso", que e o que `tone` sempre quis dizer — e
     nao devolve um contorno a uma superficie que acabou de perder o dela. */
  const filete = {
    default: '',
    warning: 'border-l-2 border-l-warning/70',
    danger: 'border-l-2 border-l-danger/70',
    success: 'border-l-2 border-l-success/70',
  }[tone];

  return (
    <div className={cn(receitaCartao, filete, className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-label font-semibold text-fg-strong">
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Callout — NOTA inline (semantica, nao estrutural)                   */
/* ------------------------------------------------------------------ */

/**
 * FASE 3a: o Callout deixou de ser caixa e virou NOTA.
 *
 * Sao 40 usos. Com fundo, borda em volta e o texto inteiro na cor do tom, as
 * 40 gritavam juntas — e quarenta avisos com o mesmo volume e o mesmo que
 * nenhum. Agora a forma e um filete de 2px a esquerda na cor do tom, e SO o
 * icone e o filete carregam cor. O texto fica em `--fg-body`, onde ele se le.
 *
 * `danger` e a unica excecao, e ela e deliberada: mantem fundo (`bg-danger/8`),
 * porque "isto para uma venda" precisa de peso. A excecao NAO se estende a
 * `warning` — se tudo que avisa tiver fundo, voltamos as 40 caixas.
 *
 * A assinatura nao mudou: nenhum dos 40 pontos de chamada foi tocado.
 */
export function Callout({
  tone = 'warning',
  icon: Icon,
  title,
  children,
  className = '',
  id,
}: {
  tone?: 'warning' | 'danger' | 'success' | 'info';
  icon?: React.ElementType;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const filete = {
    warning: 'border-l-warning',
    danger: 'border-l-danger',
    success: 'border-l-success',
    info: 'border-l-tinta',
  }[tone];

  const corDoIcone = {
    warning: 'text-warning',
    danger: 'text-danger',
    success: 'text-success',
    info: 'text-tinta-texto',
  }[tone];

  return (
    <div
      id={id}
      className={cn(
        'flex min-w-0 items-start gap-2.5 border-l-2 pl-3',
        filete,
        // O fundo e privilegio do `danger`, e o raio so existe por causa dele:
        // sem fundo nao ha canto para arredondar.
        tone === 'danger' ? 'rounded-r-lg bg-danger/8 py-3 pr-3' : 'py-1',
        className
      )}
    >
      {Icon && (
        <Icon className={cn('mt-0.5 size-4 shrink-0', corDoIcone)} aria-hidden />
      )}
      <div className="min-w-0 flex-1 text-fg-body">
        {/* A hierarquia do titulo sai do PESO e do corpo, nao da cor: colorir
            a frase inteira e o que fazia 40 notas competirem com o dado da
            tela. Titulo e texto ficam os dois em `--fg-body` — 13px semibold
            contra 12px regular ja separa, e e a mesma regra que a FASE 2
            aplicou no resto do console. */}
        {title && <p className="text-label font-semibold">{title}</p>}
        {children && (
          <div className={cn('text-caption text-fg-body', title && 'mt-1')}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GuiaLink — leva para a documentacao em vez de virar mais um tooltip */
/* ------------------------------------------------------------------ */

export function GuiaLink({
  anchor,
  children,
}: {
  anchor: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/guia#${anchor}`}
      className="text-tinta-texto underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}
