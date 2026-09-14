'use client';

import * as React from 'react';
import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

/**
 * O controle mais perigoso do produto (13.3.1).
 *
 * Ele existe por um motivo so: ligar e desligar o disparo automatico de UM
 * Pixel. Por isso ele nao e um `input` estilizado com um rotulo por fora — o
 * rotulo e a descricao entram por prop e sao OBRIGATORIOS, porque um switch
 * sem consequencia escrita ao lado e como se liga o que ninguem pediu.
 *
 * As seis regras de 13.3.1, e onde cada uma esta:
 *
 *   C-1  o trilho tem BORDA nos dois estados (>= 3:1, SC 1.4.11) e o estado
 *        aparece tambem em TEXTO — "Ligado" / "Desligado" —, nunca so na cor
 *        nem so na posicao do botao.
 *   C-2  alvo de 44px (`--spacing-control-lg`) e 48px sob `pointer: coarse`,
 *        por um pseudo-elemento: o trilho continua com 24px de altura, mas a
 *        area que aceita o dedo e a do dedo.
 *   C-3  `rotulo` e `descricao` obrigatorios e SEMPRE visiveis. A descricao e
 *        o texto A2 da PARTE 11 — nao pode virar tooltip (conflito B).
 *   C-4  a confirmacao de ligar NAO mora aqui. Quem chama decide, porque so
 *        quem chama sabe o nome do objeto e a contagem de regras que o texto
 *        precisa citar (9.7.1). Este componente so avisa que o usuario pediu.
 *   C-5  nunca dentro de menu, acordeao ou tooltip. Isto se cumpre no uso.
 *   C-6  `salvando` deixa o estado de gravacao explicito, e o `checked` e
 *        controlado de fora: o switch NAO volta sozinho. Ou o servidor
 *        confirmou, ou quem chama volta o valor mostrando o erro.
 */

export interface SwitchProps
  extends Omit<SwitchPrimitive.Root.Props, 'className' | 'render'> {
  /** C-3 — o nome da coisa que este switch liga. Obrigatorio. */
  rotulo: string;
  /** C-3 — a consequencia, em uma frase. Obrigatorio, e sempre visivel. */
  descricao: string;
  /** C-6 — verdadeiro enquanto o servidor nao respondeu. */
  salvando?: boolean;
  /**
   * Linha extra abaixo da descricao (aviso, redundancia de Pixel unico).
   * Fica no fluxo, visivel, como tudo mais.
   */
  rodape?: React.ReactNode;
  className?: string;
}

export function Switch({
  rotulo,
  descricao,
  salvando = false,
  rodape,
  className,
  checked,
  disabled,
  id,
  ...props
}: SwitchProps) {
  const gerado = React.useId();
  const idControle = id ?? `switch-${gerado}`;
  const idDescricao = `${idControle}-descricao`;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label
            htmlFor={idControle}
            className="text-label font-semibold text-fg-strong"
          >
            {rotulo}
          </label>
          {/* C-3 / A2 — a consequencia fica no fluxo, sempre. Sem tooltip. */}
          <p id={idDescricao} className="mt-0.5 text-caption text-fg-body">
            {descricao}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* C-1 — o estado em PALAVRA. Quem nao distingue as cores, quem
              imprime em escala de cinza e quem usa leitor de tela leem a
              mesma coisa que todo mundo. */}
          <span
            aria-hidden
            className={cn(
              'text-caption font-semibold tabular',
              salvando
                ? 'text-fg-muted'
                : checked
                  ? 'text-accent-text'
                  : 'text-fg-muted'
            )}
          >
            {salvando ? 'Salvando…' : checked ? 'Ligado' : 'Desligado'}
          </span>

          <SwitchPrimitive.Root
            id={idControle}
            checked={checked}
            disabled={disabled || salvando}
            aria-describedby={idDescricao}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 shadow-realce transition-colors duration-150 outline-none',
              // C-1 — borda nos DOIS estados. Desligado: `line-control`
              // (3.91 sobre o painel). Ligado: `accent-text` (7.09). O
              // preenchimento e o terceiro sinal, nunca o unico.
              //
              // v3: o trilho desligado subiu de `surface-2` para `surface-3`.
              // Sobre o cartao (que agora tem rampa a partir de `surface-1`),
              // o `surface-2` mal se separava do fundo e o switch desligado
              // sumia — um controle que so aparece quando esta ligado esconde
              // metade do estado que ele existe para mostrar.
              'border-line-control bg-surface-3',
              'data-checked:border-accent-text data-checked:bg-accent-fill',
              // C-2 — o alvo de toque de verdade: 44px, 48px em ponteiro
              // grosso. Invisivel, em volta do trilho de 44x24.
              'after:absolute after:-inset-y-2.5 after:-inset-x-0 after:content-[""]',
              '[@media(pointer:coarse)]:after:-inset-y-3',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text',
              'disabled:cursor-not-allowed disabled:opacity-60'
            )}
            {...props}
          >
            <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-fg-strong shadow-sm transition-[translate] duration-150 data-checked:translate-x-5 data-checked:bg-white" />
          </SwitchPrimitive.Root>
        </div>
      </div>

      {rodape}
    </div>
  );
}

export default Switch;
