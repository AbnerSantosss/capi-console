'use client';

/**
 * Um site do cliente na aba Domínio (V8 do plano v7).
 *
 * O cartão diz só o que existe. As duas linhas de estado e a frase de baixo
 * vêm de `textoDoCartao` (`mensagens-dominio.ts`), que conhece três situações
 * e nenhuma outra: sem subdomínio, aguardando e pronto. "Pronto" só aparece
 * quando a rota `GET /api/tag/gerar` MEDIU que o endereço próprio responde por
 * este console, com certificado válido (`enderecoProprioPronto`). Enquanto a
 * medição não volta, ou quando ela falha, o cartão diz "aguardando".
 *
 * Nada aqui consulta DNS nem fala com provedor de certificado: o console não
 * tem como saber se o registro existe, e por isso não há botão de conferir.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Mail,
  Pencil,
  Send,
  Trash2,
} from '@/components/ui/icones';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { receitaBloco, receitaCartao, StatusDot } from '@/components/common/primitives';
import consoleStyles from '@/components/layout/console.module.css';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { registroDnsDe, type DominioTag } from '@/lib/tag-dominios';
import { cn } from '@/lib/utils';
import {
  enderecoProprioDe,
  mensagemParaCliente,
  SINTOMAS_NAO_FICOU_ATIVO,
  textoDoCartao,
  type EstadoDoDominio,
} from './mensagens-dominio';

/** A cor das duas linhas: verde só quando medido; âmbar esperando; neutro sem subdomínio. */
const TOM: Record<EstadoDoDominio, 'success' | 'warning' | 'neutral'> = {
  pronto: 'success',
  aguardando: 'warning',
  'sem-subdominio': 'neutral',
};

export interface CartaoDeDominioProps {
  dominio: DominioTag;
  /** URL pública deste console, sem a barra final. */
  base: string;
  /** Slug da empresa, para o atalho da aba Fontes. */
  slug: string;
  /**
   * O endereço próprio respondeu por este console? `true` só com a medição da
   * rota; `false` quando ela disse que não (ou falhou); `undefined` enquanto
   * a resposta não volta.
   */
  pronto: boolean | undefined;
  /** true enquanto um PUT está em voo. */
  salvando: boolean;
  copiar: (texto: string, chave: string) => void;
  copiado: string | null;
  /** Abre o modal no passo do subdomínio. */
  onTrocarSubdominio: () => void;
  /** Tira o site da lista. Devolve false quando o servidor recusou. */
  onRemover: () => Promise<boolean>;
}

export function CartaoDeDominio({
  dominio,
  base,
  slug,
  pronto,
  salvando,
  copiar,
  copiado,
  onTrocarSubdominio,
  onRemover,
}: CartaoDeDominioProps) {
  const [removendo, setRemovendo] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');

  const texto = textoDoCartao(dominio, pronto === true);
  const tom = TOM[texto.estado];
  const proprio = enderecoProprioDe(dominio);
  const registro = registroDnsDe(dominio, base);
  const mensagem = mensagemParaCliente(dominio, base);
  const chaveCopia = `mensagem-${dominio.id}`;
  const medindo = pronto === undefined && texto.estado !== 'sem-subdominio';
  const confirmado = confirmacao.trim().toLowerCase() === dominio.host;

  const remover = async () => {
    if (!confirmado) return;
    const ok = await onRemover();
    if (ok) {
      setRemovendo(false);
      setConfirmacao('');
    }
  };

  return (
    <li className={receitaCartao}>
      {/* Cabeçalho: o site e o endereço próprio ------------------------ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="wrap-token font-mono text-label font-semibold text-fg-strong">
            {dominio.host}
          </p>
          {proprio && (
            <p className="mt-0.5 text-caption text-fg-muted">
              Endereço próprio:{' '}
              <span className="wrap-token font-mono text-fg-body">{proprio}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onTrocarSubdominio}>
            <Pencil className="size-3.5" aria-hidden />
            {proprio ? 'Trocar subdomínio' : 'Escolher subdomínio'}
          </Button>
          {!removendo && (
            <Button size="sm" variant="ghost" onClick={() => setRemovendo(true)}>
              <Trash2 className="size-3.5 text-danger" aria-hidden />
              Remover
            </Button>
          )}
        </div>
      </div>

      {/* As duas linhas de estado ------------------------------------- */}
      <div className="mt-3 flex flex-col gap-1.5">
        <StatusDot tone={tom}>{texto.apontamento}</StatusDot>
        <StatusDot tone={tom}>{texto.certificado}</StatusDot>
      </div>
      <p className="mt-2 max-w-3xl text-body text-fg-body">{texto.detalhe}</p>
      {medindo && (
        <p className="mt-1 text-caption text-fg-muted">
          Conferindo se {proprio} já responde…
        </p>
      )}

      {/* Pronto: a tag nova está em Fontes ----------------------------- */}
      {texto.estado === 'pronto' && (
        <Link
          href={enderecoDaAba(slug, 'fontes')}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}
        >
          Abrir Fontes para copiar a tag
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}

      {/* Aguardando: o registro e a mensagem para o cliente ------------- */}
      {texto.estado === 'aguardando' && registro && (
        <div className="mt-4 flex flex-col gap-3">
          <div className={receitaBloco}>
            <p className="text-label font-semibold text-fg-strong">
              O registro que o cliente cria no DNS de {dominio.host}
            </p>
            <div
              className={cn(consoleStyles.rolagemDoPainel, 'mt-2')}
              tabIndex={0}
              role="region"
              aria-label={`Registro de DNS de ${dominio.host}`}
            >
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {['Tipo', 'Nome', 'Valor'].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="py-2 pr-4 text-label font-semibold text-fg-strong"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-caption text-fg-body">
                      {registro.tipo}
                    </td>
                    <td className="py-2 pr-4 font-mono text-caption text-fg-body">
                      {registro.nome}
                    </td>
                    <td className="wrap-token py-2 pr-4 font-mono text-caption text-fg-body">
                      {registro.valor}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-caption text-fg-muted">
              TTL: {registro.ttl} · Proxy: {registro.proxy}
            </p>
          </div>

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

          <details className="text-caption text-fg-body">
            <summary className="cursor-pointer text-label font-semibold text-fg-strong">
              Não ficou ativo?
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {SINTOMAS_NAO_FICOU_ATIVO.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* Remover, com o endereço digitado para confirmar ----------------- */}
      {removendo && (
        <div className={cn(receitaBloco, 'mt-4 flex flex-col gap-2')}>
          <p className="flex items-start gap-2 text-caption text-fg-body">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            <span>
              A coleta de {dominio.host} para na hora: o coletor passa a recusar
              os eventos deste site. Para confirmar, digite{' '}
              <span className="font-mono text-fg-strong">{dominio.host}</span>.
            </span>
          </p>
          <Input
            id={`remover-${dominio.id}`}
            aria-label={`Digite ${dominio.host} para confirmar`}
            value={confirmacao}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setConfirmacao(e.target.value)}
            className="wrap-token max-w-sm font-mono"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={!confirmado || salvando}
              ocupado={salvando}
              onClick={remover}
            >
              Remover {dominio.host}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRemovendo(false);
                setConfirmacao('');
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default CartaoDeDominio;
