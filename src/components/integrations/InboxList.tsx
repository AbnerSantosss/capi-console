'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Radio,
  Workflow,
  RefreshCw,
  Trash2,
  ArrowDownToLine,
  Send,
  AlertTriangle,
  ArrowRight,
  FlaskConical,
  WifiOff,
  PlugZap,
  Ban,
  FileWarning,
  FileJson,
  HelpCircle,
  MousePointerClick,
} from 'lucide-react';

import { useEventStore } from '@/stores/useEventStore';
import { parseWebhook, type ClassificacaoEvento, type MotivoIgnorar } from '@/lib/parser';
import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusDot, Callout } from '@/components/common/primitives';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import {
  Esqueleto,
  RegiaoDeEspera,
  Spinner,
  useEscadaDeEspera,
} from '@/components/common/Esqueleto';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ItemDeLista, AnimatePresence } from '@/components/common/motion';
import { SeletorDePixel, nomeDoPixel } from '@/components/pixels/SeletorDePixel';
import { useBrandStore, type MarcaPublica } from '@/stores/useBrandStore';
import { motivoLegivel, parMeta, TEXTO_CLASSIFICACAO } from './eventos-legiveis';
// Fonte UNICA da elegibilidade do lote (regras 1 e 4 do CLAUDE.md). A tela nao
// reimplementa nada disto: ela pergunta e obedece. Modulo neutro, sem
// `server-only`, justamente para poder ser importado daqui.
import { separarParaLote } from '@/lib/inbox-lote';
import {
  FiltrosInbox,
  FILTROS_VAZIOS,
  descreverFiltros,
  nomeDoEvento,
  passaFiltros,
  type FiltrosInboxValor,
  type ProgressoLote,
} from './FiltrosInbox';
import { DialogoPayload } from './DialogoPayload';
import { DialogoLote, type MotivoFora } from './DialogoLote';

interface ResultadoDisparo {
  marcaId: string;
  /**
   * Ausente em registro gravado antes de o ID do Pixel ser guardado junto.
   * A leitura tolera a falta: vira "Pixel removido" sem numero, e nao quebra.
   */
  pixelId?: string;
  status:
    | 'enviado'
    | 'duplicado'
    | 'invalido'
    | 'erro'
    | 'teste-ignorado'
    | 'sem-token'
    | 'pixel-desligado';
  httpStatus?: number;
  eventsReceived?: number;
  fbtraceId?: string;
  erro?: string;
  modoTeste: boolean;
  herdados: string[];
  emq: number;
}

/**
 * COPIA cliente de `ItemInbox` (`src/lib/inbox.ts`).
 *
 * Nao da para importar de la: aquele arquivo abre com `server-only`. Campo novo
 * no servidor precisa de campo novo aqui — o `tsc` nao liga os dois lados, e um
 * campo esquecido nao quebra a compilacao, so some da tela em silencio.
 */
export interface ItemInbox {
  id: string;
  recebidoEm: string;
  origem: string;
  evento?: string;
  eventoOrigem?: string;
  eventoMeta?: string;
  regraId?: string;
  modo?: 'auto' | 'fila' | 'ignorar';
  conhecido?: boolean;
  valor?: number;
  moeda?: string;
  emailMascarado?: string;
  /**
   * Nome do comprador como veio da plataforma, INTEIRO.
   *
   * O e-mail continua mascarado (`emailMascarado`) — foi o pedido literal do
   * dono: dava para reconhecer o cliente, mas sem o endereco completo na tela.
   */
  nomeCliente?: string;
  orderId?: string;
  temFbc: boolean;
  temFbp: boolean;
  /**
   * Sinais de atribuicao, BOOLEANOS. O valor cru do clique nunca chega aqui —
   * a lista precisa saber SE existe, jamais qual e. Itens gravados antes destes
   * campos vem com os sinais derivados do payload pelo servidor, na leitura.
   */
  temFbclid?: boolean;
  temGclid?: boolean;
  emq?: number;
  status: 'novo' | 'carregado' | 'disparado' | 'ignorado';
  payload: unknown;
  resultados?: ResultadoDisparo[];
  /* Campos de leitura: explicam a decisão, não mudam roteamento nenhum. */
  classificacao?: ClassificacaoEvento;
  motivoIgnorar?: MotivoIgnorar;
  testePlataforma?: boolean;
  testeInterno?: boolean;
  formato?: 'A' | 'B' | 'outro';
  rotuloRecebido?: string | null;
  rotuloDivergente?: boolean;
  eventoMetaSugerido?: string;
}

/** Estado REAL do canal ao vivo. O selo da tela lê daqui, nunca de um enfeite. */
type EstadoConexao = 'conectando' | 'conectado' | 'reconectando' | 'desconectado' | 'sessao-expirada';

/** Sem sinal nenhum por mais que isto, a conexão é dada como morta e refeita. */
const SILENCIO_MAXIMO_MS = 45_000;

const dinheiro = (v?: number, moeda = 'BRL') =>
  v === undefined
    ? '—'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(v);

const hora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const ROTULO_MODO: Record<'auto' | 'fila' | 'ignorar', string> = {
  auto: 'envio automático',
  fila: 'fica na fila',
  ignorar: 'não enviar',
};

const TOM_RESULTADO: Record<ResultadoDisparo['status'], 'success' | 'danger' | 'neutral'> = {
  enviado: 'success',
  duplicado: 'neutral',
  'teste-ignorado': 'neutral',
  invalido: 'danger',
  erro: 'danger',
  'sem-token': 'danger',
  // Neutro, nao vermelho: o Pixel estar desligado e uma escolha de quem
  // opera, nao um defeito. O item continua na fila, inteiro, esperando.
  'pixel-desligado': 'neutral',
};

/**
 * O que a linha do resultado DIZ, em portugues.
 *
 * Antes a tela imprimia o slug cru ("teste-ignorado", "sem-token"). Quem opera
 * nao conhece o vocabulario interno, e a FASE 6 acrescentaria mais um slug
 * ("pixel-desligado") a essa lista de enigmas.
 */
const ROTULO_RESULTADO: Record<ResultadoDisparo['status'], string> = {
  enviado: 'enviado',
  duplicado: 'já tinha sido enviado',
  invalido: 'recusado antes de sair',
  erro: 'erro no envio',
  'teste-ignorado': 'teste interno, não enviado',
  'sem-token': 'sem Pixel ID ou token',
  'pixel-desligado': 'automático deste Pixel desligado',
};

const FORMATO_TEXTO: Record<'A' | 'B' | 'outro', string> = {
  A: 'formato da plataforma (A)',
  B: 'formato gateway',
  outro: 'formato não reconhecido',
};

/** true quando o corpo nem pôde ser lido (não era JSON ou passou de 1 MB). */
function ehNaoLido(item: ItemInbox): boolean {
  return (
    item.motivoIgnorar === 'nao-lido' ||
    (typeof item.payload === 'object' &&
      item.payload !== null &&
      '__naoLido' in (item.payload as Record<string, unknown>))
  );
}

/** Um item só é disparável se houver um evento padrão da Meta escolhido para ele. */
function podeDisparar(item: ItemInbox): boolean {
  if (item.status === 'ignorado' || item.modo === 'ignorar') return false;
  if (item.testePlataforma || ehNaoLido(item)) return false;
  return Boolean(item.eventoMeta && parMeta(item.eventoMeta)?.padrao);
}

/**
 * Junta o que veio do GET com o que já está na tela, sem perder nada.
 *
 * O GET de montagem e o `inicial` do SSE correm juntos; se um sobrescrevesse o
 * outro, um webhook que chegou no meio sumiria da lista até o próximo refresh.
 */
function mesclar(atuais: ItemInbox[], novos: ItemInbox[]): ItemInbox[] {
  const porId = new Map<string, ItemInbox>();
  for (const i of atuais) porId.set(i.id, i);
  // O que vem do servidor é mais recente que a cópia local do mesmo id.
  for (const i of novos) porId.set(i.id, { ...porId.get(i.id), ...i });
  return [...porId.values()]
    .sort((a, b) => (a.recebidoEm < b.recebidoEm ? 1 : a.recebidoEm > b.recebidoEm ? -1 : 0))
    .slice(0, 50);
}

export function InboxList({ compacto = false }: { compacto?: boolean }) {
  const [itens, setItens] = useState<ItemInbox[]>([]);
  const [conexao, setConexao] = useState<EstadoConexao>('conectando');
  const [ultimoSinalEm, setUltimoSinalEm] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [alvo, setAlvo] = useState<ItemInbox | null>(null);
  const [marcasEscolhidas, setMarcasEscolhidas] = useState<string[]>([]);
  const [disparando, setDisparando] = useState(false);
  /** Incrementar força o efeito do SSE a refazer a conexão do zero. */
  const [tentativa, setTentativa] = useState(0);

  /* --- Filtros, payload e lote (FASE B do plano multi-empresa) ---------- */

  /**
   * Filtro em estado LOCAL, nunca na URL (IA-R5 / D-10 do plano). Recorte de
   * tela não é endereço: um link colado com `?evento=purchase` levaria outra
   * pessoa a um lote com contagem diferente da que quem mandou o link viu.
   */
  const [filtros, setFiltros] = useState<FiltrosInboxValor>(FILTROS_VAZIOS);
  const [payloadAberto, setPayloadAberto] = useState<ItemInbox | null>(null);
  const [loteAberto, setLoteAberto] = useState(false);
  const [marcasDoLote, setMarcasDoLote] = useState<string[]>(['default']);
  const [lote, setLote] = useState<ProgressoLote | null>(null);
  const [resumoLote, setResumoLote] = useState<ProgressoLote | null>(null);
  /**
   * "Parar" precisa ser visto DENTRO do laço, que roda fora do ciclo de render.
   * Um `useState` aqui devolveria sempre o valor congelado da closure e o botão
   * não pararia nada — num disparo real isso são eventos que não deviam sair.
   */
  const cancelarLote = useRef(false);

  // Uma lista de Pixel so no produto inteiro (IA-R8). A leitura propria que
  // existia aqui foi eliminada: duas copias da mesma lista podem divergir na
  // mesma sessao, e destino errado num disparo real e venda no pixel errado.
  const marcas = useBrandStore((s) => s.marcas);
  const carregarMarcas = useBrandStore((s) => s.carregar);

  const carregarDoParser = useEventStore((s) => s.carregarDoParser);
  /**
   * Ids já vistos nesta sessão de tela. Serve para não avisar duas vezes o
   * mesmo webhook quando o GET de montagem e o `inicial` do SSE se cruzam.
   */
  const vistos = useRef<Set<string>>(new Set());
  const jaVisto = useCallback((lista: ItemInbox[]) => {
    const novos = lista.filter((i) => !vistos.current.has(i.id));
    for (const i of lista) vistos.current.add(i.id);
    return novos;
  }, []);

  const buscar = useCallback(async () => {
    try {
      const d = await pedir<{ itens: ItemInbox[] }>('/api/inbox', { cache: 'no-store' });
      jaVisto(d.itens ?? []);
      setItens((atuais) => mesclar(atuais, d.itens ?? []));
    } catch (e) {
      if (e instanceof SessaoExpirada) {
        setConexao('sessao-expirada');
      }
      /* servidor pode estar reiniciando: o SSE continua tentando */
    } finally {
      setCarregando(false);
    }
  }, [jaVisto]);

  // Conexão SSE resiliente: sonda de sessão, backoff, watchdog de pulso e
  // religação quando a aba volta ou a rede volta.
  useEffect(() => {
    let ativo = true;
    let es: EventSource | null = null;
    let timerReconexao: ReturnType<typeof setTimeout> | null = null;
    let atrasoReconexao = 2000;
    let ultimoSinal = Date.now();
    let recebeuInicial = false;

    const marcarSinal = () => {
      ultimoSinal = Date.now();
      setUltimoSinalEm(ultimoSinal);
    };

    const fechar = () => {
      if (es) {
        es.close();
        es = null;
      }
    };

    const agendar = (espera: number) => {
      if (timerReconexao) clearTimeout(timerReconexao);
      timerReconexao = setTimeout(() => {
        if (ativo) conectar();
      }, espera);
    };

    const conectar = () => {
      if (!ativo) return;
      // Uma reconexão em andamento cancela a agendada: senão o vigia e o
      // backoff abrem dois streams e cada webhook chegaria em duplicata.
      if (timerReconexao) {
        clearTimeout(timerReconexao);
        timerReconexao = null;
      }
      fechar();
      marcarSinal();
      es = new EventSource('/api/webhook/stream');

      es.onopen = () => {
        if (!ativo) return;
        marcarSinal();
        setConexao('conectado');
        atrasoReconexao = 2000;
      };

      es.onerror = async () => {
        if (!ativo) return;
        setCarregando(false);
        setConexao('reconectando');
        fechar();

        // Sonda a sessão: se expirou, pedir() leva para /login. Sem isto o feed
        // morria em silêncio, tentando reconectar para sempre num 401.
        try {
          await pedir('/api/sessao');
        } catch (e) {
          if (!ativo) return;
          if (e instanceof SessaoExpirada) {
            setConexao('sessao-expirada');
            return;
          }
        }
        if (!ativo) return;

        const espera = atrasoReconexao;
        atrasoReconexao = Math.min(atrasoReconexao * 2, 30_000);
        // Acima de 10s de espera, o selo passa a dizer "desconectado": manter
        // "reconectando" meio minuto inteiro seria decoração, não informação.
        if (espera >= 10_000) setConexao('desconectado');
        agendar(espera);
      };

      es.addEventListener('inicial', (e) => {
        if (!ativo) return;
        recebeuInicial = true;
        marcarSinal();
        setConexao('conectado');
        try {
          const lista = JSON.parse((e as MessageEvent).data) as ItemInbox[];
          jaVisto(lista);
          setItens((atuais) => mesclar(atuais, lista));
        } catch {
          /* payload malformado */
        }
        setCarregando(false);
      });

      es.addEventListener('entrada', (e) => {
        if (!ativo) return;
        marcarSinal();
        setConexao('conectado');
        try {
          const novo = JSON.parse((e as MessageEvent).data) as ItemInbox;
          const inedito = jaVisto([novo]).length > 0;
          setItens((atuais) => mesclar(atuais, [novo]));
          setCarregando(false);
          if (inedito) avisarChegada(novo);
        } catch {
          /* payload malformado */
        }
      });

      // Disparo automático ou de outra aba: o item já existe e muda de estado.
      es.addEventListener('atualizado', (e) => {
        if (!ativo) return;
        marcarSinal();
        try {
          const mudou = JSON.parse((e as MessageEvent).data) as ItemInbox;
          setItens((atuais) =>
            atuais.some((i) => i.id === mudou.id)
              ? atuais.map((i) => (i.id === mudou.id ? mudou : i))
              : mesclar(atuais, [mudou])
          );
        } catch {
          /* payload malformado */
        }
      });

      // Batimento do servidor. Sem ele não há como distinguir "silêncio porque
      // ninguém comprou" de "o proxy cortou a conexão e ninguém avisou".
      es.addEventListener('pulso', () => {
        if (!ativo) return;
        marcarSinal();
        setConexao('conectado');
      });
    };

    const vigia = setInterval(() => {
      if (!ativo) return;
      if (Date.now() - ultimoSinal < SILENCIO_MAXIMO_MS) return;
      // Nenhum pulso no prazo: o navegador acha que está conectado, mas o cano
      // está morto. Refaz sem esperar o onerror, que pode nunca vir.
      setConexao('reconectando');
      atrasoReconexao = 2000;
      conectar();
    }, 10_000);

    const acordar = () => {
      if (!ativo) return;
      if (document.visibilityState !== 'visible') return;
      if (conexaoViva(es) && Date.now() - ultimoSinal < SILENCIO_MAXIMO_MS) return;
      atrasoReconexao = 2000;
      conectar();
      void buscar();
    };

    conectar();

    // A lista não pode depender só do stream: se um proxy segurar o SSE num
    // buffer, o GET mostra o que já existe em vez de deixar "Carregando…" na
    // tela. Roda fora do corpo do efeito para não encadear render.
    const leituraDeApoio = setTimeout(() => {
      if (ativo) void buscar();
    }, 0);
    const redeDeSeguranca = setTimeout(() => {
      if (ativo && !recebeuInicial) void buscar();
    }, 5000);

    document.addEventListener('visibilitychange', acordar);
    window.addEventListener('online', acordar);

    return () => {
      ativo = false;
      clearTimeout(leituraDeApoio);
      clearTimeout(redeDeSeguranca);
      clearInterval(vigia);
      document.removeEventListener('visibilitychange', acordar);
      window.removeEventListener('online', acordar);
      if (timerReconexao) clearTimeout(timerReconexao);
      fechar();
    };
    // `tentativa` existe para o botão "Reconectar agora" refazer tudo do zero.
  }, [buscar, jaVisto, tentativa]);

  useEffect(() => {
    void carregarMarcas();
  }, [carregarMarcas]);

  const carregarNoFormulario = async (item: ItemInbox) => {
    try {
      const r = parseWebhook(JSON.stringify(item.payload));
      // zera o formulário antes de aplicar: nada do payload anterior sobrevive
      carregarDoParser(r.fields as never, r.eventName);
      await pedir('/api/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: 'carregado' }),
      });
      setItens((a) => a.map((i) => (i.id === item.id ? { ...i, status: 'carregado' } : i)));
      toast.success('Dados carregados no formulário', {
        description: `${r.preenchidos.length} campos preenchidos. Confira antes de disparar.`,
      });
      document
        .getElementById('secao-evento')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Não foi possível ler este payload', {
        description: e instanceof Error ? e.message : 'Formato não reconhecido.',
      });
    }
  };

  const abrirDisparo = (item: ItemInbox) => {
    setAlvo(item);
    setMarcasEscolhidas(['default']);
  };

  /**
   * UMA chamada = UM item. É a forma silenciosa do disparo manual: nenhum
   * toast, nenhuma mudança de estado de tela — só a ida ao servidor e a
   * resposta crua de volta.
   *
   * 🔴 Contrato medido de `POST /api/inbox/disparar` (`src/app/api/inbox/disparar/route.ts`),
   * que é o mesmo caminho do botão "Disparar direto" de uma linha:
   *
   *  • CORPO: `{ id: string, marcas?: string[], eventoMeta?: string }`.
   *    Sem `marcas`, a rota cai nas marcas da regra e, se não houver, em
   *    `['default']`. `eventoMeta` é obrigatório na prática — a rota recusa
   *    qualquer nome fora do padrão da Meta (`ehNomePadraoMeta`), porque nome
   *    livre vira evento personalizado com HTTP 200 que não otimiza campanha.
   *
   *  • SUCESSO: HTTP 200 `{ resultados: ResultadoDisparo[] }`, um resultado
   *    por Pixel. Aceito pela Meta = pelo menos um com `status: 'enviado'`.
   *
   *  • JÁ ENVIADO: também HTTP 200 — `{ resultados: [{ status: 'duplicado',
   *    erro: 'event_id já aceito pela Meta neste pixel.' }] }`. NÃO é erro: é o
   *    dedup (`jaEnviado`) segurando a conversão duplicada, exatamente o que se
   *    espera dele. O lote conta isso como "pulado". Mesma classificação vale
   *    para `teste-ignorado`, que é a trava de teste interno respondendo.
   *
   *  • RECUSA: HTTP 4xx com `{ erro: string }` — 404 item sumiu, 409 regra em
   *    Ignorar, 400 sem evento da Meta ou nome fora do padrão. O `pedir()`
   *    transforma isso em `ErroApi` com a mensagem do servidor.
   */
  const dispararUm = useCallback(
    (item: ItemInbox, marcasAlvo: string[]) =>
      pedir<{ resultados?: ResultadoDisparo[]; erro?: string }>('/api/inbox/disparar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          marcas: marcasAlvo,
          // Só o evento da Meta, nunca o nome de origem: mandar `ping` para a
          // CAPI criaria um evento personalizado com HTTP 200 e ninguém veria.
          eventoMeta: item.eventoMeta,
        }),
      }),
    []
  );

  const confirmarDisparo = async () => {
    if (!alvo?.eventoMeta) return;
    setDisparando(true);
    try {
      const d = await dispararUm(alvo, marcasEscolhidas);

      const enviados = (d.resultados ?? []).filter((x) => x.status === 'enviado');
      if (enviados.length) {
        toast.success(`Aceito pela Meta em ${enviados.length} pixel(s)`, {
          description: enviados
            .map(
              (x) =>
                `${nomeDoPixel(
                  marcas.find((m) => m.id === x.marcaId),
                  x.pixelId
                )}: ${x.httpStatus} · EMQ ${x.emq.toFixed(1)}`
            )
            .join(' · '),
        });
      } else {
        const primeiro = d.resultados?.[0];
        toast.warning('Nada foi enviado', {
          description: primeiro
            ? `${primeiro.status}${primeiro.erro ? ': ' + primeiro.erro : ''}`
            : 'Sem resultado.',
        });
      }
      setAlvo(null);
      void buscar();
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Falha ao disparar', {
        description: e instanceof Error ? e.message : 'Erro desconhecido.',
      });
    } finally {
      setDisparando(false);
    }
  };

  const limpar = async () => {
    try {
      // B11-b: apagar a caixa de entrada e irreversivel, entao a rota exige a
      // confirmacao explicita no corpo. Sem ela a resposta e 400, de proposito.
      await pedir('/api/inbox', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmar: true }),
      });
      setItens([]);
      toast.success('Caixa de entrada limpa.');
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Falha ao limpar a caixa de entrada.', {
        description: e instanceof Error ? e.message : '',
      });
    }
  };

  /* ------------------------------------------------------------------ */
  /* Recorte de EXIBIÇÃO — filtros                                       */
  /* ------------------------------------------------------------------ */

  /**
   * 🔴 No modo compacto (a caixa embutida na tela de disparo manual) a barra de
   * filtros não aparece — logo não há filtro para aplicar, e `visiveis` é a
   * lista inteira. Sem esta guarda, um filtro deixado ligado na tela grande
   * apareceria "vazando" para a tela inicial no próximo mount.
   */
  const visiveis = useMemo(
    () => (compacto ? itens : itens.filter((i) => passaFiltros(i, filtros))),
    [itens, filtros, compacto]
  );

  /** Os nomes de evento que REALMENTE chegaram, com quantos itens cada um tem. */
  const opcoesEvento = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const i of itens) {
      const n = nomeDoEvento(i);
      contagem.set(n, (contagem.get(n) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .map(([valor, total]) => ({ valor, total }))
      .sort((a, b) => a.valor.localeCompare(b.valor, 'pt-BR'));
  }, [itens]);

  /* ------------------------------------------------------------------ */
  /* Quem pode entrar no lote                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Duas travas em série, e nesta ordem:
   *
   * 1. `separarParaLote` (`src/lib/inbox-lote.ts`) — a autoridade. Ela barra
   *    o que já foi enviado, o que está marcado para ignorar e o teste interno
   *    da equipe (regra 4 do `CLAUDE.md`). Esta tela NÃO reimplementa nada
   *    disso: duas cópias da mesma regra viram duas respostas diferentes no dia
   *    em que uma mudar, e a resposta errada aqui custa dinheiro.
   *
   * 2. `podeDisparar` — a mesma função que decide se a LINHA ganha o botão
   *    "Disparar direto". O lote é esse botão repetido, então o conjunto dele
   *    não pode ser maior do que o conjunto de botões visíveis. Item sem evento
   *    padrão da Meta escolhido levaria 400 da rota; fica de fora com motivo
   *    próprio ('sem-evento-meta') em vez de virar erro no relatório.
   *
   * A trava 2 só EXCLUI — nunca reabilita algo que a trava 1 recusou.
   */
  const { elegiveis, fora } = useMemo(() => {
    const { elegiveis: passaram, excluidos } = separarParaLote(visiveis);
    return {
      elegiveis: passaram.filter(podeDisparar),
      fora: [
        ...excluidos.map((e) => ({ item: e.item, motivo: e.motivo as MotivoFora })),
        ...passaram
          .filter((i) => !podeDisparar(i))
          .map((item) => ({ item, motivo: 'sem-evento-meta' as MotivoFora })),
      ],
    };
  }, [visiveis]);

  /**
   * O lote, item por item, concorrência 1.
   *
   * 🔴 Nenhum evento é inventado aqui (regra 1 do `CLAUDE.md`, E-7 do plano):
   * o laço percorre itens que JÁ chegaram e chama a MESMA rota do botão da
   * linha, uma vez por item. Não há rota de lote, não se toca em `autoDisparo`,
   * não se usa `modo-por-marca` nem a fila — é o disparo manual de sempre,
   * repetido, com o operador vendo a contagem andar.
   *
   * Sequencial de propósito: paralelo multiplicaria o efeito de um erro de
   * seleção antes de dar tempo de alguém apertar "Parar", e tiraria a ordem
   * cronológica dos eventos que chegam ao Gerenciador.
   */
  const executarLote = useCallback(async () => {
    setLoteAberto(false);
    setResumoLote(null);
    cancelarLote.current = false;

    const fila = elegiveis;
    let p: ProgressoLote = { total: fila.length, feitos: 0, ok: 0, pulados: 0, erros: [] };
    setLote(p);

    for (const item of fila) {
      // Conferido ANTES de cada ida ao servidor: o item em voo termina, o
      // próximo não sai. "Parar" que não para é pior do que não ter botão.
      if (cancelarLote.current) break;
      const nome = item.eventoOrigem ?? item.evento ?? item.id;

      try {
        const d = await dispararUm(item, marcasDoLote);
        const r = d.resultados ?? [];
        if (r.some((x) => x.status === 'enviado')) {
          p = { ...p, ok: p.ok + 1 };
        } else if (
          // PULADO, não erro: `duplicado` é o dedup segurando uma conversão
          // que já foi (o console fez o certo), e `teste-ignorado` é a trava de
          // teste interno respondendo. Contar isso como falha faria o operador
          // tentar de novo — e tentar de novo é o caminho da venda duplicada.
          r.length > 0 &&
          r.every((x) => x.status === 'duplicado' || x.status === 'teste-ignorado')
        ) {
          p = { ...p, pulados: p.pulados + 1 };
        } else {
          const primeiro = r[0];
          p = {
            ...p,
            erros: [
              ...p.erros,
              {
                id: item.id,
                evento: nome,
                motivo: primeiro
                  ? `${ROTULO_RESULTADO[primeiro.status] ?? primeiro.status}${
                      primeiro.erro ? ': ' + primeiro.erro : ''
                    }`
                  : 'a rota respondeu sem resultado nenhum',
              },
            ],
          };
        }
      } catch (e) {
        // Sessão expirada: o `pedir()` já está levando para o /login. Insistir
        // com os itens restantes só encheria a tela de erro durante a saída.
        if (e instanceof SessaoExpirada) {
          cancelarLote.current = true;
          break;
        }
        p = {
          ...p,
          erros: [
            ...p.erros,
            {
              id: item.id,
              evento: nome,
              motivo: e instanceof Error ? e.message : 'Erro desconhecido',
            },
          ],
        };
      }

      p = { ...p, feitos: p.feitos + 1 };
      setLote(p);
    }

    const interrompido = cancelarLote.current;
    setLote(null);
    setResumoLote(p);

    const resumo = `${p.ok} ok · ${p.pulados} pulado${p.pulados === 1 ? '' : 's'} · ${
      p.erros.length
    } erro${p.erros.length === 1 ? '' : 's'}`;
    const titulo = `${p.feitos} de ${p.total} disparado${p.feitos === 1 ? '' : 's'}${
      interrompido ? ' (interrompido)' : ''
    }`;
    if (p.erros.length > 0) toast.warning(titulo, { description: resumo });
    else toast.success(titulo, { description: resumo });

    // O SSE já anuncia cada item atualizado; o GET é a rede de segurança para
    // quando o stream estiver preso num buffer de proxy.
    void buscar();
  }, [elegiveis, marcasDoLote, dispararUm, buscar]);

  const escolhidasEmProducao = marcas.filter(
    (m) => marcasEscolhidas.includes(m.id) && !m.testCode?.trim()
  );

  const aguardando = useMemo(() => itens.filter((i) => i.status === 'novo').length, [itens]);
  const parDoAlvo = alvo ? parMeta(alvo.eventoMeta) : null;
  const fase = useEscadaDeEspera(carregando);

  if (carregando) {
    // C-15: a escada decide o que aparece. Abaixo de 400ms, nada — a leitura do
    // /api/inbox costuma voltar antes disso e um flash de "Carregando…" so
    // comunicava lentidao inexistente. C-17: `carregando` so e verdadeiro no
    // primeiro mount, entao o esqueleto nunca cobre lista ja visivel.
    return (
      <RegiaoDeEspera
        rotulo="Carregando a caixa de entrada"
        className="flex flex-col gap-3"
      >
        {fase === 'spinner' && (
          <div className="flex items-center justify-center gap-2 rounded-panel border border-line bg-surface-1 p-8 text-caption text-fg-muted">
            <Spinner />
            Carregando…
          </div>
        )}
        {(fase === 'esqueleto' || fase === 'progresso') && (
          <>
            {/* C-16: a mesma geometria da linha real — cabecalho de contagem,
                depois tres cartoes com a altura de `LinhaEntrada`. */}
            <Esqueleto className="h-[18px] w-2/3" />
            <ul className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="flex flex-col gap-2 rounded-control border border-line-strong bg-surface-2 p-3"
                >
                  <Esqueleto className="h-[20px] w-3/4 bg-surface-3" />
                  <div className="flex gap-1.5">
                    <Esqueleto className="h-[18px] w-16 rounded-full bg-surface-3" />
                    <Esqueleto className="h-[18px] w-24 rounded-full bg-surface-3" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </RegiaoDeEspera>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SeloConexao estado={conexao} ultimoSinalEm={ultimoSinalEm} />
        <div className="flex items-center gap-1">
          {(conexao === 'desconectado' || conexao === 'sessao-expirada') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConexao('conectando');
                setTentativa((n) => n + 1);
                void buscar();
              }}
            >
              <PlugZap className="size-3.5" aria-hidden />
              Reconectar agora
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={buscar}>
            <RefreshCw className="size-3.5" aria-hidden />
            Atualizar
          </Button>
          {itens.length > 0 && (
            <Button size="sm" variant="ghost" onClick={limpar}>
              <Trash2 className="size-3.5" aria-hidden />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* 🔴 B.2.11: esta linha conta `itens`, NUNCA `visiveis`. O tamanho da
          fila é um fato do servidor; filtrar a tela não despacha nada, e um
          contador que encolhe com o filtro faria o operador achar que itens
          sumiram da caixa. */}
      {itens.length > 0 && (
        <p className="text-caption text-fg-muted">
          {itens.length} entrega{itens.length > 1 ? 's' : ''} nesta lista
          {aguardando > 0 ? ` · ${aguardando} ainda sem tratamento` : ''} · tudo o que chega
          aparece aqui, inclusive o que não vai para a Meta.
        </p>
      )}

      {/* B.3.21: no modo compacto não há barra de filtros nem lote. Aquela é a
          prévia da tela inicial — quem vai disparar em série abre a caixa
          inteira, onde a confirmação e o relatório cabem na tela. */}
      {!compacto && itens.length > 0 && (
        <FiltrosInbox
          valor={filtros}
          onValor={setFiltros}
          opcoesEvento={opcoesEvento}
          totalItens={itens.length}
          totalVisiveis={visiveis.length}
          totalElegiveis={elegiveis.length}
          lote={lote}
          onAbrirLote={() => setLoteAberto(true)}
          onPararLote={() => {
            cancelarLote.current = true;
          }}
        />
      )}

      {!compacto && resumoLote && resumoLote.erros.length > 0 && (
        <Callout
          tone="danger"
          icon={AlertTriangle}
          title={`${resumoLote.erros.length} evento(s) não saíram`}
        >
          <ul className="flex flex-col gap-1">
            {resumoLote.erros.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-fg-body">{e.evento}</span>
                <span>{e.motivo}</span>
                <button
                  type="button"
                  className="text-accent-text underline underline-offset-2"
                  onClick={() => {
                    const achado = itens.find((i) => i.id === e.id);
                    if (achado) setPayloadAberto(achado);
                  }}
                >
                  Ver payload
                </button>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => setResumoLote(null)}
          >
            Dispensar
          </Button>
        </Callout>
      )}

      {itens.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum webhook recebido"
          motivo={
            <>
              A plataforma ainda não apontou para este console, ou nenhuma venda entrou
              desde então. Enquanto isso, use a aba <strong>Colar JSON</strong> ou
              preencha os campos abaixo.
            </>
          }
          acao={
            <Button variant="outline" render={<Link href="/automatico" />}>
              <Workflow className="size-4" aria-hidden />
              Configurar o endpoint
            </Button>
          }
        />
      ) : visiveis.length === 0 ? (
        // Lista cheia e tela vazia é o momento em que se acha que o console
        // perdeu a venda. O estado vazio do filtro diz que o problema é o
        // recorte, e oferece o caminho de volta num clique.
        <EstadoVazio
          titulo="Nenhum evento com este filtro"
          motivo={
            <>
              As {itens.length} entregas continuam na caixa — só nenhuma casa com{' '}
              <strong>{descreverFiltros(filtros)}</strong>
            </>
          }
          acao={
            <Button variant="outline" onClick={() => setFiltros(FILTROS_VAZIOS)}>
              <MousePointerClick className="size-4" aria-hidden />
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {visiveis.slice(0, compacto ? 5 : 50).map((item, i) => (
              <ItemDeLista key={item.id} indice={i}>
                <LinhaEntrada
                  item={item}
                  marcas={marcas}
                  aoCarregar={() => carregarNoFormulario(item)}
                  aoDisparar={() => abrirDisparo(item)}
                  aoVerPayload={() => setPayloadAberto(item)}
                />
              </ItemDeLista>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {compacto && itens.length > 5 && (
        <Callout tone="info">
          Mostrando os 5 mais recentes de {itens.length}. A lista completa está em Integrações.
        </Callout>
      )}

      <Dialog open={alvo !== null} onOpenChange={(v) => !v && setAlvo(null)}>
        <DialogContent
          variant="console"
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-heading font-semibold text-fg-strong">
              <Send className="size-5 text-accent-text" aria-hidden />
              Enviar como {parDoAlvo?.pt ?? 'evento'}
            </DialogTitle>
            <DialogDescription className="text-caption text-fg-muted">
              {alvo?.eventoOrigem ? `${alvo.eventoOrigem} → ` : ''}
              <span className="font-mono">{parDoAlvo?.tecnico ?? '—'}</span>
              {' · '}
              {dinheiro(alvo?.valor, alvo?.moeda)}
              {alvo?.emailMascarado ? ` · ${alvo.emailMascarado}` : ''}
              {alvo?.orderId ? ` · pedido ${alvo.orderId}` : ''}
            </DialogDescription>
          </DialogHeader>

          <p className="rounded-control border border-line-strong bg-surface-2 p-2.5 text-caption text-fg-muted">
            No Gerenciador de Eventos isto aparece com o nome{' '}
            <span className="font-mono text-fg-body">{parDoAlvo?.tecnico ?? '—'}</span>.{' '}
            {parDoAlvo?.descricao}
          </p>

          <SeletorDePixel
            modo="varios"
            rotulo="Pixels de destino"
            valor={marcasEscolhidas}
            onChange={setMarcasEscolhidas}
          />

          {alvo?.testeInterno && (
            <Callout tone="warning" icon={FlaskConical} title="Isto parece teste da equipe">
              Cupom de R$ 0,01 ou e-mail de teste. Enviar mistura teste com métrica real.
            </Callout>
          )}

          {escolhidasEmProducao.length > 0 && (
            <Callout tone="danger" icon={AlertTriangle} title="Isto entra nas métricas reais">
              {escolhidasEmProducao.map((m) => m.nome).join(', ')} está sem Código de teste. O
              evento vai contar como conversão de verdade na campanha.
            </Callout>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarDisparo}
              disabled={disparando || marcasEscolhidas.length === 0 || !alvo?.eventoMeta}
            >
              <Send className="size-4" aria-hidden />
              {disparando ? 'Enviando…' : 'Enviar para a Meta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JSON cru, sem máscara — o oposto da linha, que segue mascarando o
          e-mail. Ver B.2.13 e o cabeçalho de `DialogoPayload.tsx`. */}
      <DialogoPayload item={payloadAberto} onFechar={() => setPayloadAberto(null)} />

      <DialogoLote
        aberto={loteAberto}
        onFechar={() => setLoteAberto(false)}
        elegiveis={elegiveis}
        fora={fora}
        descricaoFiltro={descreverFiltros(filtros)}
        marcasEscolhidas={marcasDoLote}
        onMarcas={setMarcasDoLote}
        onConfirmar={() => void executarLote()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Selo de conexão — diz o estado real, com o horário do último sinal   */
/* ------------------------------------------------------------------ */

function SeloConexao({
  estado,
  ultimoSinalEm,
}: {
  estado: EstadoConexao;
  ultimoSinalEm: number | null;
}) {
  const desde = ultimoSinalEm
    ? new Date(ultimoSinalEm).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  if (estado === 'sessao-expirada') {
    return (
      <StatusDot tone="danger" icon={WifiOff}>
        Sessão expirada — entre de novo para voltar a ouvir
      </StatusDot>
    );
  }
  if (estado === 'conectado') {
    return (
      <StatusDot tone="success" icon={Radio}>
        Ouvindo em tempo real{desde ? ` · último sinal ${desde}` : ''}
      </StatusDot>
    );
  }
  if (estado === 'conectando') {
    return (
      <StatusDot tone="neutral" icon={PlugZap}>
        Abrindo a conexão ao vivo…
      </StatusDot>
    );
  }
  if (estado === 'reconectando') {
    return (
      <StatusDot tone="warning" icon={PlugZap}>
        Conexão caiu — reconectando{desde ? ` · último sinal ${desde}` : ''}
      </StatusDot>
    );
  }
  return (
    <StatusDot tone="danger" icon={WifiOff}>
      Desconectado — a lista pode estar atrasada
      {desde ? ` · último sinal ${desde}` : ''}
    </StatusDot>
  );
}

/* ------------------------------------------------------------------ */
/* Linha da caixa de entrada                                           */
/* ------------------------------------------------------------------ */

function LinhaEntrada({
  item,
  marcas,
  aoCarregar,
  aoDisparar,
  aoVerPayload,
}: {
  item: ItemInbox;
  marcas: MarcaPublica[];
  aoCarregar: () => void;
  aoDisparar: () => void;
  aoVerPayload: () => void;
}) {
  const naoLido = ehNaoLido(item);
  const teste = item.testePlataforma || item.classificacao === 'teste-plataforma';
  const par = parMeta(item.eventoMeta);
  const parSugerido = parMeta(item.eventoMetaSugerido);
  const vaiParaMeta = Boolean(par) && item.modo !== 'ignorar' && item.status !== 'ignorado';
  const classificacao = item.classificacao ? TEXTO_CLASSIFICACAO[item.classificacao] : null;
  const motivo = vaiParaMeta
    ? null
    : motivoLegivel({
        eventoOrigem: item.eventoOrigem,
        classificacao: item.classificacao,
        motivoIgnorar: item.motivoIgnorar,
        testePlataforma: item.testePlataforma,
      });

  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-x-4 gap-y-2 rounded-control border bg-surface-2 p-3',
        item.status === 'novo' ? 'border-accent-text/40' : 'border-line-strong',
        naoLido && 'border-danger/40'
      )}
    >
      <div className="min-w-0 flex-1">
        {/* O par: o que a plataforma mandou → o que a Meta recebe. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Por onde o evento entrou. Era "xWinner" fixo aqui: a caixa passou
              a receber também a tag do site, e nome de plataforma fixo no
              código mente em metade das linhas. */}
          <span className="text-caption text-fg-muted uppercase">
            {item.origem === 'tag' ? 'Tag' : 'Webhook'}
          </span>
          <span className="font-mono text-label text-fg-body">
            {item.eventoOrigem ?? item.evento ?? 'sem nome de evento'}
          </span>
          <ArrowRight className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
          {par ? (
            <>
              <span className="text-caption text-fg-muted uppercase">Meta</span>
              <span className="text-label font-semibold text-fg-strong">{par.pt}</span>
              <span className="font-mono text-caption text-fg-muted">{par.tecnico}</span>
              {!par.padrao && <StatusDot tone="warning">fora do padrão da Meta</StatusDot>}
            </>
          ) : teste ? (
            <span className="inline-flex items-center gap-1.5 text-label font-semibold text-accent-text">
              <FlaskConical className="size-3.5" aria-hidden />
              teste de conexão — nada a enviar
            </span>
          ) : naoLido ? (
            <span className="inline-flex items-center gap-1.5 text-label font-semibold text-danger">
              <FileWarning className="size-3.5" aria-hidden />
              corpo não pôde ser lido
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-label font-semibold text-fg-muted">
              <Ban className="size-3.5" aria-hidden />
              não enviar
            </span>
          )}
          <span className="text-label text-fg-body tabular">{dinheiro(item.valor, item.moeda)}</span>
        </div>

        {/* Selos de estado. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {item.status === 'novo' && (
            <Badge variant="info">novo</Badge>
          )}
          {item.status === 'carregado' && (
            <Badge>carregado no formulário</Badge>
          )}
          {item.status === 'disparado' && (
            <Badge variant="sucesso">enviado à Meta</Badge>
          )}
          {item.modo && (
            <Badge>{ROTULO_MODO[item.modo]}</Badge>
          )}
          {item.testeInterno && (
            <StatusDot tone="warning" icon={FlaskConical}>
              teste da equipe
            </StatusDot>
          )}
          {item.classificacao === 'desconhecido' && (
            <StatusDot tone="warning" icon={HelpCircle}>
              nome novo, sem regra
            </StatusDot>
          )}
          {item.rotuloDivergente && (
            <StatusDot tone="warning">
              chegou por um apelido antigo{item.rotuloRecebido ? `: ${item.rotuloRecebido}` : ''}
            </StatusDot>
          )}
        </div>

        {/* O motivo, com todas as letras: "IGNORAR" sozinho não explica nada. */}
        {motivo && (
          <p className="mt-1.5 text-caption text-fg-muted">
            {classificacao ? <span className="text-fg-body">{classificacao.rotulo}. </span> : null}
            {motivo}
          </p>
        )}

        {parSugerido && !par && (
          <p className="mt-1 text-caption text-fg-muted">
            Palpite: pareceria{' '}
            <span className="font-mono text-fg-body">{parSugerido.tecnico}</span> ({parSugerido.pt}).
            Nada é enviado por palpite — crie a regra na aba Regras para valer.
          </p>
        )}

        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-muted">
          <span className="tabular">{hora(item.recebidoEm)}</span>
          {/* Nome inteiro, e-mail mascarado: foi o pedido literal do dono. Dá
              para reconhecer o cliente sem o endereço completo aberto na tela. */}
          {item.nomeCliente && <span className="text-fg-strong">{item.nomeCliente}</span>}
          {item.emailMascarado && <span>{item.emailMascarado}</span>}
          {item.orderId && <span className="font-mono">pedido {item.orderId}</span>}
          {!naoLido && (
            <StatusDot tone={item.temFbc ? 'success' : 'danger'}>
              {item.temFbc ? 'com fbc' : 'sem fbc'}
            </StatusDot>
          )}
          {/* Só quando existe: um "sem fbclid" em toda linha de venda orgânica
              viraria ruído vermelho constante. A ausência já é dita pelo fbc. */}
          {!naoLido && item.temFbclid && <StatusDot tone="success">fbclid</StatusDot>}
          {!naoLido && item.temGclid && <StatusDot tone="neutral">gclid</StatusDot>}
          {item.formato && <span>{FORMATO_TEXTO[item.formato]}</span>}
          {item.emq !== undefined && <span className="tabular">EMQ {item.emq.toFixed(1)}</span>}
        </p>

        {item.resultados && item.resultados.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
            {item.resultados.map((r, j) => (
              <li
                key={`${r.marcaId}-${j}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption"
              >
                <StatusDot tone={TOM_RESULTADO[r.status]}>
                  {nomeDoPixel(marcas.find((m) => m.id === r.marcaId), r.pixelId)} ·{' '}
                  {ROTULO_RESULTADO[r.status] ?? r.status}
                </StatusDot>
                {r.httpStatus ? (
                  <span className="font-mono text-fg-muted tabular">{r.httpStatus}</span>
                ) : null}
                {r.fbtraceId && (
                  <span className="font-mono text-caption text-fg-muted">
                    fbtrace {r.fbtraceId.slice(0, 12)}…
                  </span>
                )}
                {r.modoTeste && (
                  <Badge variant="aviso">teste</Badge>
                )}
                {r.herdados.length > 0 && (
                  <span className="text-fg-muted">
                    herdou {r.herdados.join(', ')} do pré-checkout
                  </span>
                )}
                {r.erro && <span className="text-danger">{r.erro}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Sempre presente, inclusive no item que não pôde ser lido — é
            justamente nele que ver o corpo cru resolve o problema. */}
        <Button size="sm" variant="ghost" onClick={aoVerPayload}>
          <FileJson className="size-3.5" aria-hidden />
          Ver payload
        </Button>
        {!naoLido && (
          <Button size="sm" variant="outline" onClick={aoCarregar}>
            <ArrowDownToLine className="size-3.5" aria-hidden />
            Carregar no formulário
          </Button>
        )}
        {podeDisparar(item) && (
          <Button size="sm" onClick={aoDisparar}>
            <Send className="size-3.5" aria-hidden />
            Disparar direto
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Avisos de chegada                                                   */
/* ------------------------------------------------------------------ */

/** true enquanto o EventSource ainda está aberto ou negociando. */
function conexaoViva(es: EventSource | null): boolean {
  return es !== null && es.readyState !== 2; // 2 = CLOSED
}

/**
 * Cada chegada tem seu aviso — e cada aviso diz para onde aquilo vai. Um
 * "Webhook recebido" igual para venda e para ping é o que fazia o operador
 * achar que a tela estava quebrada.
 */
function avisarChegada(item: ItemInbox) {
  const nome = item.eventoOrigem ?? item.evento ?? 'evento sem nome';

  if (ehNaoLido(item)) {
    toast.warning('Chegou algo que não deu para ler', {
      description: 'O corpo não é JSON válido ou passou de 1 MB. Está na lista para conferência.',
    });
    return;
  }

  if (item.testePlataforma || item.classificacao === 'teste-plataforma') {
    toast('Teste de conexão da plataforma', {
      description: `${nome} · a entrega chegou certa. Não é venda, nada vai para a Meta.`,
    });
    return;
  }

  const par = parMeta(item.eventoMeta);
  if (par && item.modo !== 'ignorar' && item.status !== 'ignorado') {
    toast.success(`${nome} → ${par.tecnico}`, {
      description: `${par.pt} · ${dinheiro(item.valor, item.moeda)}${
        item.modo === 'fila' ? ' · na fila, esperando você' : ''
      }`,
    });
    return;
  }

  toast(`${nome} recebido`, {
    description: motivoLegivel({
      eventoOrigem: item.eventoOrigem,
      classificacao: item.classificacao,
      motivoIgnorar: item.motivoIgnorar,
      testePlataforma: item.testePlataforma,
    }),
  });
}

export default InboxList;
