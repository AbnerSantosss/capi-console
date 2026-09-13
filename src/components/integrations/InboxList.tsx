'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Inbox,
  Radio,
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
  HelpCircle,
} from 'lucide-react';

import { useEventStore } from '@/stores/useEventStore';
import { parseWebhook, type ClassificacaoEvento, type MotivoIgnorar } from '@/lib/parser';
import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusDot, Callout } from '@/components/common/primitives';
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
import { motivoLegivel, parMeta, TEXTO_CLASSIFICACAO } from './eventos-legiveis';

interface ResultadoDisparo {
  marcaId: string;
  pixelId: string;
  status: 'enviado' | 'duplicado' | 'invalido' | 'erro' | 'teste-ignorado' | 'sem-token';
  httpStatus?: number;
  eventsReceived?: number;
  fbtraceId?: string;
  erro?: string;
  modoTeste: boolean;
  herdados: string[];
  emq: number;
}

interface ItemInbox {
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
  orderId?: string;
  temFbc: boolean;
  temFbp: boolean;
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

interface MarcaPublica {
  id: string;
  nome: string;
  pixelId: string;
  temToken: boolean;
  testCode: string;
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
};

const FORMATO_TEXTO: Record<'A' | 'B' | 'outro', string> = {
  A: 'formato xWinner',
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
  const [marcas, setMarcas] = useState<MarcaPublica[]>([]);
  const [alvo, setAlvo] = useState<ItemInbox | null>(null);
  const [marcasEscolhidas, setMarcasEscolhidas] = useState<string[]>([]);
  const [disparando, setDisparando] = useState(false);
  /** Incrementar força o efeito do SSE a refazer a conexão do zero. */
  const [tentativa, setTentativa] = useState(0);

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
    pedir<{ marcas: MarcaPublica[] }>('/api/marcas', { cache: 'no-store' })
      .then((d) => setMarcas(d.marcas ?? []))
      .catch(() => setMarcas([]));
  }, []);

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

  const confirmarDisparo = async () => {
    if (!alvo?.eventoMeta) return;
    setDisparando(true);
    try {
      const d = await pedir<{ resultados?: ResultadoDisparo[]; erro?: string }>(
        '/api/inbox/disparar',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: alvo.id,
            marcas: marcasEscolhidas,
            // Só o evento da Meta, nunca o nome de origem: mandar `ping` para a
            // CAPI criaria um evento personalizado com HTTP 200 e ninguém veria.
            eventoMeta: alvo.eventoMeta,
          }),
        }
      );

      const enviados = (d.resultados ?? []).filter((x) => x.status === 'enviado');
      if (enviados.length) {
        toast.success(`Aceito pela Meta em ${enviados.length} pixel(s)`, {
          description: enviados
            .map((x) => `${x.marcaId}: ${x.httpStatus} · EMQ ${x.emq.toFixed(1)}`)
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
      await pedir('/api/inbox', { method: 'DELETE' });
      setItens([]);
      toast.success('Caixa de entrada limpa.');
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Falha ao limpar a caixa de entrada.', {
        description: e instanceof Error ? e.message : '',
      });
    }
  };

  const escolhidasEmProducao = marcas.filter(
    (m) => marcasEscolhidas.includes(m.id) && !m.testCode?.trim()
  );

  const aguardando = useMemo(() => itens.filter((i) => i.status === 'novo').length, [itens]);
  const parDoAlvo = alvo ? parMeta(alvo.eventoMeta) : null;

  if (carregando) {
    return (
      <div className="rounded-panel border border-line bg-surface-1 p-8 text-center text-caption text-fg-muted">
        Carregando…
      </div>
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

      {itens.length > 0 && (
        <p className="text-caption text-fg-muted">
          {itens.length} entrega{itens.length > 1 ? 's' : ''} nesta lista
          {aguardando > 0 ? ` · ${aguardando} ainda sem tratamento` : ''} · tudo o que chega
          aparece aqui, inclusive o que não vai para a Meta.
        </p>
      )}

      {itens.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong bg-surface-1 p-8 text-center">
          <Inbox className="mx-auto size-8 text-fg-disabled" aria-hidden />
          <p className="mt-3 text-label font-medium text-fg-body">Nenhum webhook recebido</p>
          <p className="mx-auto mt-1 max-w-md text-caption text-fg-muted">
            Configure o endpoint em <strong>Integrações</strong> e aponte o xWinner para cá.
            Enquanto isso, use a aba <strong>Colar JSON</strong> ou preencha os campos abaixo.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {itens.slice(0, compacto ? 5 : 50).map((item, i) => (
              <ItemDeLista key={item.id} indice={i}>
                <LinhaEntrada
                  item={item}
                  marcas={marcas}
                  aoCarregar={() => carregarNoFormulario(item)}
                  aoDisparar={() => abrirDisparo(item)}
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

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label font-medium text-fg-body">Pixels de destino</legend>
            {marcas.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-control border border-line-strong bg-surface-2 p-2.5 text-caption text-fg-body"
              >
                <Checkbox
                  checked={marcasEscolhidas.includes(m.id)}
                  onCheckedChange={(v) =>
                    setMarcasEscolhidas((a) => (v ? [...a, m.id] : a.filter((x) => x !== m.id)))
                  }
                />
                <span className="flex-1">{m.nome}</span>
                <span className="font-mono text-caption text-fg-muted">{m.pixelId}</span>
                {m.testCode?.trim() ? (
                  <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-caption font-semibold text-warning uppercase">
                    teste
                  </span>
                ) : null}
              </label>
            ))}
          </fieldset>

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
}: {
  item: ItemInbox;
  marcas: MarcaPublica[];
  aoCarregar: () => void;
  aoDisparar: () => void;
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
          <span className="text-caption text-fg-muted uppercase">xWinner</span>
          <span className="font-mono text-label text-fg-body">
            {item.eventoOrigem ?? item.evento ?? 'sem nome de evento'}
          </span>
          <ArrowRight className="size-3.5 shrink-0 text-fg-disabled" aria-hidden />
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
            <span className="rounded-full border border-accent-text/40 bg-accent-text/10 px-2 py-0.5 text-caption font-semibold text-accent-text uppercase">
              novo
            </span>
          )}
          {item.status === 'carregado' && (
            <span className="rounded-full border border-line-strong px-2 py-0.5 text-caption text-fg-muted uppercase">
              carregado no formulário
            </span>
          )}
          {item.status === 'disparado' && (
            <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-caption font-semibold text-success uppercase">
              enviado à Meta
            </span>
          )}
          {item.modo && (
            <span className="rounded-full border border-line-strong px-2 py-0.5 text-caption text-fg-muted uppercase">
              {ROTULO_MODO[item.modo]}
            </span>
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
          {item.emailMascarado && <span>{item.emailMascarado}</span>}
          {item.orderId && <span className="font-mono">pedido {item.orderId}</span>}
          {!naoLido && (
            <StatusDot tone={item.temFbc ? 'success' : 'danger'}>
              {item.temFbc ? 'com fbc' : 'sem fbc'}
            </StatusDot>
          )}
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
                  {marcas.find((m) => m.id === r.marcaId)?.nome ?? r.marcaId} · {r.status}
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
                  <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-caption font-semibold text-warning uppercase">
                    teste
                  </span>
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
    toast('Teste de conexão do xWinner', {
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
