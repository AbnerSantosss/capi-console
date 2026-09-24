'use client';

/**
 * Aba "Tag do site" — cadastro de domínios, DNS do cliente e tags prontas.
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
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  Check,
  Copy,
  Globe,
  KeyRound,
  Network,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from '@/components/ui/icones';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import { Callout, Field, Panel, ParamChip, StatusDot } from '@/components/common/primitives';
import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import {
  erroDoDominio,
  hostDaTag,
  normalizarDominio,
  registroDnsDe,
  textoDnsParaCliente,
  type ConfigTag,
  type DominioTag,
} from '@/lib/tag-dominios';
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
   * onde `InstalacaoPage` encaixa o card de webhook, entre o DNS e a chave
   * pública da tag — a mesma posição em que `antesDasTags` costumava aparecer,
   * só que depois das tags, não antes.
   */
  blocoWebhood: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/* Validação do subdomínio                                             */
/* ------------------------------------------------------------------ */

/**
 * Erro legível do rótulo de subdomínio, ou null quando serve (vazio serve: o
 * subdomínio é opcional).
 *
 * Um rótulo torto vira um CNAME que o cliente cria no painel dele e que nunca
 * resolve. O prejuízo não aparece aqui: aparece como uma semana de campanha
 * rodando com a tag apontando para um endereço que não existe.
 */
function erroDoSubdominio(v: string): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.length > 63) return 'Máximo de 63 caracteres.';
  if (s.includes('.')) return 'Escreva só o rótulo, sem ponto — por exemplo tk.';
  if (!/^[a-z0-9-]+$/.test(s)) return 'Só minúsculas, dígitos e hífen.';
  if (s.startsWith('-') || s.endsWith('-')) {
    return 'Não pode começar nem terminar com hífen.';
  }
  return null;
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
  const [subdominioNovo, setSubdominioNovo] = useState('');
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
  const subLimpo = subdominioNovo.trim().toLowerCase();
  const erroHost = dominioNovo.trim() ? erroDoDominio(hostLimpo) : null;
  const erroSub = erroDoSubdominio(subdominioNovo);
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

  const podeAdicionar =
    Boolean(hostLimpo) && !erroHostFinal && !erroSub && !salvando;

  const adicionar = async () => {
    if (!podeAdicionar) return;
    const novo: DominioTag = {
      id: crypto.randomUUID(),
      host: hostLimpo,
      subdominio: subLimpo || undefined,
      criadoEm: new Date().toISOString(),
      hits: 0,
    };
    const ok = await onSalvarDominios([...dominios, novo]);
    if (!ok) return;
    setDominioNovo('');
    setSubdominioNovo('');
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

  const comDns = dominios
    .map((d) => ({ d, reg: registroDnsDe(d, base) }))
    .filter((x): x is { d: DominioTag; reg: NonNullable<typeof x.reg> } =>
      Boolean(x.reg)
    );

  /**
   * Pré-requisito da tag (Tarefa 6, §6.2 item 2): domínio autorizado e — só
   * para quem escolheu subdomínio próprio — o primeiro hit já registrado. O
   * hit NÃO prova o CNAME: o coletor conta pelo Origin do site
   * (`tag-handler.ts`), venha a chamada pelo subdomínio ou pelo nosso
   * endereço. Por isso o texto de sucesso diz "recebendo eventos", nunca
   * "DNS confirmado" — a verificação de DNS de verdade é do plano v6. Um
   * domínio SEM subdomínio nunca bloqueia o estado de sucesso: ele já usa o
   * nosso endereço, que não depende de DNS nenhum do cliente.
   */
  const cnamesPendentes = dominios.filter(
    (d) => d.subdominio && (d.hits ?? 0) === 0
  );
  const prerequisitosOk = dominios.length > 0 && cnamesPendentes.length === 0;

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

      {/* 2 — pré-requisito de DNS/domínio ---------------------------- */}
      {prerequisitosOk ? (
        <StatusDot tone="success" icon={Globe}>
          Pré-requisitos atendidos — domínio autorizado e já recebendo eventos.
        </StatusDot>
      ) : (
        <Callout
          tone="warning"
          icon={AlertTriangle}
          title="Antes de gerar a tag, faça duas coisas."
          className="rounded-r-lg bg-warning/8 py-3 pr-3"
        >
          1) Cadastre o domínio do site do cliente na lista de domínios
          autorizados — sem isso o coletor recusa os eventos. 2) Se for usar um
          subdomínio próprio do cliente (recomendado: faz o cookie durar mais
          no Safari), peça ao cliente para criar o registro CNAME antes de
          colar a tag. Só cadastre o subdomínio depois que o CNAME existir: com
          ele cadastrado, o código gerado já chama o subdomínio, e colado antes
          disso não coleta nada.
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
      <Panel title="Domínios autorizados" icon={Globe}>
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
            motivo="Com a lista vazia o coletor recusa tudo: nenhum site pode mandar evento. Cadastre o domínio do cliente para o console gerar as tags e o registro de DNS."
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
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-label text-fg-body">
                        <span>A tag chama:</span>
                        <ParamChip>{hostDaTag(d, base)}</ParamChip>
                        <span>
                          {d.subdominio
                            ? 'subdomínio do cliente — cookie de primeira parte, sobrevive ao Safari.'
                            : 'nosso endereço — funciona, mas ainda como terceiro.'}
                        </span>
                      </p>
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

            <Field
              id="tag-subdominio-novo"
              label="Subdomínio"
              helper={`Opcional. Com ele a tag responde em ${subLimpo || 'tk'}.${hostLimpo || 'dominio.com.br'} e o cookie dura muito mais.`}
              error={erroSub ?? undefined}
            >
              <Input
                id="tag-subdominio-novo"
                value={subdominioNovo}
                placeholder="tk"
                onChange={(e) => setSubdominioNovo(e.target.value)}
                onBlur={() => setSubdominioNovo(subdominioNovo.trim().toLowerCase())}
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
      </Panel>

      {/* 6 — DNS ---------------------------------------------------- */}
      <Panel title="Registro de DNS para o cliente criar" icon={Network}>
        {comDns.length === 0 ? (
          <p className="text-caption text-fg-muted">
            Nenhum domínio tem subdomínio próprio ainda, então não há registro
            de DNS a pedir. A medição já funciona pelo nosso endereço; o
            subdomínio só serve para a tag responder dentro do domínio do
            cliente e o cookie durar mais no navegador do visitante.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {comDns.map(({ d, reg }) => {
              const texto = textoDnsParaCliente(d, base);
              return (
                <div
                  key={d.id}
                  // Mesmo caso do bloco de domínios acima: dentro de `Panel`,
                  // então sobe para `surface-2` e larga a borda (G3′).
                  className="rounded-panel bg-surface-2 p-4"
                >
                  <p className="wrap-token font-mono text-label font-semibold text-fg-strong">
                    {reg.nome}.{d.host}
                  </p>

                  <div
                    className="mt-3 max-w-full overflow-x-auto"
                    tabIndex={0}
                    role="region"
                    aria-label={`Registro de DNS de ${d.host}`}
                  >
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-line">
                          {['Tipo', 'Nome', 'Valor', 'TTL', 'Proxy'].map((h) => (
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
                        <tr className="border-b border-line">
                          <td className="py-2 pr-4 font-mono text-caption text-fg-body">
                            {reg.tipo}
                          </td>
                          <td className="py-2 pr-4 font-mono text-caption text-fg-body">
                            {reg.nome}
                          </td>
                          <td className="wrap-token py-2 pr-4 font-mono text-caption text-fg-body">
                            {reg.valor}
                          </td>
                          <td className="py-2 pr-4 text-label text-fg-body">
                            {reg.ttl}
                          </td>
                          <td className="py-2 pr-4 text-label text-fg-body">
                            {reg.proxy}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-2 text-body text-fg-body">
                    {reg.observacao}
                  </p>

                  <Field
                    id={`dns-texto-${d.id}`}
                    label="Texto para mandar ao cliente"
                    helper="Escrito para o dono do site, não para quem cuida de DNS. Mande assim, sem editar."
                    className="mt-4"
                    action={
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copiar(texto, `dns-${d.id}`)}
                      >
                        {copiado === `dns-${d.id}` ? (
                          <Check className="size-3.5 text-success" aria-hidden />
                        ) : (
                          <Copy className="size-3.5" aria-hidden />
                        )}
                        Copiar
                      </Button>
                    }
                  >
                    <Textarea
                      id={`dns-texto-${d.id}`}
                      readOnly
                      spellCheck={false}
                      rows={14}
                      value={texto}
                      className="wrap-token font-mono text-caption"
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* 7 — webhook da plataforma de vendas ------------------------- */}
      {blocoWebhood}

      {/* 8 — chave pública ------------------------------------------ */}
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

      {/* 9 — aviso de localhost ------------------------------------- */}
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
