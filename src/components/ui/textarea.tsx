import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Mesmas regras do Input: `--text-input-mobile` (16px) como anti-zoom do
 * Safari iOS, borda `line-control` para SC 1.4.11 e placeholder em `fg-muted`
 * — placeholder e conteudo, e `fg-disabled` (5.11 sobre o painel) so pode
 * existir como ornamento.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-control border border-line-control bg-surface-2 px-3 py-2 text-input-mobile text-fg-body transition-colors outline-none",
        "placeholder:text-fg-muted",
        "hover:border-fg-disabled",
        "focus-visible:border-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
        "md:text-body",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
