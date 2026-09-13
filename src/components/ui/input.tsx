import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Altura 40px (44 abaixo de md). text-base no mobile impede o auto-zoom do
 * Safari iOS, que dispara com font-size < 16px; a partir de md cai para 14px.
 * A borda usa --input = --border-control (3.17:1) para atender a WCAG 1.4.11.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-control-lg w-full min-w-0 rounded-control border border-input bg-surface-2 px-3 py-1 text-input-mobile text-fg-body transition-colors outline-none",
        "placeholder:text-fg-disabled",
        "hover:border-fg-disabled",
        "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
