'use client';

/**
 * Um site do cliente na aba Domínio (V8 do plano v7; E2 do plano HyperFrames).
 *
 * O cartão diz só o que existe, num olhar: o host, uma pílula com o estado, um
 * miniestado ESTÁTICO de 3 bolinhas (Escolheu · Ativando · Pronto) e UM botão
 * primário por estado ("Escolher" / "Copiar mensagem" / "Copiar a tag").
 *
 * As linhas de `textoDoCartao` (`mensagens-dominio.ts`) continuam valendo: a
 * frase `detalhe` e as duas linhas de estado vão para o `aria-label` do
 * miniestado. "Pronto" (a pílula e a 3ª bolinha) só aparece quando a rota
 * `GET /api/tag/gerar` MEDIU que o endereço próprio responde por este console,
 * com certificado válido (`pronto === true`). Enquanto a medição não volta, ou
 * quando ela falha, o cartão diz "Aguardando ativação".
 *
 * Nada aqui consulta DNS nem fala com provedor de certificado: o console não
 * tem como saber se o registro existe, e por isso não há botão de conferir.
 * O miniestado não anima: a lista repete o cartão, e a aba tem uma cena só.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  Copy,
  Lock,
  Mail,
  Pencil,
  Send,
  Trash2,
} from '@/components/ui/icones';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { receitaBloco, receitaCartao } from '@/components/common/primitives';
import { IconeDoAssunto } from '@/components/cenas';
import consoleStyles from '@/components/layout/console.module.css';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { registroDnsDe, type DominioTag } from '@/lib/tag-dominios';
import { cn } from '@/lib/utils';
import {
  enderecoProprioDe,
  FRASE_AGUARDANDO,
  FRASE_PRONTO,
  mensagemParaCliente,
  ROTULO_DO_ESTADO,
  SINTOMAS_NAO_FICOU_ATIVO,
  textoDoCartao,
  type EstadoDoDominio,
} from './mensagens-dominio';

/** A cor da pílula: verde só quando medido; âmbar esperando; neutro sem subdomínio. */
const PILULA: Record<EstadoDoDominio, 'sucesso' | 'aviso' | 'neutro'> = {
  pronto: 'sucesso',
  aguardando: 'aviso',
  'sem-subdominio': 'neutro',
};

/** Bolinha do miniestado: apagada, âmbar ou verde. */
type Bolinha = 'apagada' | 'aviso' | 'ok';

const COR_DA_BOLINHA: Record<Bolinha, string> = {
  apagada: 'border-line-control bg-transparent',
  aviso: 'border-warning bg-warning',
  ok: 'border-success bg-success',
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
  const proprio = enderecoProprioDe(dominio);
  const registro = registroDnsDe(dominio, base);
  const mensagem = mensagemParaCliente(dominio, base);
  const chaveCopia = `mensagem-${dominio.id}`;
  const medindo = pronto === undefined && texto.estado !== 'sem-subdominio';
  const confirmado = confirmacao.trim().toLowerCase() === dominio.host;

  // O miniestado. A 3ª bolinha acende SÓ com a medição (`pronto === true`).
  const terceiraAcesa = pronto === true && texto.estado === 'pronto';
  const bolinhas: [Bolinha, Bolinha, Bolinha] = [
    texto.estado === 'sem-subdominio' ? 'apagada' : 'ok',
    texto.estado === 'aguardando' ? 'aviso' : terceiraAcesa ? 'ok' : 'apagada',
    terceiraAcesa ? 'ok' : 'apagada',
  ];
  const resumo = [texto.apontamento, texto.certificado, texto.detalhe].join(' ');

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
      {/* Cabeçalho: o site, o estado e os botões secundários ------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="wrap-token font-mono text-title font-semibold text-fg-strong">
            {dominio.host}
          </p>
          {proprio && (
            <p className="wrap-token font-mono text-caption text-fg-muted">{proprio}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={PILULA[texto.estado]}>{ROTULO_DO_ESTADO[texto.estado]}</Badge>
            {/* Escolheu · Ativando · Pronto, parado. */}
            <span role="img" aria-label={resumo} className="flex w-24 items-center">
              {bolinhas.map((b, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <span
                      className={cn(
                        'h-0 flex-1 border-t-2',
                        bolinhas[i] === 'apagada'
                          ? 'border-dashed border-line-control'
                          : bolinhas[i] === 'aviso'
                            ? 'border-warning'
                            : 'border-success'
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-full border-2',
                      COR_DA_BOLINHA[b]
                    )}
                  >
                    {i === 2 && terceiraAcesa && (
                      <Lock className="size-2 text-surface-1" aria-hidden />
                    )}
                  </span>
                </React.Fragment>
              ))}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {proprio && (
            <Button size="sm" variant="ghost" onClick={onTrocarSubdominio}>
              <Pencil className="size-3.5" aria-hidden />
              Trocar
            </Button>
          )}
          {!removendo && (
            <Button size="sm" variant="ghost" onClick={() => setRemovendo(true)}>
              <Trash2 className="size-3.5 text-danger" aria-hidden />
              Remover
            </Button>
          )}
        </div>
      </div>

      {medindo && (
        <p className="mt-2 text-caption text-fg-muted">Conferindo se {proprio} já responde…</p>
      )}

      {/* Sem subdomínio: o primário é escolher --------------------------- */}
      {texto.estado === 'sem-subdominio' && (
        <Button size="sm" className="mt-3" onClick={onTrocarSubdominio}>
          <Pencil className="size-3.5" aria-hidden />
          Escolher
        </Button>
      )}

      {/* Pronto: a tag nova está em Instalação --------------------------- */}
      {terceiraAcesa && (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-body text-fg-body">
            {texto.apontamento} {FRASE_PRONTO}
          </p>
          <Link href={enderecoDaAba(slug, 'fontes')} className={buttonVariants({ size: 'sm' })}>
            <Copy className="size-3.5" aria-hidden />
            Copiar a tag
          </Link>
        </div>
      )}

      {/* Aguardando: a frase, a mensagem e o registro -------------------- */}
      {texto.estado === 'aguardando' && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="max-w-3xl text-body text-fg-body">{FRASE_AGUARDANDO}</p>

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

          {/* O registro: divisória, não caixa dentro de caixa. */}
          {registro && (
            <div className="border-t border-line pt-3">
              <p className="flex items-center gap-2 text-label font-semibold text-fg-strong">
                <IconeDoAssunto assunto="dominio" />
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
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  <span>{s}</span>
                </li>
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
    </li>
  );
}

export default CartaoDeDominio;
