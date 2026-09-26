'use client';

/**
 * Aba "Tag do site" — sites permitidos e tags prontas.
 *
 * V8 do plano v7: o domínio próprio do cliente (subdomínio, registro de DNS e
 * a mensagem para o cliente) saiu daqui e mora na aba Domínio
 * (`components/dominio/`). Esta tela ficou com o que se faz todo dia: copiar a
 * tag e cuidar da lista de sites que o coletor aceita.
 *
 * O webhook da plataforma de vendas não manda PageView nenhum. Sem esta tag a
 * Meta não vê visita alguma no site e o algoritmo otimiza sem sinal de topo; pior,
 * ninguém captura fbc/fbp na página de vendas e o Purchase que chega horas
 * depois, pelo PIX, é um evento sem dono — dinheiro de tráfego gasto sem
 * atribuição. Esta tela é o lugar onde isso se liga.
 *
 * O gerador de código NÃO é importado aqui: as tags vêm prontas de
 * /api/tag/gerar, para o bundle do navegador não carregar o núcleo do coletor.
 */

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Globe,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from '@/components/ui/icones';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import { Callout, Field, Panel, ParamChip, StatusDot } from '@/components/common/primitives';
import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { slugDoEndereco } from '@/lib/empresa-do-endereco';
import {
  erroDoDominio,
  hostDaTag,
  normalizarDominio,
  type ConfigTag,
  type DominioTag,
} from '@/lib/tag-dominios';
import { useEnderecosProntos } from '@/components/dominio/AbaDominio';
import { enderecoProprioDe } from '@/components/dominio/mensagens-dominio';
import { OndeInstalarTag } from '@/components/instalacao/OndeInstalarTag';
import { EventosExtras } from '@/components/instalacao/EventosExtras';
import type { TagGerada } from '@/components/instalacao/tag-estado';
import type { RegraRoteamento } from '@/lib/config-store';

/** Assinatura vazia: só serve para `useSyncExternalStore` distinguir servidor
 *  de navegador sem precisar de um efeito que dispara re-render. */
const assinarNada = () => () => {};

export interface TagDoSitePropriedades {
  /** Bloco `tag` da configuração: chave pública e domínios autorizados. */
  tag: ConfigTag;
  /** Regras de roteamento, para dizer o destino real de cada evento da tag. */
  regras: RegraRoteamento[];
  /** URL pública deste console, já sem a barra final. */
  base: string;
  /** true quando a base é localhost — a tag não funciona fora desta máquina. */
  ehLocal: boolean;
  /** Grava a lista nova. Devolve false quando o servidor recusou. */
  onSalvarDominios: (dominios: DominioTag[]) => Promise<boolean>;
  /** Gira a chave pública. Devolve false quando o servidor recusou. */
  onTrocarChave: () => Promise<boolean>;
  /** true enquanto um PUT de integrações está em voo. */
  salvando: boolean;
  /**
   * Bloco do webhook da plataforma de vendas — Tarefa 6 do plano v5 (§6.2).
   *
   * A tela de Instalação tinha duas seções lado a lado (Webhook, depois Tag);
   * a nova ordem funde as duas num fluxo só, com a tag primeiro (é o que falta
   * instalar) e o webhook por último (já costuma estar pronto). Este slot é
   * onde `InstalacaoPage` encaixa o card de webhook, entre os sites permitidos
   * e a chave pública da tag — a mesma posição em que `antesDasTags` costumava
   * aparecer, só que depois das tags, não antes.
   */
  blocoWebhood: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

/** dd/mm/aaaa a partir do ISO, sem fuso — o mesmo texto no servidor e aqui. */
function dataCurta(iso?: string): string {
  const s = String(iso ?? '').slice(0, 10);
  const partes = s.split('-');
  if (partes.length !== 3) return '—';
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

export function TagDoSite({
  tag,
  regras,
  base,
  ehLocal,
  onSalvarDominios,
  onTrocarChave,
  salvando,
  blocoWebhood,
}: TagDoSitePropriedades) {
  const dominios = tag.dominios;

  const [dominioNovo, setDominioNovo] = useState('');
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [confirmandoChave, setConfirmandoChave] = useState(false);
  const [trocandoChave, setTrocandoChave] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string>('');
  const [tags, setTags] = useState<TagGerada[]>([]);
  const [erroTags, setErroTags] = useState<string | null>(null);
  // Qual combinação de domínio + chave já está na tela. Guardar a marca em vez
  // de um booleano de "carregando" impede o pior erro desta aba: mostrar a tag
  // do domínio anterior, que o operador copiaria e mandaria ao cliente errado.
  const [marcaCarregada, setMarcaCarregada] = useState('');
  // O tempo relativo só existe depois da hidratação: o servidor e o navegador
  // renderizariam minutos diferentes e o React reclamaria da diferença.
  const montado = useSyncExternalStore(assinarNada, () => true, () => false);
  // V8: o link "O domínio próprio fica na aba Domínio" precisa do slug da
  // empresa, e ele está no endereço (`/e/<slug>/fontes`).
  const slug = slugDoEndereco(usePathname() ?? '');
  // V8: a tag de um site com subdomínio só chama o endereço dele depois que a
  // rota MEDIU que ele responde (`enderecoProprioPronto`). A linha "A tag
  // chama" de cada site lê a mesma medição, para dizer o endereço de verdade.
  const prontoDe = useEnderecosProntos(dominios);

  // O domínio escolhido some quando o operador o remove; aí a tela volta para
  // o primeiro em vez de ficar pedindo tags de um id que não existe mais.
  const alvo = dominios.find((d) => d.id === selecionado) ?? dominios[0];
  const alvoId = alvo?.id ?? '';
  // A chave entra na marca porque girá-la muda o texto de TODAS as tags: sem
  // isso a tela continuaria exibindo um código que o coletor já recusa.
  const marca = `${alvoId}|${tag.chave}`;

  useEffect(() => {
    if (!alvoId) return;
    let ativo = true;
    pedir<{ tags: TagGerada[] }>(
      `/api/tag/gerar?dominio=${encodeURIComponent(alvoId)}`,
      { cache: 'no-store' }
    )
      .then((d) => {
        if (!ativo) return;
        setTags(d.tags ?? []);
        setErroTags(null);
        setMarcaCarregada(marca);
      })
      .catch((e: unknown) => {
        // Sessão expirada já redireciona para o login dentro de `pedir`;
        // pintar erro aqui só piscaria uma mensagem durante a saída da página.
        if (!ativo || e instanceof SessaoExpirada) return;
        setTags([]);
        setErroTags(
          e instanceof Error ? e.message : 'Não foi possível gerar as tags.'
        );
        setMarcaCarregada(marca);
      });
    return () => {
      ativo = false;
    };
  }, [alvoId, marca]);

  const tagsNoAr = marcaCarregada === marca ? tags : [];
  const carregandoTags = Boolean(alvoId) && marcaCarregada !== marca;

  const copiar = async (texto: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      window.setTimeout(() => setCopiado(null), 2000);
      toast.success('Copiado.');
    } catch {
      // Área de transferência bloqueada (permissão negada, página em http).
      // Não há o que consertar: o texto continua visível e selecionável no
      // campo ao lado, então só resta avisar para não parecer que copiou.
      toast.error('O navegador bloqueou a cópia.', {
        description: 'Selecione o texto do campo e copie à mão.',
      });
    }
  };

  /* ---------------------------------------------------------------- */
  /* Domínios                                                          */
  /* ---------------------------------------------------------------- */

  const hostLimpo = normalizarDominio(dominioNovo);
  const erroHost = dominioNovo.trim() ? erroDoDominio(hostLimpo) : null;
  const repetido = Boolean(hostLimpo) && dominios.some((d) => d.host === hostLimpo);
  const erroHostFinal = erroHost ?? (repetido ? 'Este domínio já está cadastrado.' : null);
  /**
   * A acao que resolve os dois estados vazios desta tela (C-11): o campo de
   * cadastro ja existe logo abaixo, mas fica fora da vista em tela pequena.
   * Rolar + focar e mais honesto do que a frase "cadastre um dominio acima",
   * que manda o leitor procurar sozinho.
   */
  const focarCampoDeDominio = () => {
    const campo = document.getElementById('tag-dominio-novo');
    campo?.scrollIntoView({ block: 'center' });
    (campo as HTMLInputElement | null)?.focus();
  };

  const podeAdicionar = Boolean(hostLimpo) && !erroHostFinal && !salvando;

  // V8: o site entra aqui sem subdomínio. O endereço próprio (subdomínio,
  // registro de DNS e mensagem para o cliente) se escolhe na aba Domínio.
  const adicionar = async () => {
    if (!podeAdicionar) return;
    const novo: DominioTag = {
      id: crypto.randomUUID(),
      host: hostLimpo,
      criadoEm: new Date().toISOString(),
      hits: 0,
    };
    const ok = await onSalvarDominios([...dominios, novo]);
    if (!ok) return;
    setDominioNovo('');
    setSelecionado(novo.id);
  };

  const remover = async (d: DominioTag) => {
    const ok = await onSalvarDominios(dominios.filter((x) => x.id !== d.id));
    if (!ok) return;
    setRemovendoId(null);
    if (selecionado === d.id) setSelecionado('');
  };

  const trocarChave = async () => {
    setTrocandoChave(true);
    try {
      const ok = await onTrocarChave();
      if (ok) setConfirmandoChave(false);
    } finally {
      setTrocandoChave(false);
    }
  };

  /**
   * Pré-requisito da tag (Tarefa 6, §6.2 item 2): o site autorizado na lista.
   *
   * V8: o subdomínio deixou de ser pré-requisito. A tag de um site com
   * subdomínio chama o NOSSO endereço até o endereço próprio responder (a rota
   * mede), então copiar e instalar a tag nunca espera o DNS do cliente.
   * "Recebendo eventos" só aparece quando algum site já contou um evento: o
   * coletor conta pelo Origin do site (`tag-handler.ts`).
   */
  const siteNaLista = dominios.length > 0;
  const algumRecebendo = dominios.some((d) => (d.hits ?? 0) > 0);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* 1 — por que esta tag existe -------------------------------- */}
      <p className="max-w-3xl text-body text-fg-body">
        O webhook da plataforma não manda <ParamChip>PageView</ParamChip>{' '}
        nenhum, então a Meta não vê visita alguma no site e o algoritmo otimiza
        sem sinal de topo. A tag do navegador cobre esse buraco e ainda captura,
        na hora da visita, os cookies <ParamChip>fbc</ParamChip> e{' '}
        <ParamChip>fbp</ParamChip> e a atribuição que a venda por PIX perde — o
        comprador paga no aplicativo do banco e nunca mais volta ao navegador.
      </p>

      {/* 2 — pré-requisito: o site na lista ---------------------------- */}
      {siteNaLista ? (
        <StatusDot tone="success" icon={Globe}>
          {algumRecebendo
            ? 'Pré-requisito atendido — site permitido e já recebendo eventos.'
            : 'Pré-requisito atendido — site permitido. Nenhum evento chegou ainda.'}
        </StatusDot>
      ) : (
        <Callout
          tone="warning"
          icon={AlertTriangle}
          title="Antes de gerar a tag, cadastre o site do cliente."
          className="rounded-r-lg bg-warning/8 py-3 pr-3"
        >
          Cadastre o domínio do site do cliente em Sites permitidos, logo
          abaixo — sem isso o coletor recusa os eventos.
        </Callout>
      )}

      {/* 3 — gerar a tag ---------------------------------------------- */}
      <div className="flex flex-col gap-3">
        {dominios.length > 1 && (
          <div
            className="flex max-w-full flex-wrap gap-1 overflow-x-auto rounded-control border border-line-control bg-surface-2 p-1"
            role="group"
            aria-label="Domínio das tags mostradas"
          >
            {dominios.map((d) => {
              const ativo = d.id === alvoId;
              return (
                <Button
                  key={d.id}
                  size="sm"
                  variant={ativo ? 'secondary' : 'ghost'}
                  aria-pressed={ativo}
                  onClick={() => setSelecionado(d.id)}
                  className="font-mono"
                >
                  {ativo && <Check className="size-3.5" aria-hidden />}
                  {d.host}
                </Button>
              );
            })}
          </div>
        )}

        {erroTags && (
          <Callout tone="danger" icon={AlertTriangle} title="As tags não foram geradas">
            {erroTags}
          </Callout>
        )}

        {carregandoTags && !erroTags && (
          <p className="text-body text-fg-body">Gerando as tags…</p>
        )}

        <OndeInstalarTag
          tags={tagsNoAr}
          regras={regras}
          temDominio={dominios.length > 0}
          copiar={copiar}
          copiado={copiado}
        />
      </div>

      {/* 4 — eventos extras (opcional) --------------------------------- */}
      <EventosExtras
        tags={tagsNoAr}
        regras={regras}
        copiar={copiar}
        copiado={copiado}
      />

      {/* 5 — domínios ---------------------------------------------- */}
      <Panel title="Sites permitidos" icon={Globe}>
        <p className="text-caption text-fg-muted">
          A lista abaixo é a única tranca do endereço público: o coletor só
          aceita evento cujo <ParamChip>Origin</ParamChip> esteja aqui. Site
          fora da lista é recusado, e site nenhum na lista significa nenhuma
          coleta.
        </p>

        {dominios.length === 0 ? (
          <EstadoVazio
            className="mt-3"
            icone={Globe}
            titulo="Nenhum domínio cadastrado"
            motivo="Com a lista vazia o coletor recusa tudo: nenhum site pode mandar evento. Cadastre o domínio do cliente para o console gerar as tags."
            acao={
              <Button variant="outline" onClick={focarCampoDeDominio}>
                <Plus className="size-4" aria-hidden />
                Cadastrar domínio
              </Button>
            }
          />
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {dominios.map((d) => {
              const relativo =
                montado && d.ultimoHit
                  ? formatDistanceToNow(new Date(d.ultimoHit), {
                      addSuffix: true,
                      locale: ptBR,
                    })
                  : null;
              const instalado = Boolean(d.ultimoHit);
              // V8: com subdomínio, a tag só chama o endereço do cliente depois
              // de medido (`true`); `false` = ainda no nosso endereço;
              // `undefined` = a medição não voltou.
              const proprio = enderecoProprioDe(d);
              const medida = proprio ? prontoDe(d) : false;
              return (
                <li
                  key={d.id}
                  // FASE 3a: a lista mora dentro de um `Panel` (`surface-1`).
                  // Item em `surface-1` dentro dele = degrau zero; `surface-2`
                  // põe os 0.053 de L que o G3′ exige e dispensa a borda.
                  className="rounded-panel bg-surface-2 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="wrap-token font-mono text-label font-semibold text-fg-strong">
                        {d.host}
                      </p>
                      {proprio && medida !== true ? (
                        // V8: subdomínio cadastrado, endereço dele ainda não
                        // medido como pronto — a tag chama o NOSSO endereço
                        // (`endpointDoDominio` na rota) e continua coletando.
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-label text-fg-body">
                          <span>A tag chama:</span>
                          {medida === undefined ? (
                            <span>conferindo se {proprio} já responde…</span>
                          ) : (
                            <>
                              <ParamChip>{hostDaTag({ ...d, subdominio: undefined }, base)}</ParamChip>
                              <span>
                                nosso endereço, até o endereço próprio{' '}
                                <span className="wrap-token font-mono">{proprio}</span> ficar
                                pronto. A tag continua coletando; o andamento fica na aba
                                Domínio.
                              </span>
                            </>
                          )}
                        </p>
                      ) : (
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-label text-fg-body">
                          <span>A tag chama:</span>
                          <ParamChip>{hostDaTag(d, base)}</ParamChip>
                          <span>
                            {d.subdominio
                              ? 'subdomínio do cliente — a tag é chamada pelo domínio dele. O cookie de primeira parte gravado pelo servidor ainda depende do certificado, que está em preparação.'
                              : 'nosso endereço — funciona, mas ainda como terceiro.'}
                          </span>
                        </p>
                      )}
                    </div>

                    {removendoId === d.id ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="text-caption text-warning">
                          A coleta deste site para na hora.
                        </span>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={salvando}
                          onClick={() => remover(d)}
                        >
                          Confirmar remoção
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRemovendoId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRemovendoId(d.id)}
                      >
                        <Trash2 className="size-3.5 text-danger" aria-hidden />
                        Remover
                      </Button>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3">
                    <StatusDot tone={instalado ? 'success' : 'warning'}>
                      {instalado
                        ? `Último hit ${relativo ?? `em ${dataCurta(d.ultimoHit)}`}`
                        : 'Nunca recebeu nada'}
                    </StatusDot>
                    <span className="text-label text-fg-body tabular">
                      {d.hits} evento{d.hits === 1 ? '' : 's'} recebido
                      {d.hits === 1 ? '' : 's'}
                    </span>
                    <span className="text-label text-fg-body">
                      Cadastrado em {dataCurta(d.criadoEm)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Sem contorno: este bloco é uma SUPERFÍCIE dentro do cartão, e no v4
            superfície se separa por luz (surface-2 sobre surface-1, ΔL 0,053),
            não por linha. Borda é vocabulário de controle — do campo, do botão,
            do que se clica —, e a linha aqui competia com as bordas dos próprios
            inputs que o bloco contém. */}
        <div className="mt-4 flex flex-col gap-4 rounded-panel bg-surface-2 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="tag-dominio-novo"
              label="Domínio do site"
              helper="Pode colar a URL inteira: o console guarda só o host, sem www e sem barra."
              error={erroHostFinal ?? undefined}
            >
              <Input
                id="tag-dominio-novo"
                value={dominioNovo}
                placeholder="codigovencedor.com.br"
                onChange={(e) => setDominioNovo(e.target.value)}
                onBlur={() => setDominioNovo(normalizarDominio(dominioNovo))}
                className="wrap-token font-mono"
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button onClick={adicionar} disabled={!podeAdicionar}>
              <Plus className="size-4" aria-hidden />
              {salvando ? 'Salvando…' : 'Cadastrar domínio'}
            </Button>
          </div>
        </div>

        {/* V8: o subdomínio, o registro de DNS e a mensagem para o cliente
            saíram daqui. No lugar, uma linha só, com o caminho. */}
        <p className="mt-3 text-caption text-fg-muted">
          O domínio próprio fica na aba Domínio: lá se escolhe o endereço da
          tag dentro do site do cliente (como m.loja.com.br) e se copia a
          mensagem com o registro de DNS.{' '}
          {slug && (
            <Link
              href={enderecoDaAba(slug, 'dominio')}
              className="inline-flex items-center gap-1 text-label text-tinta-texto underline-offset-4 hover:underline"
            >
              Abrir a aba Domínio
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </p>
      </Panel>

      {/* 6 — webhook da plataforma de vendas ------------------------- */}
      {blocoWebhood}

      {/* 7 — chave pública ------------------------------------------ */}
      <Panel title="Chave pública da tag" icon={KeyRound}>
        <Callout
          tone="warning"
          icon={ShieldAlert}
          title="Esta chave é pública de propósito"
        >
          Ela viaja dentro do HTML do cliente e qualquer visitante consegue lê-la
          no código-fonte. Ela <strong>não é</strong> o segredo do webhook: o
          segredo autentica a venda e nunca sai do servidor. Se os dois se
          encostarem, qualquer pessoa forja um <ParamChip>Purchase</ParamChip> e
          a Meta passa a aprender com venda que não existiu.
        </Callout>

        <Field
          id="tag-chave"
          label="Chave da tag"
          helper="Ela só serve para o coletor saber de qual conta é o evento. Não abre nada e não autoriza evento de dinheiro."
          className="mt-3"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copiar(tag.chave, 'chave')}
            >
              {copiado === 'chave' ? (
                <Check className="size-3.5 text-success" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              Copiar
            </Button>
          }
        >
          <Input
            id="tag-chave"
            readOnly
            value={tag.chave}
            className="wrap-token font-mono"
          />
        </Field>

        <div className="mt-3">
          {confirmandoChave ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-warning">
                Toda tag já instalada para de enviar até o cliente colar o código
                novo. Nenhuma venda se perde — o webhook não usa esta chave.
              </span>
              <Button
                size="sm"
                variant="destructive"
                disabled={trocandoChave}
                onClick={trocarChave}
              >
                {trocandoChave ? 'Gerando…' : 'Confirmar nova chave'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmandoChave(false)}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmandoChave(true)}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Gerar nova chave
            </Button>
          )}
        </div>
      </Panel>

      {/* 8 — aviso de localhost ------------------------------------- */}
      {ehLocal && (
        <Callout
          tone="warning"
          icon={AlertTriangle}
          title="As tags geradas apontam para localhost"
        >
          Este console está em <code className="font-mono">{base}</code>, que só
          existe nesta máquina. Uma tag copiada agora e instalada no site do
          cliente não vai coletar nada. Publique o console num endereço público
          (ou abra o túnel) e defina{' '}
          <code className="font-mono">PUBLIC_BASE_URL</code> antes de mandar
          qualquer código ao cliente.
        </Callout>
      )}
    </div>
  );
}

export default TagDoSite;
