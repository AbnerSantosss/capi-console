import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Altura 44px (40 a partir de md). O tamanho de texto no mobile e
 * `--text-input-mobile` (16px): abaixo disso o Safari iOS da zoom automatico
 * no campo, e `maximumScale` esta corretamente ausente. E a unica excecao
 * nomeada a escala tipografica (§6.4.4) — nao copie o literal.
 *
 * A borda usa `line-control` (3.91 sobre o painel, 3.57 sobre o proprio
 * campo) para atender a SC 1.4.11. O placeholder usa `fg-muted` (8.86), nao
 * `fg-disabled`: placeholder E conteudo, e `fg-disabled` mede 5.11 sobre o
 * painel — reprova como texto em qualquer superficie.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-control-lg w-full min-w-0 rounded-control border border-line-control bg-surface-2 px-3 py-1 text-input-mobile text-fg-body transition-colors outline-none",
        "placeholder:text-fg-muted",
        "hover:border-fg-disabled",
        "focus-visible:border-tinta-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
        "md:h-control-md md:text-body",
        className
      )}
      {...props}
    />
  )
}

export { Input }
