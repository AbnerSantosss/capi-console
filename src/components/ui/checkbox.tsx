"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

/**
 * O estado marcado e comunicado por TRES sinais, nunca so pelo preenchimento
 * (SC 1.4.1): o fill de acento, o glifo de check e a borda, que sobe de
 * `line-control` para `accent-text` — 7.16 sobre o painel e 6.54 sobre o
 * campo, bem acima dos 3:1 de SC 1.4.11. Desmarcado, a borda de controle da
 * 3.91 sobre o painel.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-control border border-line-control bg-surface-2 transition-colors duration-150 outline-none",
        // Alvo de toque real de 40px, invisivel, em volta da caixa de 16px.
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
        "group-has-disabled/field:opacity-50 disabled:cursor-not-allowed disabled:opacity-50",
        "group-has-[:focus-visible]/field-label:not-data-checked:border-line-control",
        "data-checked:border-accent-text data-checked:bg-accent-fill data-checked:text-white",
        "group-has-[:focus-visible]/field-label:data-checked:border-accent-text",
        "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
        "aria-invalid:aria-checked:border-accent-text",
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
