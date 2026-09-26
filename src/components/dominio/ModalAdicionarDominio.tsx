'use client';

/**
 * Modal da aba Domínio (V8 do plano v7): adicionar um site do cliente, ou
 * trocar o subdomínio de um site que já está na lista.
 *
 * Três passos, um por vez:
 *
 *  1. o site do cliente (só no modo "novo");
 *  2. o subdomínio, com a sugestão `m` e a dica de nomes que bloqueador de
 *     anúncio derruba. "Salvar sem subdomínio" também serve: a tag usa o nosso
 *     endereço e coleta do mesmo jeito;
 *  3. a mensagem para o cliente criar o registro, com Copiar, WhatsApp e
 *     E-mail.
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
  const descricao =
    passo === 1
      ? 'Passo 1 de 3: o site do cliente.'
      : passo === 2
        ? trocando
          ? 'O endereço próprio que a tag vai usar dentro do site do cliente.'
          : 'Passo 2 de 3: o endereço próprio da tag.'
        : trocando
          ? 'Mande esta mensagem ao dono do site.'
          : 'Passo 3 de 3: mande esta mensagem ao dono do site.';

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
              helper="Sem https:// e sem barra. Por exemplo: loja.com.br"
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

            <p className="text-caption text-fg-body">
              Endereço próprio:{' '}
              <span className="wrap-token font-mono text-fg-strong">
                {subLimpo && !erroSub ? `${subLimpo}.${host}` : `….${host}`}
              </span>
              . Enquanto o certificado não fica pronto, a tag usa o nosso
              endereço e continua coletando.
            </p>

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
                  {trocando ? 'Tirar o subdomínio' : 'Salvar sem subdomínio'}
                </Button>
              )}
              <Button type="submit" disabled={!subOk || salvando} ocupado={salvando}>
                Salvar e ver a mensagem
              </Button>
            </DialogFooter>
          </form>
        )}

        {passo === 3 && mensagem && (
          <div className="flex flex-col gap-4">
            <Field
              id="dominio-mensagem"
              label="Mensagem para o cliente"
              helper="Escrita para o dono do site, não para quem cuida de DNS. Mande assim, sem editar."
            >
              <Textarea
                id="dominio-mensagem"
                readOnly
                spellCheck={false}
                rows={10}
                value={mensagem.texto}
                className="wrap-token font-mono text-caption"
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copiar(mensagem.texto, chaveCopia)}
              >
                {copiado === chaveCopia ? (
                  <Check className="size-3.5 text-success" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                Copiar mensagem para o cliente
              </Button>
              <a
                href={mensagem.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                <Send className="size-3.5" aria-hidden />
                WhatsApp
              </a>
              <a
                href={mensagem.email}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                <Mail className="size-3.5" aria-hidden />
                E-mail
              </a>
            </div>

            <DialogFooter>
              <Button onClick={aoFechar}>Concluir</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ModalAdicionarDominio;
