"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { CheckIcon } from "@/components/ui/icones"

/**
 * O estado marcado e comunicado por TRES sinais, nunca so pelo preenchimento
 * (SC 1.4.1): o fill, o glifo de check e a borda, que sobe de `line-control`
 * para `tinta-texto` — 11.68 sobre o painel no pior caso das cinco areas, bem
 * acima dos 3:1 de SC 1.4.11. Desmarcado, a borda de controle da 4.15 sobre o
 * painel.
 *
 * v4: o fill marcado saiu do azul de acao (que nao existe mais) para a TINTA
 * da area — `bg-tinta`, o degrau de fundo. A escolha e deliberada e nao e
 * `bg-papel`: o papel claro e a ACAO PRIMARIA da tela, e so pode haver uma
 * por dobra; uma lista de dez caixas marcadas em papel teria dez primarios.
 * Marcar uma caixa e dizer "este item entra", e isso e da area. O glifo vira
 * `surface-0` — quase preto sobre a tinta cheia, 10:1 no pior caso, medido
 * pelo gate no grupo "glifo sobre a tinta cheia".
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-control border border-line-control bg-surface-2 transition-colors duration-150 outline-none",
        // Alvo de toque real de 40px, invisivel, em volta da caixa de 16px.
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto",
        "group-has-disabled/field:opacity-50 disabled:cursor-not-allowed disabled:opacity-50",
        "group-has-[:focus-visible]/field-label:not-data-checked:border-line-control",
        "data-checked:border-tinta-texto data-checked:bg-tinta data-checked:text-surface-0",
        "group-has-[:focus-visible]/field-label:data-checked:border-tinta-texto",
        "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
        "aria-invalid:aria-checked:border-tinta-texto",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
