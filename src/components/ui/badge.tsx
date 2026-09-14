import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Selo de estado — CINCO variantes, fechadas (C-7):
 * `neutro` (padrao) · `sucesso` · `aviso` · `perigo` · `info`.
 *
 * Uso:  <Badge variant="sucesso">enviado</Badge>
 *
 * C-9 — SELO NUNCA E CLICAVEL. Por isso ele e um <span> puro, sem `render`,
 * sem `onClick` embutido e sem estado de hover: se algo precisa de clique, e
 * botao ou filtro, nao selo. Trocar o elemento por <a>/<button> aqui seria
 * reabrir exatamente o que a regra fecha.
 *
 * C-10 — SELO SEMPRE TEM TEXTO. Nunca um ponto colorido sozinho: cor nao
 * comunica estado por si (SC 1.4.1). O icone e opcional e acompanha o texto.
 *
 * Forma: `rounded-full`, borda + texto na cor do estado sobre um fill de
 * apenas 10% — nunca fundo solido saturado, que competiria com o botao
 * primario e quebraria DS-1.2.
 *
 * Tipografia: `text-caption` (12/18), o menor degrau que existe. A formula
 * antiga usava o degrau de 11px, ELIMINADO por DS-4.9 — o piso do produto e
 * 12px renderizados, selo incluido. Nao o reintroduza.
 *
 * v3 — alinhamento com a pagina de referencia: pilula de 22px de altura, texto
 * em caixa normal (o `uppercase` + `tracking-wide` de antes gritava, e o selo
 * acompanha o dado, nao compete com ele) e icone lucide de 11px antes do
 * texto. As cores e as opacidades de borda NAO mudaram: as razoes medidas
 * logo abaixo foram calculadas para o /80, e o /30 da referencia derruba
 * perigo e info para menos de 2:1 contra o proprio fill.
 *
 * Contrastes medidos (pior caso das tres superficies onde o selo aparece —
 * painel s1, campo s2 e camada flutuante s3):
 *   texto  sucesso 6.41 · aviso 7.24 · perigo 4.82 · info 4.95 · neutro 7.26
 *   borda  sucesso 4.55 · aviso 5.07 · perigo 3.51 · info 3.63 · neutro 3.20
 * A borda colorida fica em 80%: abaixo disso (o /40 e /50 da praxe) perigo e
 * info caem para 1.81 e 2.86 contra o proprio fill e o limite some. O neutro
 * usa `line-control`, e nao `line-strong`, porque `--border-default` mede
 * 2.78 sobre a superficie flutuante — passa no painel e reprova no modal.
 */
const badgeVariants = cva(
  "inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border px-2 text-caption font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-[11px]!",
  {
    variants: {
      variant: {
        neutro: "border-line-control bg-surface-2 text-fg-muted",
        sucesso: "border-success/80 bg-success/10 text-success",
        aviso: "border-warning/80 bg-warning/10 text-warning",
        perigo: "border-danger/80 bg-danger/10 text-danger",
        info: "border-accent-text/80 bg-accent-text/10 text-accent-text",
      },
    },
    defaultVariants: {
      variant: "neutro",
    },
  }
)

function Badge({
  className,
  variant = "neutro",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
