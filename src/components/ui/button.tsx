import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Alturas: sm=36 (so toolbar desktop) · default=40 · lg=44 (primario e mobile).
 * Nada abaixo de 36px — ver plano-redesign-ux-v2.md secao 3.7.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-control border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-accent-fill text-white hover:bg-accent-fill-hover active:bg-accent-fill-active",
        outline:
          "border-line-control bg-surface-2 text-fg-body hover:border-line-control hover:bg-surface-3 hover:text-fg-strong aria-expanded:bg-surface-3",
        secondary:
          "bg-surface-2 text-fg-body hover:bg-surface-3 hover:text-fg-strong",
        ghost:
          "text-fg-muted hover:bg-surface-2 hover:text-fg-strong aria-expanded:bg-surface-2",
        destructive:
          "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 focus-visible:outline-danger",
        link: "text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-control-sm gap-1.5 px-3 text-label",
        default: "h-control-md gap-2 px-3.5 text-label",
        lg: "h-control-lg gap-2 px-5 text-body font-semibold",
        icon: "size-control-md",
        "icon-sm": "size-control-sm",
        "icon-lg": "size-control-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
