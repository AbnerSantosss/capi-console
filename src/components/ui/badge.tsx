import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-micro font-semibold whitespace-nowrap transition-all focus-visible:border-accent-text focus-visible:ring-[3px] focus-visible:ring-accent-text/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-danger aria-invalid:ring-danger/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-accent-fill text-white",
        secondary: "bg-surface-2 text-fg-body",
        destructive:
          "bg-danger/10 text-danger focus-visible:ring-danger/20 [a]:hover:bg-danger/20",
        // O selo `outline` só existe pela borda: por isso line-control, que é
        // o único que cruza 3:1 também sobre a superfície de modal.
        outline: "border-line-control text-fg-muted",
        ghost: "hover:bg-surface-2 hover:text-fg-strong",
        link: "text-accent-text underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
