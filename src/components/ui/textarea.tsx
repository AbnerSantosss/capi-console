import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-control border border-input bg-surface-2 px-3 py-2 text-[16px] text-fg-body transition-colors outline-none",
        "placeholder:text-fg-disabled",
        "hover:border-fg-disabled",
        "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
