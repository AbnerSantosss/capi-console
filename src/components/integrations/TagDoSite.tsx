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
 * T-R04 (seção 3.2 do redesenho): o código e o "Copiar" vêm primeiro. Sem
 * site, o passo é cadastrar o site, e só isso aparece. Com site, a lista de
 * sites desce para depois do código, recolhida. Saíram a faixa "Próximo
 * passo" e o "Conferir": repetiam o selo do passo. O aviso de localhost é um
 * só, na página. Tudo que recolhe usa `hidden` ou `Recolhido` (montado): o
 * campo do site guarda rascunho.
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
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from '@/components/ui/icones';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, Field, HelpTip, ParamChip, StatusDot } from '@/components/common/primitives';
import { Recolhido } from '@/components/common/Recolhido';
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
import { OndeInstalarTag, type CaminhoDeInstalacao } from '@/components/instalacao/OndeInstalarTag';
import { EventosExtras } from '@/components/instalacao/EventosExtras';
import type { TagGerada } from '@/components/instalacao/tag-estado';
import type { RegraRoteamento } from '@/lib/config-store';
import type { SiteRecusado } from '@/lib/tag-recusados';

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
  /** Grava a lista nova. Devolve false quando o servidor recusou. */
  onSalvarDominios: (dominios: DominioTag[]) => Promise<boolean>;
  /** Gira a chave pública. Devolve false quando o servidor recusou. */
  onTrocarChave: () => Promise<boolean>;
  /** true enquanto um PUT de integrações está em voo. */
  salvando: boolean;
  /** A empresa DESTA tela: a lista de sites recusados é pedida em nome dela. */
  empresaId: string;
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
  /** T-R04: true quando a tag é o passo que falta. Leva o único amarelo da tela. */
  principal?: boolean;
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
  onSalvarDominios,
  onTrocarChave,
  salvando,
  empresaId,
  blocoWebhood,
  principal = false,
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
  // E3: o caminho escolhido (GTM ou site) vale para o código e os eventos
  // extras. Só tela: não grava nada.
  const [caminho, setCaminho] = useState<CaminhoDeInstalacao>('gtm');
  const [verSites, setVerSites] = useState(false);
  // T-M19: sites que tentaram enviar com a chave desta empresa e foram
  // recusados. A empresa fica guardada junto da lista, pelo mesmo motivo da
  // `marcaCarregada`: nunca mostrar (nem autorizar) o site de outra empresa
  // enquanto a busca da empresa nova não volta.
  const [recusados, setRecusados] = useState<{ empresaId: string; sites: SiteRecusado[] }>({
    empresaId: '',
    sites: [],
  });
  const [ignorando, setIgnorando] = useState<string | null>(null);
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

  // T-M19: a lista de recusados é um aviso a mais. Se a busca falhar, a tela
  // segue como sempre foi, sem mensagem de erro: o operador não pediu nada.
  // Busca de novo quando a lista de sites muda (um site autorizado some).
  const hostsDaLista = dominios.map((d) => d.host).join('|');
  useEffect(() => {
    let ativo = true;
    pedir<{ sites: SiteRecusado[] }>('/api/tag/recusados', {
      cache: 'no-store',
      headers: { 'X-Empresa-Id': empresaId },
    })
      .then((d) => {
        if (ativo) setRecusados({ empresaId, sites: d.sites ?? [] });
      })
      .catch(() => {
        // Sessão expirada já redireciona dentro de `pedir`.
      });
    return () => {
      ativo = false;
    };
  }, [empresaId, hostsDaLista]);

  const recusadosVisiveis =
    recusados.empresaId === empresaId
      ? recusados.sites.filter((r) => !dominios.some((d) => d.host === r.host))
      : [];

  const tagsNoAr = marcaCarregada === marca ? tags : [];

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

  // T-M19: autorizar um site recusado é o mesmo cadastro do campo, com o
  // host que o coletor anotou. Ele some da lista sozinho: a rota não devolve
  // site que já é permitido.
  const autorizar = async (r: SiteRecusado) => {
    if (salvando) return;
    const novo: DominioTag = {
      id: crypto.randomUUID(),
      host: r.host,
      criadoEm: new Date().toISOString(),
      hits: 0,
    };
    const ok = await onSalvarDominios([...dominios, novo]);
    if (!ok) return;
    setSelecionado(novo.id);
  };

  const ignorar = async (r: SiteRecusado) => {
    setIgnorando(r.host);
    try {
      await pedir<{ ok: boolean }>('/api/tag/recusados', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Empresa-Id': empresaId },
        body: JSON.stringify({ host: r.host }),
      });
      setRecusados((atual) => ({
        ...atual,
        sites: atual.sites.filter((x) => x.host !== r.host),
      }));
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Não foi possível ignorar o site. Tente de novo.');
    } finally {
      setIgnorando(null);
    }
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
   * mede), então copiar e instalar a tag nunca espera o DNS do cliente. O
   * estado "recebendo" fica no selo do passo, na `InstalacaoPage`.
   */
  const siteNaLista = dominios.length > 0;

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  // T-M19: fora da lista recolhida de propósito. Um aviso dentro de um bloco
  // escondido não avisa ninguém. Sem recusa, não aparece. "Autorizar" fica em
  // contorno: o amarelo do passo é do código (ou do cadastro, sem site).
  const avisoDeRecusados =
    recusadosVisiveis.length > 0 ? (
      <Callout
        tone="warning"
        icon={ShieldAlert}
        title={
          recusadosVisiveis.length === 1
            ? 'Um site tentou enviar e foi recusado.'
            : `${recusadosVisiveis.length} sites tentaram enviar e foram recusados.`
        }
      >
        <p>
          {recusadosVisiveis.length === 1
            ? 'Ele não está em Sites permitidos. Autorize só se o site for do cliente.'
            : 'Eles não estão em Sites permitidos. Autorize só os que forem do cliente.'}
        </p>
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {recusadosVisiveis.map((r) => {
            const quando =
              montado && !Number.isNaN(Date.parse(r.ultimaVez))
                ? formatDistanceToNow(new Date(r.ultimaVez), {
                    addSuffix: true,
                    locale: ptBR,
                  })
                : `em ${dataCurta(r.ultimaVez)}`;
            return (
              <li key={r.host} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="wrap-token font-mono text-label font-semibold text-fg-strong">
                    {r.host}
                  </p>
                  <p className="text-label text-fg-body tabular">
                    {r.vezes} tentativa{r.vezes === 1 ? '' : 's'} · a última {quando}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={salvando}
                    onClick={() => autorizar(r)}
                  >
                    Autorizar este site
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={ignorando === r.host}
                    onClick={() => ignorar(r)}
                  >
                    Ignorar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Callout>
    ) : null;

  // Sites permitidos. Sem site, é o próprio passo e fica aberto, em cima. Com
  // site, desce para depois do código e recolhe (com `hidden`, nunca
  // desmontado: o campo do site guarda rascunho).
  const blocoDeSites = (
    <div className="flex min-w-0 flex-col gap-3">
      {siteNaLista && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-label font-semibold text-fg-strong">
            <Lock className="size-4 shrink-0 text-fg-muted" aria-hidden />
            Sites permitidos
          </p>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={verSites}
            aria-controls="tag-sites"
            onClick={() => setVerSites((v) => !v)}
          >
            {verSites ? 'Esconder sites' : 'Ver sites'}
          </Button>
        </div>
      )}

      <div id="tag-sites" hidden={siteNaLista && !verSites} className="flex min-w-0 flex-col gap-3">
        <p className="text-body text-fg-body">Só os sites desta lista conseguem enviar.</p>

        {siteNaLista && (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
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
                <li key={d.id} className="flex flex-col gap-2 py-3">
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
                                nosso endereço, até{' '}
                                <span className="wrap-token font-mono">{proprio}</span> ficar
                                pronto. A tag continua coletando.
                              </span>
                            </>
                          )}
                        </p>
                      ) : (
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-label text-fg-body">
                          <span>A tag chama:</span>
                          <ParamChip>{hostDaTag(d, base)}</ParamChip>
                          <span>
                            {d.subdominio ? 'domínio do cliente; o cookie próprio ainda depende do certificado.' : 'nosso endereço: funciona, ainda como terceiro.'}
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
                        <Button size="sm" variant="ghost" onClick={() => setRemovendoId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setRemovendoId(d.id)}>
                        <Trash2 className="size-3.5 text-danger" aria-hidden />
                        Remover
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <StatusDot tone={instalado ? 'success' : 'neutral'}>
                      {instalado
                        ? `Último evento: ${relativo ?? `em ${dataCurta(d.ultimoHit)}`}`
                        : 'Ainda não recebeu nada'}
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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            id="tag-dominio-novo"
            label="Site do cliente"
            helper="Pode colar a URL inteira."
            error={erroHostFinal ?? undefined}
            className="min-w-0 flex-1"
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
          {/* Sem site, cadastrar é o passo que falta: o único amarelo da tela. */}
          <Button
            variant={principal && !siteNaLista ? 'default' : 'outline'}
            onClick={adicionar}
            disabled={!podeAdicionar}
            className="sm:mb-6"
          >
            <Plus className="size-4" aria-hidden />
            {salvando ? 'Salvando…' : 'Cadastrar site'}
          </Button>
        </div>

        {/* V8: o subdomínio, o registro de DNS e a mensagem para o cliente
            moram na aba Domínio. Aqui, uma linha só, com o caminho. */}
        <p className="flex flex-wrap items-center gap-x-2 text-body text-fg-body">
          O domínio próprio fica na aba Domínio.
          {slug && (
            <Link
              href={enderecoDaAba(slug, 'dominio')}
              className="inline-flex items-center gap-1 font-medium text-fg-strong underline underline-offset-2"
            >
              Abrir a aba Domínio
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {avisoDeRecusados}

      {!siteNaLista ? (
        <>
          {/* Sem site não há código: o recado aparece uma vez, aqui. */}
          <Callout
            tone="warning"
            icon={AlertTriangle}
            title="Antes de gerar a tag, cadastre o site do cliente."
          >
            Cadastre o domínio do site do cliente aqui embaixo: sem ele, o coletor
            recusa os eventos.
          </Callout>
          {blocoDeSites}
        </>
      ) : (
        <>
          {/* T-R04: o código e o "Copiar" primeiro. */}
          {dominios.length > 1 && (
            <div
              className="flex max-w-full flex-wrap gap-1 overflow-x-auto rounded-control border border-line-control bg-surface-2 p-1"
              role="group"
              aria-label="Site das tags mostradas"
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

          <OndeInstalarTag
            tags={tagsNoAr}
            regras={regras}
            copiar={copiar}
            copiado={copiado}
            caminho={caminho}
            aoEscolherCaminho={setCaminho}
            principal={principal}
          />

          <EventosExtras
            tags={tagsNoAr}
            regras={regras}
            copiar={copiar}
            copiado={copiado}
            caminho={caminho}
          />

          {blocoDeSites}
        </>
      )}

      {/* Webhook da plataforma de vendas (slot; a Instalação passa null) -- */}
      {blocoWebhood}

      {/* Chave pública: uso raro, recolhida. */}
      <Recolhido titulo="Chave pública da tag">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="inline-flex flex-wrap items-center gap-1 text-body text-fg-body">
            Esta chave fica visível no site, e tudo bem.
            Não é o segredo do webhook: o segredo nunca vai na tag.
            <HelpTip
              label="Por que separar a chave do segredo"
              content="Se o segredo do webhook for parar na tag ou no GTM, qualquer pessoa consegue forjar uma venda."
            />
          </p>

          <Field
            id="tag-chave"
            label="Chave da tag"
            action={
              <Button size="sm" variant="ghost" onClick={() => copiar(tag.chave, 'chave')}>
                {copiado === 'chave' ? (
                  <Check className="size-3.5 text-success" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                Copiar
              </Button>
            }
          >
            <Input id="tag-chave" readOnly value={tag.chave} className="wrap-token font-mono" />
          </Field>

          <div>
            {confirmandoChave ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption text-warning">
                  As tags instaladas param até você colar o código novo. As
                  vendas continuam (o webhook não usa esta chave).
                </span>
                <Button size="sm" variant="destructive" disabled={trocandoChave} onClick={trocarChave}>
                  {trocandoChave ? 'Gerando…' : 'Confirmar nova chave'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmandoChave(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmandoChave(true)}>
                <RefreshCw className="size-3.5" aria-hidden />
                Gerar nova chave
              </Button>
            )}
          </div>
        </div>
      </Recolhido>
    </div>
  );
}

export default TagDoSite;
