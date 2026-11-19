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
import { ListaEmLinhas } from '@/components/common/ListaEmLinhas';
import { Recolhido } from '@/components/common/Recolhido';
import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { BASE_FALLBACK } from '@/lib/endereco-da-tag';
import type { DominioTag } from '@/lib/tag-dominios';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import { CartaoDeDominio } from './CartaoDeDominio';
import { CenaDoDominio, estadoDaCena } from './CenaDoDominio';
import {
  avisoDaConferencia,
  enderecoProprioDe,
  type ResultadoDaConferencia,
} from './mensagens-dominio';
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

/** O que "Conferir de novo" devolve; 'ignorado' = sem subdomínio ou sessão expirada. */
export type RespostaDaConferencia = ResultadoDaConferencia | 'ignorado';

/**
 * Pergunta à rota se o endereço próprio de UM site já responde. A leitura ao
 * abrir a aba e o botão "Conferir de novo" passam por aqui. `conferirAgora`
 * acrescenta `&conferir=1`: a rota mede de novo em vez de devolver o que
 * guardou há até 60 s.
 */
async function medirEndereco(
  id: string,
  empresaId: string | undefined,
  conferirAgora: boolean
): Promise<boolean> {
  const d = await pedir<{ enderecoProprioPronto?: boolean }>(
    `/api/tag/gerar?dominio=${encodeURIComponent(id)}${conferirAgora ? '&conferir=1' : ''}`,
    { cache: 'no-store', headers: empresaId ? { 'X-Empresa-Id': empresaId } : undefined }
  );
  return d.enderecoProprioPronto === true;
}

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
  return useConferenciaDosEnderecos(dominios, empresaId).prontoDe;
}

/**
 * A medição de cada site e o botão "Conferir de novo".
 *
 * `prontoDe` é o mesmo de `useEnderecosProntos`. `conferir(d)` mede UM site de
 * novo, sem recarregar a página, e devolve o que deu. `conferindo(d)` é `true`
 * enquanto a resposta não volta.
 */
export function useConferenciaDosEnderecos(
  dominios: DominioTag[],
  empresaId?: string
): {
  prontoDe: (d: DominioTag) => boolean | undefined;
  conferir: (d: DominioTag) => Promise<RespostaDaConferencia>;
  conferindo: (d: DominioTag) => boolean;
} {
  const [prontos, setProntos] = useState<Record<string, boolean>>({});
  const [emConferencia, setEmConferencia] = useState<Record<string, boolean>>({});

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
      medirEndereco(id, empresaId, false)
        .then((pronto) => {
          if (ativo) setProntos((p) => ({ ...p, [chave]: pronto }));
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

  const conferir = async (d: DominioTag): Promise<RespostaDaConferencia> => {
    if (!enderecoProprioDe(d)) return 'ignorado';
    const chave = chaveDaMedicao(d);
    setEmConferencia((c) => ({ ...c, [chave]: true }));
    try {
      const pronto = await medirEndereco(d.id, empresaId, true);
      setProntos((p) => ({ ...p, [chave]: pronto }));
      return pronto ? 'pronto' : 'aguardando';
    } catch (e) {
      // Falhou a conferência: o cartão fica como estava. Quem chama avisa.
      if (e instanceof SessaoExpirada) return 'ignorado';
      return 'falhou';
    } finally {
      setEmConferencia((c) => ({ ...c, [chave]: false }));
    }
  };

  return {
    prontoDe: (d) => (enderecoProprioDe(d) ? prontos[chaveDaMedicao(d)] : false),
    conferir,
    conferindo: (d) => emConferencia[chaveDaMedicao(d)] === true,
  };
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

  const { prontoDe, conferir, conferindo } = useConferenciaDosEnderecos(dominios, empresaId);

  /** O botão "Conferir de novo" do cartão: mede de novo e diz o que deu. */
  const conferirSite = async (d: DominioTag) => {
    const resultado = await conferir(d);
    if (resultado === 'ignorado') return;
    const aviso = avisoDaConferencia(resultado, enderecoProprioDe(d));
    const opcoes = { description: aviso.proximoPasso };
    if (resultado === 'pronto') toast.success(aviso.titulo, opcoes);
    else if (resultado === 'aguardando') toast.info(aviso.titulo, opcoes);
    else toast.error(aviso.titulo, opcoes);
  };

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
    <div className="flex min-w-0 flex-col gap-4">
      {/* A ação de topo: a única em amarelo da tela. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-body text-fg-body">Opcional: sem endereço próprio a tag usa o nosso.</p>
          <Link
            href={enderecoDaAba(slug, 'fontes')}
            className="inline-flex items-center gap-1.5 text-label text-fg-strong underline underline-offset-4"
          >
            Tag e sites permitidos: Instalação
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <Button onClick={() => abrir({ tipo: 'novo' })} disabled={salvando}>
          <Plus className="size-4" aria-hidden />
          Adicionar domínio
        </Button>
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
        <ListaEmLinhas rotulo="Sites do cliente">
          {dominios.map((d) => (
            <CartaoDeDominio
              key={d.id}
              dominio={d}
              base={base}
              slug={slug}
              pronto={prontoDe(d)}
              conferindo={conferindo(d)}
              onConferir={() => void conferirSite(d)}
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
        </ListaEmLinhas>
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

      {/* A cena ilustrada sai de cima do trabalho: fica recolhida, no fim. */}
      <Recolhido titulo="Como funciona">{cena}</Recolhido>

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
