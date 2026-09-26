'use client';

/**
 * A aba Domínio de uma empresa (`/e/<slug>/dominio`, V8 do plano v7).
 *
 * Uma coisa só: o endereço próprio da tag dentro do site do cliente
 * (`m.loja.com.br`). A tag em si, os eventos extras, a chave pública e a lista
 * de sites permitidos ficam em Fontes (`TagDoSite`); daqui há um atalho para
 * lá.
 *
 * O "pronto" de cada cartão é MEDIDO: para cada site com subdomínio, a aba
 * pergunta a `GET /api/tag/gerar?dominio=<id>` e lê `enderecoProprioPronto`.
 * A rota é quem bate em `https://<sub>.<host>/api/health` (com cache); a tela
 * não chama rede nenhuma fora do console. Sem resposta, o cartão fica em
 * "aguardando", nunca em "pronto".
 *
 * C2: a aba é montada com `key={empresaId}` e cada PUT leva `empresaId` no
 * corpo e no header `X-Empresa-Id`, como o resto do console. Com outra aba
 * tendo trocado a empresa, o servidor responde 409 e nada é gravado.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Globe, Plus } from '@/components/ui/icones';

import { Button } from '@/components/ui/button';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import { Callout } from '@/components/common/primitives';
import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { BASE_FALLBACK } from '@/lib/endereco-da-tag';
import type { DominioTag } from '@/lib/tag-dominios';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import { CartaoDeDominio } from './CartaoDeDominio';
import { enderecoProprioDe } from './mensagens-dominio';
import {
  ModalAdicionarDominio,
  type ModoDoModal,
  type PedidoDeDominio,
} from './ModalAdicionarDominio';

export interface AbaDominioProps {
  /** Empresa da página (vem do endereço). Vai em cada PUT e em cada leitura. */
  empresaId: string;
  /** Slug da empresa, para os atalhos entre abas. */
  slug: string;
  /** Lista de sites como estava no disco quando a página foi montada. */
  dominios: DominioTag[];
  /** URL pública (túnel), vinda do servidor. */
  publicBaseUrl?: string;
}

/** O que o modal está fazendo, ou null quando fechado. */
type Modal = null | { tipo: 'novo' } | { tipo: 'trocar'; id: string };

/** A chave da medição: muda quando o subdomínio muda, e a medição antiga não vale mais. */
const chaveDaMedicao = (d: DominioTag) => `${d.id}|${enderecoProprioDe(d)}`;

/**
 * O endereço próprio de cada site já responde por este console? MEDIDO pela
 * rota `GET /api/tag/gerar?dominio=<id>` (campo `enderecoProprioPronto`), que
 * é quem bate em `https://<sub>.<host>/api/health`, com cache. A tela não
 * chama rede nenhuma fora do console.
 *
 * Devolve uma função: para um site, `true` (respondeu), `false` (não respondeu,
 * a medição falhou, ou o site não tem subdomínio) ou `undefined` (a resposta
 * ainda não voltou). Quem mostra trata `undefined` como "aguardando", nunca
 * como "pronto".
 *
 * A aba Domínio usa para o cartão; a `TagDoSite` (Fontes), para a linha "A tag
 * chama" dizer o endereço que a tag chama de fato.
 *
 * `empresaId`, quando vem, vai no header `X-Empresa-Id` (C2). Sem ele, `pedir`
 * põe a empresa ativa do store, como em toda leitura do console.
 */
export function useEnderecosProntos(
  dominios: DominioTag[],
  empresaId?: string
): (d: DominioTag) => boolean | undefined {
  const [prontos, setProntos] = useState<Record<string, boolean>>({});

  // Uma string, e não a lista: o efeito só roda de novo quando um subdomínio
  // entra, sai ou muda — não a cada gravação que devolve um objeto novo.
  const aMedir = dominios
    .filter((d) => enderecoProprioDe(d))
    .map(chaveDaMedicao)
    .join(',');

  useEffect(() => {
    if (!aMedir) return;
    let ativo = true;
    for (const chave of aMedir.split(',')) {
      const id = chave.slice(0, chave.indexOf('|'));
      pedir<{ enderecoProprioPronto?: boolean }>(
        `/api/tag/gerar?dominio=${encodeURIComponent(id)}`,
        { cache: 'no-store', headers: empresaId ? { 'X-Empresa-Id': empresaId } : undefined }
      )
        .then((d) => {
          if (ativo) setProntos((p) => ({ ...p, [chave]: d.enderecoProprioPronto === true }));
        })
        .catch((e: unknown) => {
          // Sessão expirada já redireciona dentro de `pedir`. Qualquer outro
          // erro é "não sei": o cartão fica em aguardando, nunca em pronto.
          if (!ativo || e instanceof SessaoExpirada) return;
          setProntos((p) => ({ ...p, [chave]: false }));
        });
    }
    return () => {
      ativo = false;
    };
  }, [aMedir, empresaId]);

  return (d) => (enderecoProprioDe(d) ? prontos[chaveDaMedicao(d)] : false);
}

export function AbaDominio({ empresaId, slug, dominios: iniciais, publicBaseUrl }: AbaDominioProps) {
  const [dominios, setDominios] = useState<DominioTag[]>(iniciais);
  const [modal, setModal] = useState<Modal>(null);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  // Cada abertura do modal ganha uma `key` nova: o estado dele nasce das props.
  const [aberturas, setAberturas] = useState(0);

  const base =
    publicBaseUrl?.replace(/\/+$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : BASE_FALLBACK);
  const ehLocal = base.includes('localhost') || base.includes('127.0.0.1');

  /* ---------------------------------------------------------------- */
  /* Medição do endereço próprio                                       */
  /* ---------------------------------------------------------------- */

  const prontoDe = useEnderecosProntos(dominios, empresaId);

  /* ---------------------------------------------------------------- */
  /* Rascunho (C2): com o modal aberto, outra aba não troca esta tela   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    useEmpresaStore.getState().marcarRascunho(modal !== null);
  }, [modal]);
  useEffect(() => () => useEmpresaStore.getState().marcarRascunho(false), []);

  /* ---------------------------------------------------------------- */
  /* Gravar                                                            */
  /* ---------------------------------------------------------------- */

  const copiar = async (texto: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      window.setTimeout(() => setCopiado(null), 2000);
      toast.success('Copiado.');
    } catch {
      toast.error('O navegador bloqueou a cópia.', {
        description: 'Selecione o texto e copie à mão.',
      });
    }
  };

  /**
   * Grava a lista inteira de sites e adota a resposta do servidor, que
   * preserva a chave da tag, os contadores e o último evento de cada site.
   */
  const salvar = async (lista: DominioTag[], sucesso: string): Promise<DominioTag[] | null> => {
    setSalvando(true);
    try {
      const d = await pedir<{ integracoes?: { tag?: { dominios?: DominioTag[] } } }>(
        '/api/integracoes',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Empresa-Id': empresaId },
          body: JSON.stringify({ tag: { dominios: lista }, empresaId }),
        }
      );
      const nova = d.integracoes?.tag?.dominios ?? lista;
      setDominios(nova);
      toast.success(sucesso);
      return nova;
    } catch (e) {
      if (e instanceof SessaoExpirada) return null;
      toast.error('Não foi possível salvar.', {
        description: e instanceof Error ? e.message : 'Erro desconhecido.',
      });
      return null;
    } finally {
      setSalvando(false);
    }
  };

  const trocando = modal?.tipo === 'trocar' ? dominios.find((d) => d.id === modal.id) : undefined;
  const modoDoModal: ModoDoModal | null =
    modal?.tipo === 'novo'
      ? { tipo: 'novo' }
      : trocando
        ? { tipo: 'trocar', dominio: trocando }
        : null;

  const salvarDoModal = async ({ host, subdominio }: PedidoDeDominio): Promise<DominioTag | null> => {
    const sub = subdominio.trim().toLowerCase() || undefined;
    if (trocando) {
      const lista = dominios.map((d) => (d.id === trocando.id ? { ...d, subdominio: sub } : d));
      const nova = await salvar(lista, sub ? 'Subdomínio salvo.' : 'Subdomínio retirado.');
      return nova?.find((d) => d.id === trocando.id) ?? null;
    }
    const novo: DominioTag = {
      id: crypto.randomUUID(),
      host,
      subdominio: sub,
      criadoEm: new Date().toISOString(),
      hits: 0,
    };
    const nova = await salvar([...dominios, novo], 'Site adicionado.');
    return nova?.find((d) => d.id === novo.id) ?? null;
  };

  const abrir = (m: NonNullable<Modal>) => {
    setAberturas((n) => n + 1);
    setModal(m);
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <p className="max-w-3xl text-body text-fg-body">
        Cada site do cliente pode ter um endereço próprio para a tag, como{' '}
        <span className="font-mono">m.loja.com.br</span>. Com ele, a tag é
        chamada pelo domínio do cliente. Sem ele, a tag usa o nosso endereço e
        coleta do mesmo jeito.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={() => abrir({ tipo: 'novo' })} disabled={salvando}>
          <Plus className="size-4" aria-hidden />
          Adicionar domínio
        </Button>
        <Link
          href={enderecoDaAba(slug, 'fontes')}
          className="inline-flex items-center gap-1.5 text-label text-tinta-texto underline-offset-4 hover:underline"
        >
          A tag do site e os sites permitidos ficam em Fontes
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {dominios.length === 0 ? (
        <EstadoVazio
          icone={Globe}
          titulo="Nenhum site cadastrado"
          motivo="Sem site na lista, o coletor recusa os eventos de qualquer site. Adicione o site do cliente; o endereço próprio é opcional."
          acao={
            <Button variant="outline" onClick={() => abrir({ tipo: 'novo' })}>
              <Plus className="size-4" aria-hidden />
              Adicionar domínio
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {dominios.map((d) => (
            <CartaoDeDominio
              key={d.id}
              dominio={d}
              base={base}
              slug={slug}
              pronto={prontoDe(d)}
              salvando={salvando}
              copiar={copiar}
              copiado={copiado}
              onTrocarSubdominio={() => abrir({ tipo: 'trocar', id: d.id })}
              onRemover={async () =>
                Boolean(
                  await salvar(
                    dominios.filter((x) => x.id !== d.id),
                    `${d.host} saiu da lista.`
                  )
                )
              }
            />
          ))}
        </ul>
      )}

      {ehLocal && (
        <Callout tone="warning" icon={AlertTriangle} title="Este console está em localhost">
          O registro e a mensagem para o cliente apontam para{' '}
          <code className="font-mono">{base}</code>, que só existe nesta
          máquina. Defina <code className="font-mono">PUBLIC_BASE_URL</code>{' '}
          com o endereço público antes de mandar qualquer coisa ao cliente.
        </Callout>
      )}

      {modoDoModal && (
        <ModalAdicionarDominio
          key={aberturas}
          modo={modoDoModal}
          dominios={dominios}
          base={base}
          salvando={salvando}
          onSalvar={salvarDoModal}
          copiar={copiar}
          copiado={copiado}
          aoFechar={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default AbaDominio;
