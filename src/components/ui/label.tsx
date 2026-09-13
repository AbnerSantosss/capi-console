"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Rotulo de campo = `text-label` (13/20), o degrau que a escala nomeia para
 * rotulo, texto de botao e item de menu. Era o degrau generico de 14px fixo
 * do Tailwind, que nao escalava com a densidade e nao existe mais no produto
 * fora de `auth/`.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-label leading-none font-medium text-fg-body select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
