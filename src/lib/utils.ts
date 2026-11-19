import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Os tamanhos de texto do projeto (tokens --text-* do @theme em globals.css).
// Sem esta lista o tailwind-merge acha que `text-caption` e `text-fg-body` são
// duas cores e joga fora o tamanho: o texto voltava para os 16px do body.
export const TAMANHOS_DE_TEXTO = [
  "caption",
  "label",
  "body",
  "title",
  "heading",
  "data",
  "pagina",
  "display",
  "input-mobile",
  "code-inline",
]

// As medidas de controle do projeto (tokens --spacing-control-* do @theme).
// Sem esta lista o tailwind-merge não sabe que `h-control-sm` é uma altura e
// mantém as duas quando alguém passa `h-10` por cima: vence a que o CSS
// gerado escrever por último, não a de quem chamou.
export const MEDIDAS_DE_CONTROLE = ["control-sm", "control-md", "control-lg"]

const twMerge = extendTailwindMerge({
  extend: { theme: { text: TAMANHOS_DE_TEXTO, spacing: MEDIDAS_DE_CONTROLE } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
