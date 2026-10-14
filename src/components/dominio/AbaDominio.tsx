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
import { IconeDoAssunto } from '@/components/cenas';
import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { BASE_FALLBACK } from '@/lib/endereco-da-tag';
import type { DominioTag } from '@/lib/tag-dominios';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import { CartaoDeDominio } from './CartaoDeDominio';
import { CenaDoDominio, estadoDaCena } from './CenaDoDominio';
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
  // O `<details>` "Como funciona" (só no pronto): a cena só monta aberta.
  const [comoAberto, setComoAberto] = useState(false);

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

  // A cena mostra o estado REAL: o 1º site que espera, ou o 1º com subdomínio.
  const estadoCena = estadoDaCena(dominios, prontoDe);
  const comSub = dominios.filter((d) => enderecoProprioDe(d));
  const hostDaCena =
    (estadoCena === 'esperando'
      ? comSub.find((d) => prontoDe(d) !== true)
      : (comSub[0] ?? dominios[0])
    )?.host ?? '';
  const cena = <CenaDoDominio estado={estadoCena} host={hostDaCena} />;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="grid min-w-0 items-center gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Pronto em todos: a cena recolhe e só monta quando é aberta. */}
        {estadoCena === 'ok' ? (
          <details
            className="min-w-0"
            onToggle={(e) => setComoAberto((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="inline-flex cursor-pointer items-center gap-2 text-label font-semibold text-fg-strong">
              <IconeDoAssunto assunto="dominio" icone={Globe} />
              Como funciona
            </summary>
            {comoAberto && <div className="mt-3">{cena}</div>}
          </details>
        ) : (
          <div className="min-w-0">{cena}</div>
        )}

        <div className="flex min-w-0 flex-col items-start gap-3">
          <Button onClick={() => abrir({ tipo: 'novo' })} disabled={salvando}>
            <Plus className="size-4" aria-hidden />
            Adicionar domínio
          </Button>
          <p className="text-body text-fg-body">Opcional: sem endereço próprio a tag usa o nosso.</p>
          <Link
            href={enderecoDaAba(slug, 'fontes')}
            className="inline-flex items-center gap-1.5 text-label text-fg-strong underline underline-offset-4"
          >
            Tag e sites permitidos: Instalação
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      {dominios.length === 0 ? (
        <EstadoVazio
          icone={Globe}
          titulo="Nenhum site ainda"
          motivo="Sem site na lista, nada é coletado. Adicione o do cliente."
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
        <div title={`O registro e a mensagem apontam para ${base}. Defina PUBLIC_BASE_URL antes de mandar ao cliente.`}>
          <Callout
            tone="warning"
            icon={AlertTriangle}
            title="Console em localhost: o endereço público não está configurado."
          />
        </div>
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
