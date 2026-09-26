"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { CheckIcon } from "@/components/ui/icones"

/**
 * O estado marcado e comunicado por TRES sinais, nunca so pelo preenchimento
 * (SC 1.4.1): o fill, o glifo de check e a borda, que sobe de `line-control`
 * para `tinta-texto` — 7.38 sobre o painel no console e 11.68 no login (pior
 * caso das cinco areas), bem acima dos 3:1 de SC 1.4.11. Desmarcado, a borda
 * de controle da 4.53 sobre o painel no console e 4.15 no login.
 *
 * v4: o fill marcado saiu do azul de acao para a TINTA da area — `bg-tinta`,
 * o degrau de fundo. A escolha e deliberada e nao e o fundo do botao
 * primario: a acao primaria so pode haver uma por dobra, e uma lista de dez
 * caixas marcadas com o fundo dela teria dez primarios. Marcar uma caixa e
 * dizer "este item entra", e isso e da area.
 *
 * v7: o glifo e `papel-texto`, "o que se escreve sobre a acao". A tinta do
 * console e escura (o azul de acao), e `surface-0` sobre ela daria 3.69;
 * `papel-texto` da 5.10 no console (branco) e 9.33 no pior caso do login
 * (quase preto sobre a tinta clara do P0). O gate mede o par nas duas paletas,
 * no grupo "Tinta cheia". O raio e `rounded-md` (6px, o mesmo do P0): com o
 * `--radius-control` de 9px do console a caixa de 16px viraria um circulo e
 * passaria por botao de radio.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-md border border-line-control bg-surface-2 transition-colors duration-150 outline-none",
        // Alvo de toque real de 40px, invisivel, em volta da caixa de 16px.
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto",
        "group-has-disabled/field:opacity-50 disabled:cursor-not-allowed disabled:opacity-50",
        "group-has-[:focus-visible]/field-label:not-data-checked:border-line-control",
        "data-checked:border-tinta-texto data-checked:bg-tinta data-checked:text-papel-texto",
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
