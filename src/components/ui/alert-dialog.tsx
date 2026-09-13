'use client';

/**
 * AlertDialog — confirmação de ação com consequência (13.4.3).
 *
 * Por que não é o `Dialog` comum: `@base-ui/react/alert-dialog` dá de graça
 * três coisas que o `Dialog` não dá e que ninguém acerta à mão —
 *   `role="alertdialog"`, para o leitor de tela anunciar o corpo junto do
 *   título;
 *   foco inicial na caixa (e devolvido ao gatilho na saída);
 *   clique fora NÃO descarta. Uma confirmação de envio real não pode sumir
 *   porque o cotovelo encostou no fundo.
 *
 * A superfície é a mesma do `ui/dialog.tsx` — --surface-3 com
 * --border-control e --radius-dialog — porque camada flutuante é uma só
 * (DS-2.5). Se o dialog mudar de pele, este muda junto, à mão e de propósito.
 *
 * Usuários: confirmação de envio manual (`dispatch/ConfirmDialog`), o Switch
 * de disparo automático (PARTE 9, C-4) e apagar Pixel (PARTE 8, PX-11).
 *
 * ⚠️ Sem botão "X" de fechar, por desenho: um alerta se resolve escolhendo
 * uma das duas ações, não fugindo dele pelo canto.
 */

import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogBackdrop({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-backdrop"
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/60 duration-100 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  children,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal">
      <AlertDialogBackdrop />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-dialog border border-line-control bg-surface-3 p-5 text-body text-fg-body shadow-2xl duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-heading leading-none font-semibold text-fg-strong', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-caption text-fg-muted', className)}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        // -mx-5/-mb-5 casa com o p-5 do conteúdo: a faixa sangra até a borda.
        '-mx-5 -mb-5 flex flex-row justify-end gap-2 rounded-b-dialog border-t border-line-control bg-surface-2 px-5 py-4',
        className
      )}
      {...props}
    />
  );
}

/** Sai sem fazer nada. Fecha pelo primitivo, então não precisa de handler. */
function AlertDialogCancel({
  children = 'Cancelar',
  ...props
}: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button variant="outline" />}
      {...props}
    >
      {children}
    </AlertDialogPrimitive.Close>
  );
}

/**
 * Executa a ação. NÃO fecha sozinho: quem chama decide se fecha na hora ou
 * depois da resposta do servidor — o disparo para a Meta é assíncrono e o
 * diálogo precisa poder ficar aberto mostrando o estado.
 */
function AlertDialogAction({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="alert-dialog-action"
      variant={variant}
      className={className}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBackdrop,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
};
