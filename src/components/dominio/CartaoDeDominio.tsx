'use client';

/**
 * Um site do cliente na aba Domínio, como UMA LINHA da lista (redesenho de
 * 18/11/2026, T-R03; V8 do plano v7).
 *
 * Fechada, a linha diz só o que existe: o host, o endereço próprio (se há), um
 * selo com o estado e a ação do estado ("Escolher" / "Copiar mensagem" /
 * "Copiar a tag", todas em contorno). Troca, remoção, a mensagem, a conferência
 * e a tabela de DNS abrem EMBAIXO da linha, pelo botão de detalhes.
 *
 * O estado é dito uma vez: o selo. Saíram as três bolinhas e a frase que
 * repetia o selo. As linhas de `textoDoCartao` (`mensagens-dominio.ts`) seguem
 * valendo: o resumo delas vai no `title` do selo, e a frase `detalhe` abre
 * embaixo. "Pronto" só aparece quando a rota `GET /api/tag/gerar` MEDIU que o
 * endereço próprio responde por este console, com certificado válido
 * (`pronto === true`). Enquanto a medição não volta, ou quando ela falha, o
 * site fica em "Aguardando ativação".
 *
 * Nada aqui consulta DNS nem fala com provedor de certificado. O botão
 * "Conferir de novo" (só no estado aguardando) pede à mesma rota que meça de
 * novo; o resultado chega pela prop `pronto`.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Mail,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
} from '@/components/ui/icones';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/common/Esqueleto';
import { LinhaDaLista } from '@/components/common/ListaEmLinhas';
import consoleStyles from '@/components/layout/console.module.css';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { registroDnsDe, type DominioTag } from '@/lib/tag-dominios';
import { cn } from '@/lib/utils';
import {
  enderecoProprioDe,
  FRASE_AGUARDANDO,
  FRASE_PRONTO,
  mensagemParaCliente,
  ROTULO_CONFERINDO,
  ROTULO_CONFERIR,
  ROTULO_DO_ESTADO,
  SINTOMAS_NAO_FICOU_ATIVO,
  textoDoCartao,
  type EstadoDoDominio,
} from './mensagens-dominio';

/** A cor do selo: verde só quando medido; âmbar esperando; neutro sem subdomínio. */
const PILULA: Record<EstadoDoDominio, 'sucesso' | 'aviso' | 'neutro'> = {
  pronto: 'sucesso',
  aguardando: 'aviso',
  'sem-subdominio': 'neutro',
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
  /** true enquanto a conferência pedida pelo botão não volta. */
  conferindo: boolean;
  /** Mede de novo se o endereço próprio já responde, sem recarregar a página. */
  onConferir: () => void;
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
  conferindo,
  onConferir,
  salvando,
  copiar,
  copiado,
  onTrocarSubdominio,
  onRemover,
}: CartaoDeDominioProps) {
  const [aberto, setAberto] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');

  const texto = textoDoCartao(dominio, pronto === true);
  const proprio = enderecoProprioDe(dominio);
  const registro = registroDnsDe(dominio, base);
  const mensagem = mensagemParaCliente(dominio, base);
  const chaveCopia = `mensagem-${dominio.id}`;
  const medindo = pronto === undefined && texto.estado !== 'sem-subdominio';
  const confirmado = confirmacao.trim().toLowerCase() === dominio.host;
  const terceiraAcesa = pronto === true && texto.estado === 'pronto';
  const resumo = [texto.apontamento, texto.certificado, texto.detalhe].join(' ');
  const idDosDetalhes = `detalhes-${dominio.id}`;

  const remover = async () => {
    if (!confirmado) return;
    const ok = await onRemover();
    if (ok) {
      setRemovendo(false);
      setConfirmacao('');
    }
  };

  /* A ação do estado: uma só, em contorno. */
  const acaoDoEstado =
    texto.estado === 'sem-subdominio' ? (
      <Button size="sm" variant="outline" onClick={onTrocarSubdominio}>
        <Pencil className="size-4" aria-hidden />
        Escolher
      </Button>
    ) : terceiraAcesa ? (
      <Link
        href={enderecoDaAba(slug, 'fontes')}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        <Copy className="size-4" aria-hidden />
        Copiar a tag
      </Link>
    ) : texto.estado === 'aguardando' ? (
      <Button
        size="sm"
        variant="outline"
        aria-label="Copiar mensagem para o cliente"
        onClick={() => copiar(mensagem.texto, chaveCopia)}
      >
        {copiado === chaveCopia ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
        Copiar mensagem
      </Button>
    ) : null;

  const aberta = aberto || removendo;

  return (
    <LinhaDaLista
      titulo={
        <span className="wrap-token font-mono">
          {dominio.host}
          {proprio && (
            <span className="ml-2 text-caption font-normal text-fg-muted">{proprio}</span>
          )}
        </span>
      }
      fim={
        <>
          <span title={resumo}>
            <Badge variant={PILULA[texto.estado]}>{ROTULO_DO_ESTADO[texto.estado]}</Badge>
          </span>
          {acaoDoEstado}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-expanded={aberta}
            aria-controls={idDosDetalhes}
            aria-label={`Detalhes de ${dominio.host}`}
            onClick={() => setAberto((v) => !v)}
          >
            <ChevronDown
              className={cn('size-4 transition-transform motion-reduce:transition-none', aberta && 'rotate-180')}
              aria-hidden
            />
          </Button>
        </>
      }
    >
      {aberta && (
        <div id={idDosDetalhes} className="flex flex-col gap-3">
          {medindo && (
            <p className="text-caption text-fg-muted">Conferindo se {proprio} já responde…</p>
          )}

          {texto.estado === 'sem-subdominio' && (
            <p className="max-w-3xl text-body text-fg-body">{texto.detalhe}</p>
          )}

          {terceiraAcesa && (
            <p className="max-w-3xl text-body text-fg-body">
              {texto.apontamento} {FRASE_PRONTO}
            </p>
          )}

          {/* Aguardando: a frase, a mensagem e o registro -------------------- */}
          {texto.estado === 'aguardando' && (
            <>
              <p className="max-w-3xl text-body text-fg-body">{FRASE_AGUARDANDO}</p>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={mensagem.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Mandar a mensagem pelo WhatsApp"
                  title="WhatsApp"
                  className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                >
                  <Send className="size-4" aria-hidden />
                </a>
                <a
                  href={mensagem.email}
                  aria-label="Mandar a mensagem por e-mail"
                  title="E-mail"
                  className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                >
                  <Mail className="size-4" aria-hidden />
                </a>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onConferir}
                  disabled={conferindo || medindo}
                >
                  {conferindo ? (
                    <Spinner className="size-4" />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden />
                  )}
                  {conferindo ? ROTULO_CONFERINDO : ROTULO_CONFERIR}
                </Button>
              </div>

              {/* O registro: divisória, não caixa dentro de caixa. */}
              {registro && (
                <div className="border-t border-line pt-3">
                  <p className="text-label font-semibold text-fg-strong">
                    Registro para o cliente criar
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
              )}

              <details className="text-caption text-fg-body">
                <summary className="cursor-pointer text-label font-semibold text-fg-strong">
                  Não ficou ativo?
                </summary>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {SINTOMAS_NAO_FICOU_ATIVO.map((s) => (
                    <li key={s} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}

          {/* Trocar e remover: raros, por isso ficam embaixo --------------- */}
          {!removendo && (
            <div className="flex flex-wrap items-center gap-1 border-t border-line pt-3">
              {proprio && (
                <Button size="sm" variant="ghost" onClick={onTrocarSubdominio}>
                  <Pencil className="size-4" aria-hidden />
                  Trocar
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setRemovendo(true)}>
                <Trash2 className="size-4 text-danger" aria-hidden />
                Remover
              </Button>
            </div>
          )}

          {/* Remover, com o endereço digitado para confirmar ----------------- */}
          {removendo && (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <p className="flex items-start gap-2 text-caption text-fg-body">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  Vai parar de coletar {dominio.host}. Digite{' '}
                  <span className="font-mono text-fg-strong">{dominio.host}</span> para confirmar.
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
        </div>
      )}
    </LinhaDaLista>
  );
}

export default CartaoDeDominio;
