'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Inbox,
  Radio,
  RefreshCw,
  Trash2,
  ArrowDownToLine,
  CircleDot,
  Send,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

import { useEventStore } from '@/stores/useEventStore';
import { parseWebhook } from '@/lib/parser';
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
}

interface MarcaPublica {
  id: string;
  nome: string;
  pixelId: string;
  temToken: boolean;
  testCode: string;
}

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
  auto: 'automático',
  fila: 'fila',
  ignorar: 'ignorar',
};

const TOM_RESULTADO: Record<ResultadoDisparo['status'], 'success' | 'danger' | 'neutral'> = {
  enviado: 'success',
  duplicado: 'neutral',
  'teste-ignorado': 'neutral',
  invalido: 'danger',
  erro: 'danger',
  'sem-token': 'danger',
};

export function InboxList({ compacto = false }: { compacto?: boolean }) {
  const [itens, setItens] = useState<ItemInbox[]>([]);
  const [aoVivo, setAoVivo] = useState(false);
  const [tentandoReconectar, setTentandoReconectar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [marcas, setMarcas] = useState<MarcaPublica[]>([]);
  const [alvo, setAlvo] = useState<ItemInbox | null>(null);
  const [marcasEscolhidas, setMarcasEscolhidas] = useState<string[]>([]);
  const [disparando, setDisparando] = useState(false);

  const carregarDoParser = useEventStore((s) => s.carregarDoParser);

  const buscar = useCallback(async () => {
    try {
      const d = await pedir<{ itens: ItemInbox[] }>('/api/inbox', { cache: 'no-store' });
      setItens(d.itens ?? []);
    } catch {
      /* servidor pode estar reiniciando ou offline */
    } finally {
      setCarregando(false);
    }
  }, []);

  // D9: Conexão SSE resiliente com sonda de autenticação e backoff
  useEffect(() => {
    let ativo = true;
    let es: EventSource | null = null;
    let timerReconexao: ReturnType<typeof setTimeout> | null = null;
    let atrasoReconexao = 2000;

    const conectar = () => {
      if (!ativo) return;
      es = new EventSource('/api/webhook/stream');

      es.onopen = () => {
        if (!ativo) return;
        setAoVivo(true);
        setTentandoReconectar(false);
        atrasoReconexao = 2000;
      };

      es.onerror = async () => {
        if (!ativo) return;
        setAoVivo(false);
        setCarregando(false);
        setTentandoReconectar(true);
        if (es) {
          es.close();
          es = null;
        }

        // Sonda a sessão: se expirada, pedir() redireciona para /login
        try {
          await pedir('/api/sessao');
        } catch (e) {
          if (e instanceof SessaoExpirada) {
            return;
          }
        }

        // Reconexão com backoff (2s, 4s, 8s... até 30s)
        const espera = atrasoReconexao;
        atrasoReconexao = Math.min(atrasoReconexao * 2, 30_000);
        timerReconexao = setTimeout(() => {
          if (ativo) conectar();
        }, espera);
      };

      es.addEventListener('inicial', (e) => {
        try {
          setItens(JSON.parse((e as MessageEvent).data));
          setCarregando(false);
        } catch {
          /* payload malformado */
        }
      });

      es.addEventListener('entrada', (e) => {
        try {
          const novo = JSON.parse((e as MessageEvent).data) as ItemInbox;
          setItens((atuais) => [novo, ...atuais].slice(0, 50));
          toast.info('Webhook recebido', {
            description: `${novo.evento ?? 'evento'} · ${dinheiro(novo.valor, novo.moeda)}`,
          });
        } catch {
          /* payload malformado */
        }
      });

      // Disparo automático ou de outra aba: o item já existe e muda de estado
      es.addEventListener('atualizado', (e) => {
        try {
          const mudou = JSON.parse((e as MessageEvent).data) as ItemInbox;
          setItens((atuais) => atuais.map((i) => (i.id === mudou.id ? mudou : i)));
        } catch {
          /* payload malformado */
        }
      });
    };

    conectar();

    return () => {
      ativo = false;
      if (timerReconexao) clearTimeout(timerReconexao);
      if (es) es.close();
    };
  }, []);

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
      setItens((a) =>
        a.map((i) => (i.id === item.id ? { ...i, status: 'carregado' } : i))
      );
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
    if (!alvo) return;
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
            eventoMeta: alvo.eventoMeta ?? alvo.evento,
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
        <StatusDot
          tone={aoVivo ? 'success' : tentandoReconectar ? 'warning' : 'neutral'}
          icon={aoVivo ? Radio : CircleDot}
        >
          {aoVivo
            ? 'Ouvindo em tempo real'
            : tentandoReconectar
            ? 'Sem conexão ao vivo — tentando reconectar…'
            : 'Sem conexão ao vivo'}
        </StatusDot>
        <div className="flex items-center gap-1">
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

      {itens.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong bg-surface-1 p-8 text-center">
          <Inbox className="mx-auto size-8 text-fg-disabled" aria-hidden />
          <p className="mt-3 text-label font-medium text-fg-body">
            Nenhum webhook recebido
          </p>
          <p className="mx-auto mt-1 max-w-md text-caption text-fg-muted">
            Configure o endpoint em <strong>Integrações</strong> e aponte o n8n
            para cá. Enquanto isso, use a aba <strong>Colar JSON</strong> ou
            preencha os campos abaixo.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
          {itens.slice(0, compacto ? 5 : 50).map((item, i) => {
            const ignorado = item.status === 'ignorado' || item.modo === 'ignorar';
            return (
            <ItemDeLista key={item.id} indice={i}>
              <div
                className={cn(
                  'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control border bg-surface-2 p-3',
                  item.status === 'novo'
                    ? 'border-accent-text/40'
                    : 'border-line-strong',
                  ignorado && 'opacity-60'
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    {item.eventoOrigem && (
                      <>
                        <span className="font-mono text-caption text-fg-muted">
                          {item.eventoOrigem}
                        </span>
                        <ArrowRight className="size-3 text-fg-disabled" aria-hidden />
                      </>
                    )}
                    <span className="font-mono text-label font-semibold text-fg-strong">
                      {item.eventoMeta ?? item.evento ?? 'evento'}
                    </span>
                    <span className="text-label text-fg-body tabular">
                      {dinheiro(item.valor, item.moeda)}
                    </span>
                    {item.modo && (
                      <span className="rounded-full border border-line-strong px-2 py-0.5 text-micro text-fg-muted uppercase">
                        {ROTULO_MODO[item.modo]}
                      </span>
                    )}
                    {item.status === 'novo' && (
                      <span className="rounded-full border border-accent-text/40 bg-accent-text/10 px-2 py-0.5 text-micro font-semibold text-accent-text uppercase">
                        novo
                      </span>
                    )}
                    {item.status === 'carregado' && (
                      <span className="rounded-full border border-line-strong px-2 py-0.5 text-micro text-fg-muted uppercase">
                        carregado
                      </span>
                    )}
                    {item.status === 'disparado' && (
                      <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-micro font-semibold text-success uppercase">
                        disparado
                      </span>
                    )}
                    {item.conhecido === false && item.eventoOrigem && (
                      <StatusDot tone="warning">nome fora do catálogo</StatusDot>
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-muted">
                    <span className="tabular">{hora(item.recebidoEm)}</span>
                    {item.emailMascarado && <span>{item.emailMascarado}</span>}
                    {item.orderId && (
                      <span className="font-mono">pedido {item.orderId}</span>
                    )}
                    <StatusDot tone={item.temFbc ? 'success' : 'danger'}>
                      {item.temFbc ? 'com fbc' : 'sem fbc'}
                    </StatusDot>
                    {item.emq !== undefined && (
                      <span className="tabular">EMQ {item.emq.toFixed(1)}</span>
                    )}
                  </p>

                  {item.resultados && item.resultados.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                      {item.resultados.map((r, j) => (
                        <li
                          key={`${r.marcaId}-${j}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption"
                        >
                          <StatusDot tone={TOM_RESULTADO[r.status]}>
                            {marcas.find((m) => m.id === r.marcaId)?.nome ?? r.marcaId} ·{' '}
                            {r.status}
                          </StatusDot>
                          {r.httpStatus ? (
                            <span className="font-mono text-fg-muted tabular">
                              {r.httpStatus}
                            </span>
                          ) : null}
                          {r.fbtraceId && (
                            <span className="font-mono text-micro text-fg-muted">
                              fbtrace {r.fbtraceId.slice(0, 12)}…
                            </span>
                          )}
                          {r.modoTeste && (
                            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-micro font-semibold text-warning uppercase">
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => carregarNoFormulario(item)}
                  >
                    <ArrowDownToLine className="size-3.5" aria-hidden />
                    Carregar no formulário
                  </Button>
                  {!ignorado && (
                    <Button size="sm" onClick={() => abrirDisparo(item)}>
                      <Send className="size-3.5" aria-hidden />
                      Disparar direto
                    </Button>
                  )}
                </div>
              </div>
            </ItemDeLista>
            );
          })}
          </AnimatePresence>
        </ul>
      )}

      {compacto && itens.length > 5 && (
        <Callout tone="info">
          Mostrando os 5 mais recentes de {itens.length}. A lista completa está em
          Integrações.
        </Callout>
      )}

      <Dialog open={alvo !== null} onOpenChange={(v) => !v && setAlvo(null)}>
        <DialogContent variant="console" className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-heading font-semibold text-fg-strong">
              <Send className="size-5 text-accent-text" aria-hidden />
              Disparar {alvo?.eventoMeta ?? alvo?.evento}
            </DialogTitle>
            <DialogDescription className="text-caption text-fg-muted">
              {dinheiro(alvo?.valor, alvo?.moeda)}
              {alvo?.emailMascarado ? ` · ${alvo.emailMascarado}` : ''}
              {alvo?.orderId ? ` · pedido ${alvo.orderId}` : ''}
            </DialogDescription>
          </DialogHeader>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label font-medium text-fg-body">
              Pixels de destino
            </legend>
            {marcas.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-control border border-line-strong bg-surface-2 p-2.5 text-caption text-fg-body"
              >
                <Checkbox
                  checked={marcasEscolhidas.includes(m.id)}
                  onCheckedChange={(v) =>
                    setMarcasEscolhidas((a) =>
                      v ? [...a, m.id] : a.filter((x) => x !== m.id)
                    )
                  }
                />
                <span className="flex-1">{m.nome}</span>
                <span className="font-mono text-micro text-fg-muted">{m.pixelId}</span>
                {m.testCode?.trim() ? (
                  <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-micro font-semibold text-warning uppercase">
                    teste
                  </span>
                ) : null}
              </label>
            ))}
          </fieldset>

          {escolhidasEmProducao.length > 0 && (
            <Callout tone="danger" icon={AlertTriangle} title="Isto entra nas métricas reais">
              {escolhidasEmProducao.map((m) => m.nome).join(', ')} está sem Código
              de teste. O evento vai contar como conversão de verdade na campanha.
            </Callout>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarDisparo}
              disabled={disparando || marcasEscolhidas.length === 0}
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

export default InboxList;
