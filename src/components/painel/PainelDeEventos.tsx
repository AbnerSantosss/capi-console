'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  CheckCircle2,
  Clock,
  FlaskConical,
  Gauge,
  Globe,
  Inbox,
  MousePointerClick,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';

import { pedir } from '@/lib/cliente-api';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import { Callout, Panel, Section } from '@/components/common/primitives';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import { Esqueleto } from '@/components/common/Esqueleto';
import { BarraAnimada, NumeroAnimado } from '@/components/common/motion';
import { Button } from '@/components/ui/button';
import {
  buscaDoPeriodo,
  PERIODO_PADRAO,
  respostaEhDoPeriodo,
  rotuloDoPeriodo,
  SeletorDePeriodo,
  type PeriodoEscolhido,
} from '@/components/common/SeletorDePeriodo';
import { FILTROS_VAZIOS, type FiltrosInboxValor } from '@/components/integrations/FiltrosInbox';
import { InboxList } from '@/components/integrations/InboxList';
import { cn } from '@/lib/utils';

/**
 * Painel de eventos — a primeira tela do console.
 *
 * O que ele responde, nesta ordem: quanto chegou, quanto saiu para a Meta, de
 * onde veio o tráfego e com que qualidade. Nada aqui dispara evento: o painel
 * só LÊ `GET /api/inbox/resumo`, que por sua vez só conta o que já está na
 * caixa de entrada (regra 1 do CLAUDE.md).
 *
 * Cada card é um botão. O clique não troca de rota nem escreve filtro na URL
 * (IA-R5): ele abre, logo abaixo, a lista dos eventos daquele recorte, com o
 * mesmo vocabulário de filtro que a caixa de entrada usa. Assim o número do
 * card e a lista vêm da mesma janela de dados e não se contradizem.
 *
 * 🔴 Teste da equipe fica fora de toda porcentagem (regra 4) e tem card
 * próprio, para nunca ser confundido com venda.
 */

/* ------------------------------------------------------------------ */
/* O que a rota devolve                                                */
/* ------------------------------------------------------------------ */

interface CardContagem {
  total: number;
  pct: number | null;
}

interface ResumoInbox {
  /** O período que o servidor usou: `'hoje'`, `'ontem'`, 7, 30, 90 ou `{de, ate}`. */
  periodo: string | number | { de: string; ate: string };
  /** De quando até quando ele contou, em ISO. */
  janela: { inicio: string; fim: string };
  amostra: number;
  /** `false` = a amostra parou antes do começo da janela; o número é um piso. */
  amostraCobreJanela: boolean;
  base: number;
  volume: {
    recebidos: number;
    enviados: CardContagem;
    naFila: CardContagem;
    ignorados: CardContagem;
    testesEquipe: number;
  };
  atribuicao: {
    metaFbclid: CardContagem;
    metaFbc: CardContagem;
    google: CardContagem;
    tiktok: CardContagem;
    microsoft: CardContagem;
    semAtribuicao: CardContagem;
  };
  qualidade: {
    emqMedio: number | null;
    enviadosComEmq: number;
  };
  porEvento: Array<{ evento: string; total: number; pct: number | null }>;
  receitaEnviada: { total: number; moeda: string } | null;
}

/** Só eventos reais: o recorte que todo card de métrica abre. */
const SO_REAIS: FiltrosInboxValor = { ...FILTROS_VAZIOS, equipe: 'reais' };

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

/**
 * O matiz entra só no ícone e na barra — nunca no texto, que continua nos
 * tokens de leitura (`--fg-*`) para o gate de contraste continuar valendo.
 */
type Matiz = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'neutro';

const FUNDO_DO_MATIZ: Record<Matiz, string> = {
  'chart-1': 'bg-chart-1/12 text-chart-1',
  'chart-2': 'bg-chart-2/12 text-chart-2',
  'chart-3': 'bg-chart-3/12 text-chart-3',
  'chart-4': 'bg-chart-4/12 text-chart-4',
  'chart-5': 'bg-chart-5/12 text-chart-5',
  neutro: 'bg-surface-3 text-fg-muted',
};

const BARRA_DO_MATIZ: Record<Matiz, string> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
  neutro: 'bg-fg-disabled',
};

function textoDaPorcentagem(pct: number | null): string {
  if (pct === null) return 'sem base de comparação';
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} % dos eventos reais`;
}

function CardPainel({
  titulo,
  explicacao,
  total,
  pct,
  icone: Icone,
  matiz = 'neutro',
  comBarra = false,
  aoClicar,
  ativo = false,
}: {
  titulo: string;
  explicacao: string;
  total: number;
  pct?: number | null;
  icone: React.ElementType;
  matiz?: Matiz;
  comBarra?: boolean;
  aoClicar?: () => void;
  ativo?: boolean;
}) {
  const temPct = pct !== undefined && pct !== null;
  const descricao = [
    `${titulo}: ${total} ${total === 1 ? 'evento' : 'eventos'}`,
    temPct ? `${pct} por cento dos eventos reais` : '',
    aoClicar ? 'Abrir a lista destes eventos.' : '',
  ]
    .filter(Boolean)
    .join('. ');

  const conteudo = (
    <>
      <span className="flex w-full min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 text-label font-medium text-fg-strong">{titulo}</span>
        <span
          aria-hidden
          className={cn('flex size-7 shrink-0 items-center justify-center rounded-control', FUNDO_DO_MATIZ[matiz])}
        >
          <Icone className="size-4" strokeWidth={1.75} />
        </span>
      </span>

      <span className="flex min-w-0 items-baseline gap-2">
        <NumeroAnimado valor={total} casas={0} className="text-data font-semibold text-fg-strong" />
        {pct !== undefined && (
          <span className="min-w-0 text-caption text-fg-muted">{textoDaPorcentagem(pct)}</span>
        )}
      </span>

      {comBarra && (
        <BarraAnimada percentual={pct ?? 0} corBarra={BARRA_DO_MATIZ[matiz]} className="h-1.5 w-full" />
      )}

      <span className="min-w-0 text-caption break-words text-fg-muted">{explicacao}</span>
    </>
  );

  const classes = cn(
    'flex min-w-0 flex-col items-start gap-2 rounded-panel border bg-surface-2 p-4 text-left',
    ativo ? 'border-accent-text' : 'border-line-strong'
  );

  if (!aoClicar) {
    return <div className={classes}>{conteudo}</div>;
  }

  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={descricao}
      className={cn(
        classes,
        'cursor-pointer transition-colors hover:border-accent-text hover:bg-surface-3',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text'
      )}
    >
      {conteudo}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

interface Recorte {
  filtros: FiltrosInboxValor;
  rotulo: string;
  /** Muda a cada clique para a lista nascer de novo, mesmo no mesmo card. */
  chave: number;
}

export function PainelDeEventos() {
  const empresaAtivaId = useEmpresaStore((s) => s.empresaAtivaId);

  const [periodo, setPeriodo] = useState<PeriodoEscolhido>(PERIODO_PADRAO);
  const [resumo, setResumo] = useState<ResumoInbox | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recorte, setRecorte] = useState<Recorte | null>(null);
  /** Contador do botão "Tentar de novo": muda, o efeito refaz a chamada. */
  const [tentativa, setTentativa] = useState(0);

  /**
   * A busca mora DENTRO do efeito, e não numa função chamada por ele.
   *
   * Duas razões, nesta ordem:
   *
   * 1. Nenhum `setState` síncrono dentro de efeito — é render em cascata, e o
   *    `react-hooks/set-state-in-effect` reprova no `npm run lint` (mesma
   *    regra que o `Esqueleto` e o `animated-grid-pattern` já respeitam). Aqui
   *    todo `setState` acontece DEPOIS do `await`, dentro da continuação.
   * 2. `vivo` mata a corrida: trocar 7 → 30 → 90 depressa dispara três
   *    respostas, e sem a trava a primeira a voltar pode ser a última a
   *    escrever. O painel mostraria o número de uma janela com o rótulo de
   *    outra — exatamente o tipo de número mentiroso que este painel existe
   *    para não produzir.
   *
   * `carregando` só vira `false` e nunca volta a `true`: ao trocar de período
   * os números velhos continuam na tela e quem avisa é o `atualizando`,
   * derivado, sem estado novo.
   */
  // String, e não o objeto: dependência de efeito comparada por identidade
  // refaria a busca a cada render, já que o objeto do período nasce novo.
  const busca = buscaDoPeriodo(periodo);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const dados = await pedir<{ resumo: ResumoInbox }>(`/api/inbox/resumo?${busca}`, {
          cache: 'no-store',
        });
        if (!vivo) return;
        setResumo(dados.resumo);
        setErro(null);
      } catch (e) {
        // Sessão expirada já redireciona sozinha dentro de `pedir`.
        if (!vivo) return;
        setErro(e instanceof Error ? e.message : 'Não foi possível montar o painel.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // Trocar de empresa troca a resposta inteira: o header X-Empresa-Id muda.
    // `tentativa` existe para o botão "Tentar de novo" refazer a chamada.
  }, [busca, empresaAtivaId, tentativa]);

  /** Abre a lista do recorte e leva o foco até ela. */
  const abrirRecorte = useCallback((filtros: FiltrosInboxValor, rotulo: string) => {
    setRecorte((r) => ({ filtros, rotulo, chave: (r?.chave ?? 0) + 1 }));
    window.requestAnimationFrame(() => {
      document.getElementById('recorte-do-painel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const seletorDePeriodo = (
    <SeletorDePeriodo
      valor={periodo}
      aoMudar={setPeriodo}
      rotuloDoGrupo="Período do painel"
      className="w-full"
    />
  );

  const cardsDeAtribuicao = useMemo(() => {
    if (!resumo) return [];
    const a = resumo.atribuicao;
    return [
      {
        chave: 'fbclid',
        titulo: 'Vieram de anúncio da Meta',
        explicacao: 'Chegaram com fbclid, o carimbo do clique no criativo.',
        dado: a.metaFbclid,
        icone: MousePointerClick,
        matiz: 'chart-1' as Matiz,
        filtro: 'fbclid' as const,
      },
      {
        chave: 'fbc',
        titulo: 'Com cookie da Meta',
        explicacao: 'O _fbc estava no navegador na hora da compra.',
        dado: a.metaFbc,
        icone: Sparkles,
        matiz: 'chart-1' as Matiz,
        filtro: 'fbc' as const,
      },
      {
        chave: 'gclid',
        titulo: 'Vieram do Google Ads',
        explicacao: 'Chegaram com gclid, gbraid ou wbraid.',
        dado: a.google,
        icone: Globe,
        matiz: 'chart-3' as Matiz,
        filtro: 'gclid' as const,
      },
      {
        chave: 'ttclid',
        titulo: 'Vieram do TikTok Ads',
        explicacao: 'Chegaram com ttclid.',
        dado: a.tiktok,
        icone: Globe,
        matiz: 'chart-4' as Matiz,
        filtro: 'ttclid' as const,
      },
      {
        chave: 'msclkid',
        titulo: 'Vieram do Microsoft Ads',
        explicacao: 'Chegaram com msclkid.',
        dado: a.microsoft,
        icone: Globe,
        matiz: 'chart-5' as Matiz,
        filtro: 'msclkid' as const,
      },
      {
        chave: 'sem',
        titulo: 'Sem atribuição',
        explicacao: 'Orgânico, direto, ou o clique se perdeu antes da compra.',
        dado: a.semAtribuicao,
        icone: ArrowDownRight,
        matiz: 'neutro' as Matiz,
        filtro: 'sem' as const,
      },
    ];
  }, [resumo]);

  /* ------------------------------ carregando ------------------------------ */
  if (carregando && !resumo) {
    return (
      <div className="flex min-w-0 flex-col gap-4" aria-busy="true" aria-label="Montando o painel">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Esqueleto key={i} className="h-28 rounded-panel" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Esqueleto key={i} className="h-32 rounded-panel" />
          ))}
        </div>
      </div>
    );
  }

  /* ------------------------------ erro ------------------------------ */
  if (erro && !resumo) {
    return (
      <Callout tone="danger" title="O painel não carregou">
        <p className="text-caption text-fg-body">{erro}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTentativa((t) => t + 1)}
          className="mt-3"
        >
          Tentar de novo
        </Button>
      </Callout>
    );
  }

  if (!resumo) return null;

  const { volume, qualidade, porEvento, receitaEnviada } = resumo;
  const vazio = volume.recebidos === 0;
  // Derivado, não estado: o resumo na tela ainda é da janela anterior, logo a
  // resposta da nova ainda não chegou. Dizer isso com todas as letras evita o
  // pior dos dois mundos — número velho com cara de número novo.
  const atualizando = !respostaEhDoPeriodo(resumo.periodo, periodo);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* ---------------- período e recorte da amostra ---------------- */}
      <div className="flex min-w-0 flex-col gap-3">
        {seletorDePeriodo}
        <p className="min-w-0 text-caption text-fg-muted">
          {rotuloDoPeriodo(periodo)}: contagem feita sobre os últimos {resumo.amostra}{' '}
          {resumo.amostra === 1 ? 'evento recebido' : 'eventos recebidos'} desta empresa. Teste da
          equipe fica fora das porcentagens.
          {atualizando && (
            <span className="text-fg-body"> Refazendo a conta para a nova janela…</span>
          )}
        </p>
      </div>

      {erro && (
        <Callout tone="warning" title="Os números podem estar velhos">
          <p className="text-caption text-fg-body">{erro}</p>
        </Callout>
      )}

      {!resumo.amostraCobreJanela && (
        <Callout tone="warning" title="Este período é maior que a leitura">
          <p className="text-caption text-fg-body">
            A conta olha os {resumo.amostra} eventos mais recentes desta empresa, e o mais antigo
            deles já está dentro do período escolhido. Existe evento nesta janela que ficou de fora:
            os números abaixo são um piso, não o total. Escolha um período mais curto para ter a
            contagem fechada.
          </p>
        </Callout>
      )}

      {vazio ? (
        <EstadoVazio
          icone={Inbox}
          titulo="Nenhum evento chegou neste período"
          motivo="A caixa de entrada desta empresa está vazia na janela escolhida. Se o webhook acabou de ser instalado, o primeiro evento aparece aqui assim que a primeira venda entrar."
          acao={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPeriodo({ dias: '90', de: null, ate: null })}
            >
              Olhar os últimos 90 dias
            </Button>
          }
        />
      ) : (
        <>
          {/* ---------------- volume ---------------- */}
          <Section
            title="O que chegou e o que saiu"
            description="Cada card abre, aqui embaixo, a lista dos eventos que ele conta."
            icon={Inbox}
          >
            <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <CardPainel
                titulo="Recebidos no período"
                explicacao="Tudo o que entrou na caixa, incluindo teste da equipe."
                total={volume.recebidos}
                icone={Inbox}
                matiz="chart-1"
                aoClicar={() => abrirRecorte({ ...FILTROS_VAZIOS }, 'tudo o que foi recebido')}
                ativo={recorte?.rotulo === 'tudo o que foi recebido'}
              />
              <CardPainel
                titulo="Enviados à Meta"
                explicacao="A API de Conversões aceitou o evento."
                total={volume.enviados.total}
                pct={volume.enviados.pct}
                icone={CheckCircle2}
                matiz="chart-2"
                comBarra
                aoClicar={() =>
                  abrirRecorte({ ...SO_REAIS, status: 'disparado' }, 'enviados à Meta')
                }
                ativo={recorte?.rotulo === 'enviados à Meta'}
              />
              <CardPainel
                titulo="Na fila"
                explicacao="Esperando um clique seu ou uma regra automática."
                total={volume.naFila.total}
                pct={volume.naFila.pct}
                icone={Clock}
                matiz="chart-3"
                comBarra
                aoClicar={() => abrirRecorte({ ...SO_REAIS, status: 'novo' }, 'na fila')}
                ativo={recorte?.rotulo === 'na fila'}
              />
              <CardPainel
                titulo="Ignorados"
                explicacao="Uma regra ou um motivo mandou não enviar."
                total={volume.ignorados.total}
                pct={volume.ignorados.pct}
                icone={ArrowDownRight}
                matiz="neutro"
                comBarra
                aoClicar={() => abrirRecorte({ ...SO_REAIS, status: 'ignorado' }, 'ignorados')}
                ativo={recorte?.rotulo === 'ignorados'}
              />
              <CardPainel
                titulo="Testes da equipe"
                explicacao="Ficam fora de toda porcentagem, de propósito."
                total={volume.testesEquipe}
                icone={FlaskConical}
                matiz="chart-4"
                aoClicar={() =>
                  abrirRecorte({ ...FILTROS_VAZIOS, equipe: 'so-testes' }, 'testes da equipe')
                }
                ativo={recorte?.rotulo === 'testes da equipe'}
              />
            </div>
          </Section>

          {/* ---------------- atribuição ---------------- */}
          <Section
            title="De onde veio o tráfego"
            description="A porcentagem é sobre os eventos reais do período, sem os testes da equipe."
            icon={MousePointerClick}
          >
            <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {cardsDeAtribuicao.map((c) => (
                <CardPainel
                  key={c.chave}
                  titulo={c.titulo}
                  explicacao={c.explicacao}
                  total={c.dado.total}
                  pct={c.dado.pct}
                  icone={c.icone}
                  matiz={c.matiz}
                  comBarra
                  aoClicar={() => abrirRecorte({ ...SO_REAIS, atribuicao: c.filtro }, c.titulo)}
                  ativo={recorte?.rotulo === c.titulo}
                />
              ))}
            </div>
            <p className="text-caption text-fg-muted">
              Um mesmo evento pode carregar mais de um sinal — quem clicou no anúncio da Meta e já
              tinha o cookie conta nos dois cards. Por isso estas porcentagens não somam 100 %.
            </p>
          </Section>

          {/* ---------------- por evento ---------------- */}
          {porEvento.length > 0 && (
            <Section
              title="Quais eventos chegaram"
              description="Os oito nomes mais frequentes, do maior para o menor."
              icon={ShoppingBag}
            >
              <Panel className="flex min-w-0 flex-col gap-2">
                {porEvento.map((e) => (
                  <button
                    key={e.evento}
                    type="button"
                    onClick={() =>
                      abrirRecorte({ ...SO_REAIS, evento: e.evento }, `evento ${e.evento}`)
                    }
                    aria-label={`Evento ${e.evento}: ${e.total} eventos. Abrir a lista.`}
                    className={cn(
                      'flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-control border p-2 text-left transition-colors',
                      'hover:border-accent-text hover:bg-surface-2',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text',
                      recorte?.rotulo === `evento ${e.evento}`
                        ? 'border-accent-text'
                        : 'border-transparent'
                    )}
                  >
                    <span className="flex min-w-0 items-baseline justify-between gap-3">
                      <span className="wrap-token min-w-0 font-mono text-label text-fg-body">
                        {e.evento}
                      </span>
                      <span className="shrink-0 text-label font-semibold text-fg-strong">
                        {e.total}
                      </span>
                    </span>
                    <BarraAnimada percentual={e.pct ?? 0} corBarra="bg-chart-2" className="h-1.5" />
                  </button>
                ))}
              </Panel>
            </Section>
          )}

          {/* ---------------- qualidade ---------------- */}
          <Section
            title="Qualidade do que saiu"
            description="O EMQ é a nota que a Meta dá ao pareamento de cada evento enviado."
            icon={Gauge}
          >
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <CardPainel
                titulo="EMQ médio dos enviados"
                explicacao={
                  qualidade.emqMedio === null
                    ? 'Nenhum evento enviado no período trouxe nota.'
                    : `Média de ${qualidade.enviadosComEmq} ${
                        qualidade.enviadosComEmq === 1 ? 'evento com nota' : 'eventos com nota'
                      }.`
                }
                total={qualidade.emqMedio ?? 0}
                icone={Gauge}
                matiz="chart-2"
                aoClicar={() =>
                  abrirRecorte({ ...SO_REAIS, status: 'disparado' }, 'enviados à Meta')
                }
              />
              {receitaEnviada && (
                <div className="flex min-w-0 flex-col items-start gap-2 rounded-panel border border-line-strong bg-surface-2 p-4">
                  <span className="flex w-full min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 text-label font-medium text-fg-strong">
                      Valor enviado à Meta
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-control',
                        FUNDO_DO_MATIZ['chart-2']
                      )}
                    >
                      <ShoppingBag className="size-4" strokeWidth={1.75} />
                    </span>
                  </span>
                  <span className="text-data font-semibold text-fg-strong">
                    {receitaEnviada.total.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: receitaEnviada.moeda,
                    })}
                  </span>
                  <span className="text-caption text-fg-muted">
                    Soma do valor dos eventos que a Meta aceitou no período.
                  </span>
                </div>
              )}
            </div>
          </Section>
        </>
      )}

      {/* ---------------- a lista do recorte ---------------- */}
      {recorte && (
        <Section
          id="recorte-do-painel"
          title={`Eventos: ${recorte.rotulo}`}
          description={`A mesma caixa de entrada, no período "${rotuloDoPeriodo(periodo)}", já filtrada pelo card que você clicou.`}
          icon={Inbox}
          action={
            <Button variant="ghost" size="sm" onClick={() => setRecorte(null)}>
              <X className="size-4" aria-hidden />
              Fechar o recorte
            </Button>
          }
        >
          {/* A MESMA janela que contou o card. Sem isto o card dizia "3 no
              período" e a lista abria com tudo o que existe na caixa — dois
              números diferentes para a mesma pergunta, na mesma tela. */}
          <InboxList
            key={recorte.chave}
            filtrosIniciais={recorte.filtros}
            janela={resumo.janela}
            acaoJanelaVazia={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPeriodo({ dias: '90', de: null, ate: null })}
              >
                Olhar os últimos 90 dias
              </Button>
            }
            limite={1000}
          />
        </Section>
      )}
    </div>
  );
}
