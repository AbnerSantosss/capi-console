import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

import s from "./button.module.css"

/**
 * Alturas: sm=30 (toolbar densa) · default=36 · lg=42 (ação principal).
 * Raio 8px, um só, para toda a família. Os valores são os da página de
 * referência visual aprovada (wiki/assets/ux-v3/referencia-visual.html).
 *
 * O primário é papel chapado: fundo quase branco, texto quase preto. É o
 * elemento de maior luminosidade da tela, então é o que o olho acha primeiro,
 * sem precisar de matiz — nada de rampa vertical e nada de brilho varrendo.
 *
 * O que o CSS utilitário não escreve (as listras do estado ocupado e o disco
 * que gira) mora em `button.module.css`, ao lado.
 */
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto active:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: cn(
          "isolate overflow-hidden border-papel-active text-papel-texto",
          s.primario
        ),
        outline:
          "border-line-control bg-surface-2 text-fg-body shadow-realce hover:border-line-control hover:bg-surface-3 hover:text-fg-strong aria-expanded:bg-surface-3",
        secondary:
          "bg-surface-2 text-fg-body shadow-realce hover:bg-surface-3 hover:text-fg-strong",
        ghost:
          "text-fg-body hover:bg-surface-2 hover:text-fg-strong aria-expanded:bg-surface-2",
        destructive:
          "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 focus-visible:outline-danger",
        link: "text-tinta-texto underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-[30px] gap-1.5 px-2.5 text-caption",
        default: "h-control-sm gap-2 px-3.5 text-label",
        lg: "h-[42px] gap-2 px-5 text-body",
        icon: "size-control-sm",
        "icon-sm": "size-[30px]",
        "icon-lg": "size-[42px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends ButtonPrimitive.Props,
    VariantProps<typeof buttonVariants> {
  /**
   * Trabalho em andamento: listras andando no fundo, disco girando antes do
   * rótulo e `aria-busy` para quem ouve a tela. Com `prefers-reduced-motion`
   * tudo fica parado, e só as listras continuam ali.
   *
   * Quem chama continua responsável por `disabled` — o ocupado descreve o
   * estado, não bloqueia o clique sozinho.
   */
  ocupado?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  ocupado = false,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-ocupado={ocupado || undefined}
      aria-busy={ocupado || undefined}
      className={cn(
        buttonVariants({ variant, size }),
        ocupado && s.ocupado,
        className
      )}
      {...props}
    >
      {ocupado && (
        <span
          aria-hidden
          className={cn("size-[14px] shrink-0", s.girando)}
        />
      )}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
