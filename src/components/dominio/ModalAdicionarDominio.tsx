'use client';

/**
 * Modal da aba Domínio (V8 do plano v7): adicionar um site do cliente, ou
 * trocar o subdomínio de um site que já está na lista.
 *
 * Três passos, um por vez:
 *
 *  1. o site do cliente (só no modo "novo");
 *  2. o subdomínio, com a sugestão `m` e a dica de nomes que bloqueador de
 *     anúncio derruba, e a prévia ao vivo do endereço. "Sem subdomínio" também
 *     serve: a tag usa o nosso endereço e coleta do mesmo jeito;
 *  3. a mensagem para o cliente criar o registro: Copiar (primário), WhatsApp
 *     e E-mail só com ícone, e o texto inteiro recolhido em "Ver a mensagem".
 *
 * O modal é montado só quando abre (a aba o monta com `key`), então o estado
 * nasce das props e não precisa de efeito para "zerar" entre uma abertura e
 * outra.
 */

import React, { useState } from 'react';
import { ArrowLeft, Check, Copy, Mail, Send } from '@/components/ui/icones';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/common/primitives';
import { erroDoDominio, normalizarDominio, type DominioTag } from '@/lib/tag-dominios';
import {
  DICA_DO_SUBDOMINIO,
  erroDoSubdominio,
  mensagemParaCliente,
  SUBDOMINIO_SUGERIDO,
} from './mensagens-dominio';

/** O que o modal pede para gravar: o site e o subdomínio (vazio = sem subdomínio). */
export interface PedidoDeDominio {
  host: string;
  subdominio: string;
}

export type ModoDoModal =
  | { tipo: 'novo' }
  | { tipo: 'trocar'; dominio: DominioTag };

export interface ModalAdicionarDominioProps {
  modo: ModoDoModal;
  /** A lista de hoje, para recusar site repetido antes de ir ao servidor. */
  dominios: DominioTag[];
  /** URL pública deste console, sem a barra final. */
  base: string;
  /** true enquanto um PUT está em voo. */
  salvando: boolean;
  /**
   * Grava o pedido. Devolve o domínio como o servidor guardou, ou null quando
   * ele recusou (o toast de erro é de quem grava).
   */
  onSalvar: (pedido: PedidoDeDominio) => Promise<DominioTag | null>;
  copiar: (texto: string, chave: string) => void;
  copiado: string | null;
  aoFechar: () => void;
}

type Passo = 1 | 2 | 3;

export function ModalAdicionarDominio({
  modo,
  dominios,
  base,
  salvando,
  onSalvar,
  copiar,
  copiado,
  aoFechar,
}: ModalAdicionarDominioProps) {
  const trocando = modo.tipo === 'trocar' ? modo.dominio : null;

  const [passo, setPasso] = useState<Passo>(trocando ? 2 : 1);
  const [site, setSite] = useState(trocando?.host ?? '');
  const [sub, setSub] = useState(trocando?.subdominio || SUBDOMINIO_SUGERIDO);
  const [salvo, setSalvo] = useState<DominioTag | null>(null);

  /* Passo 1 — o site ------------------------------------------------- */
  const host = trocando ? trocando.host : normalizarDominio(site);
  const repetido = !trocando && Boolean(host) && dominios.some((d) => d.host === host);
  const erroSite = trocando
    ? null
    : site.trim()
      ? (erroDoDominio(host) ?? (repetido ? 'Este site já está na lista.' : null))
      : null;
  const siteOk = Boolean(host) && !erroSite;

  /* Passo 2 — o subdomínio ------------------------------------------- */
  const subLimpo = sub.trim().toLowerCase();
  const erroSub = erroDoSubdominio(sub);
  const subOk = Boolean(subLimpo) && !erroSub;
  const tinhaSub = Boolean(trocando?.subdominio);

  const gravar = async (subdominio: string) => {
    const guardado = await onSalvar({ host, subdominio });
    if (!guardado) return;
    if (subdominio) {
      setSalvo(guardado);
      setPasso(3);
    } else {
      aoFechar();
    }
  };

  /* Passo 3 — a mensagem -------------------------------------------- */
  const mensagem = salvo ? mensagemParaCliente(salvo, base) : null;
  const chaveCopia = salvo ? `modal-mensagem-${salvo.id}` : 'modal-mensagem';

  const titulo = trocando ? `Subdomínio de ${trocando.host}` : 'Adicionar domínio';
  // No modo trocar não há passo 1: a descrição perde o "Passo x de 3".
  const descricao =
    passo === 1
      ? 'Passo 1 de 3 · O site'
      : passo === 2
        ? trocando
          ? 'O endereço'
          : 'Passo 2 de 3 · O endereço'
        : trocando
          ? 'Mande ao cliente'
          : 'Passo 3 de 3 · Mande ao cliente';

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        {passo === 1 && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (siteOk) setPasso(2);
            }}
          >
            <Field
              id="dominio-site-novo"
              label="Site do cliente"
              helper={<span title="Sem https:// e sem barra.">Ex.: loja.com.br, sem https://</span>}
              error={erroSite ?? undefined}
            >
              <Input
                id="dominio-site-novo"
                value={site}
                placeholder="loja.com.br"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setSite(e.target.value)}
                onBlur={() => setSite(normalizarDominio(site))}
                className="wrap-token font-mono"
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={aoFechar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!siteOk}>
                Continuar
              </Button>
            </DialogFooter>
          </form>
        )}

        {passo === 2 && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (subOk && !salvando) void gravar(subLimpo);
            }}
          >
            <Field
              id="dominio-sub-novo"
              label="Subdomínio"
              helper={DICA_DO_SUBDOMINIO}
              error={erroSub ?? undefined}
            >
              <Input
                id="dominio-sub-novo"
                value={sub}
                placeholder={SUBDOMINIO_SUGERIDO}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setSub(e.target.value)}
                onBlur={() => setSub(sub.trim().toLowerCase())}
                className="wrap-token max-w-40 font-mono"
              />
            </Field>

            {/* Prévia ao vivo do endereço, enquanto digita. */}
            <div className="flex min-w-0 flex-col gap-1">
              <p className="wrap-token font-mono text-title font-semibold text-fg-strong" aria-live="polite">
                {subLimpo && !erroSub ? `${subLimpo}.${host}` : `….${host}`}
              </p>
              <p className="text-caption text-fg-muted">Até ficar pronto, a tag usa o nosso.</p>
            </div>

            <DialogFooter className="flex-wrap">
              {!trocando && (
                <Button type="button" variant="ghost" onClick={() => setPasso(1)}>
                  <ArrowLeft className="size-3.5" aria-hidden />
                  Voltar
                </Button>
              )}
              {(!trocando || tinhaSub) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={salvando}
                  onClick={() => void gravar('')}
                >
                  {trocando ? 'Tirar' : 'Sem subdomínio'}
                </Button>
              )}
              <Button type="submit" disabled={!subOk || salvando} ocupado={salvando}>
                Salvar e continuar
              </Button>
            </DialogFooter>
          </form>
        )}

        {passo === 3 && mensagem && (
          <div className="flex flex-col gap-4">
            <p className="text-body text-fg-body">Já escrita para o dono do site. Mande assim.</p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                aria-label="Copiar mensagem para o cliente"
                onClick={() => copiar(mensagem.texto, chaveCopia)}
              >
                {copiado === chaveCopia ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                Copiar mensagem
              </Button>
              <a
                href={mensagem.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Mandar a mensagem pelo WhatsApp"
                title="WhatsApp"
                className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
              >
                <Send className="size-3.5" aria-hidden />
              </a>
              <a
                href={mensagem.email}
                aria-label="Mandar a mensagem por e-mail"
                title="E-mail"
                className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
              >
                <Mail className="size-3.5" aria-hidden />
              </a>
            </div>

            {/* A mensagem inteira, recolhida: `mensagem.texto` sem edição. */}
            <details className="min-w-0">
              <summary className="cursor-pointer text-label font-semibold text-fg-strong">
                Ver a mensagem
              </summary>
              <Textarea
                id="dominio-mensagem"
                aria-label="Mensagem para o cliente"
                readOnly
                spellCheck={false}
                rows={10}
                value={mensagem.texto}
                className="wrap-token mt-2 font-mono text-caption"
              />
            </details>

            <DialogFooter>
              <Button variant="outline" onClick={aoFechar}>
                Concluir
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ModalAdicionarDominio;
