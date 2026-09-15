"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

/**
 * O menu de "mais acoes" — os tres pontinhos no fim de uma linha de lista.
 *
 * FASE 5 do redesign v4. Nasceu porque a linha da caixa de entrada empilhava
 * OITO zonas soltas e virou quatro colunas fixas: o que nao coube precisa de um
 * lugar com endereco, e "sumir da tela" nao e um lugar.
 *
 * E o mesmo desenho de `select.tsx`, de proposito — Portal, Positioner isolado
 * em `z-50`, Popup com borda de CONTROLE (`line-control`) sobre `surface-3` e a
 * barra de tinta de 2px marcando o item sob o cursor ou sob a seta do teclado.
 * Um popup e a unica superficie do v4 que ainda leva contorno: ele flutua sobre
 * conteudo qualquer, e ali nao existe degrau de luz que se possa garantir.
 *
 * O menu guarda ACAO e tambem DADO: `Detalhe` e um bloco nao-interativo, fora
 * da navegacao por setas, para o que a linha deixou de mostrar (e-mail, pedido,
 * sinais de atribuicao, resultado por Pixel). Sem ele o "colapsar para quatro
 * colunas" seria so esconder informacao.
 */

const Menu = MenuPrimitive.Root

const MenuTrigger = MenuPrimitive.Trigger

function MenuContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "end",
  alignOffset = 0,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            "relative isolate z-50 max-h-(--available-height) w-max max-w-[min(calc(100vw-2rem),22rem)] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-panel border border-line-control bg-surface-3 p-1 text-fg-body shadow-lg duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(
        // Mesma regua do SelectItem: nenhum preenchimento escuro chega a 3:1
        // sobre o popup, entao quem cumpre §1.4.11 e a barra de tinta, que fica
        // reservada em transparente para o texto nao pular ao navegar.
        "relative flex w-full cursor-pointer items-center gap-2 rounded-control border-l-2 border-transparent px-2 py-1.5 text-label outline-hidden select-none data-highlighted:border-tinta-texto data-highlighted:bg-tinta/15 data-highlighted:text-fg-strong data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

/** Titulo de um grupo. Sem `uppercase tracking-wide` (§10 do plano). */
function MenuGroupLabel({
  className,
  ...props
}: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-group-label"
      className={cn("px-2 py-1 text-caption font-medium text-fg-muted", className)}
      {...props}
    />
  )
}

function MenuSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="menu-separator"
      role="separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-line", className)}
      {...props}
    />
  )
}

/**
 * Dado, e nao acao: bloco de leitura dentro do popup.
 *
 * Fica FORA da navegacao por setas do Base UI (nao e `Menu.Item`), porque um
 * paragrafo que recebe foco de teclado e um obstaculo entre quem usa o teclado
 * e o botao que ele veio apertar.
 */
function MenuDetalhe({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="menu-detalhe"
      className={cn(
        "flex min-w-0 flex-col gap-1 px-2 py-1.5 text-caption text-fg-muted",
        className
      )}
      {...props}
    />
  )
}

export {
  Menu,
  MenuContent,
  MenuDetalhe,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
}
