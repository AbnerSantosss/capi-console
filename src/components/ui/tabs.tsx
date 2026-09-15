"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

/**
 * A lista e a superficie de BAIXO (--surface-1); a aba ativa sobe para a de
 * CIMA (--surface-2). Antes era o contrario: a lista pintava a ponte
 * `--muted` (= --surface-2) e a aba ativa a ponte `--background`
 * (= --surface-0), o fundo mais escuro do app — o item selecionado
 * afundava. Ver §13.4.2.
 *
 * O fill sozinho quase nao separa (s1 x s2 = 1.09): quem delimita a aba ativa
 * e a borda `line-control` (3.91 sobre a lista, 3.57 sobre a propria aba),
 * como manda DS-0.3 — elevacao vem da borda, nao do preenchimento.
 *
 * Raio: 6px na aba (controle) dentro de 10px na lista (painel). Os 10 = 6 do
 * filho + os ~4 de `p-1`, que e a geometria de canto concentrico e tambem a
 * escada de DS-5.1 (o raio cresce com a elevacao).
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center gap-1 rounded-panel p-1 text-fg-muted group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-surface-1",
        line: "bg-transparent p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // h-control-sm (36px) e o piso de alvo de DS-5.2; o `h-8` anterior
        // rendia 28px na densidade compacta. A altura fica em px e nao escala;
        // quem responde a densidade e o espaco (gap, px, p-1 da lista) — DS-4.10.
        "relative inline-flex h-control-sm flex-1 items-center justify-center gap-1.5 rounded-control border border-transparent px-3 text-label font-medium whitespace-nowrap text-fg-muted transition-colors duration-150 outline-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:border-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        // A correcao de §13.4.2: sobe de superficie e ganha limite visivel.
        // Sem sombra — DS-2.4 reserva sombra para camada flutuante.
        "data-active:border-line-control data-active:bg-surface-2 data-active:text-fg-strong",
        // Variante `line`: a aba ativa e marcada pelo risco de acento.
        "after:absolute after:bg-tinta-texto after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:-bottom-1 group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-body outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
