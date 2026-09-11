'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  GitBranch,
  History,
  Inbox,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Terminal,
  Trash2,
  Webhook,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  Section,
  Panel,
  Callout,
  StatusDot,
} from '@/components/common/primitives';
import { InboxList } from './InboxList';
import { RulesSection, type RegraRoteamento } from './RulesSection';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  IntegrationFlow,
  type IntegrationTab,
} from './IntegrationFlow';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

type EventoRelay = 'dispatch.success' | 'dispatch.error' | 'inbox.received';

interface Destino {
  id: string;
  nome: string;
  url: string;
  headers: Record<string, string>;
  eventos: EventoRelay[];
  ativo: boolean;
}

interface Integracoes {
  entrada: { segredo: string; modo: 'fila' | 'auto' };
  regras: RegraRoteamento[];
  saida: Destino[];
}

interface Entrega {
  id: string;
  em: string;
  destinoNome: string;
  evento: string;
  httpStatus: number;
  duracaoMs: number;
  tentativas: number;
  ok: boolean;
  erro?: string;
}

const ROTULO_EVENTO: Record<EventoRelay, string> = {
  'dispatch.success': 'Disparo aceito pela Meta',
  'dispatch.error': 'Disparo recusado',
  'inbox.received': 'Webhook recebido',
};

const ABAS: Array<{
  value: IntegrationTab;
  label: string;
  icon: typeof Webhook;
}> = [
  { value: 'recebimento', label: 'Recebimento', icon: Webhook },
  { value: 'inbox', label: 'Caixa de entrada', icon: Inbox },
  { value: 'regras', label: 'Regras', icon: GitBranch },
  { value: 'retornos', label: 'Retornos', icon: ArrowUpRight },
  { value: 'historico', label: 'Histórico', icon: History },
];

const ABA_PADRAO: IntegrationTab = 'recebimento';

function abaDoHash(hash: string): IntegrationTab {
  const value = hash.replace(/^#/, '') as IntegrationTab;
  return ABAS.some((item) => item.value === value) ? value : ABA_PADRAO;
}

export function IntegrationsPage({
  inicial,
  publicBaseUrl,
}: {
  inicial: { integracoes: Integracoes; entregas: Entrega[] };
  /** URL publica (tunel). Vem do servidor para a URL copiada ser sempre a certa,
   *  mesmo quando o operador abre o console por localhost dentro da VPS. */
  publicBaseUrl?: string;
}) {
  // Os dados chegam prontos do Server Component: sem efeito de mount, sem
  // primeiro paint vazio. `carregar` fica so para o botao de atualizar.
  const [cfg, setCfg] = useState<Integracoes>(inicial.integracoes);
  const [entregas, setEntregas] = useState<Entrega[]>(inicial.entregas);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<IntegrationTab>(ABA_PADRAO);
  const [mostrarUrlSensivel, setMostrarUrlSensivel] = useState(false);
  const [mostrarSegredo, setMostrarSegredo] = useState(false);

  useEffect(() => {
    const sincronizar = () => setAba(abaDoHash(window.location.hash));
    sincronizar();
    window.addEventListener('hashchange', sincronizar);
    window.addEventListener('popstate', sincronizar);
    return () => {
      window.removeEventListener('hashchange', sincronizar);
      window.removeEventListener('popstate', sincronizar);
    };
  }, []);

  const selecionarAba = (value: IntegrationTab) => {
    setAba(value);
    if (window.location.hash !== `#${value}`) {
      window.history.pushState(null, '', `${window.location.pathname}#${value}`);
    }
  };

  const carregar = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        pedir<{ integracoes: Integracoes }>('/api/integracoes', { cache: 'no-store' }),
        pedir<{ entregas?: Entrega[] }>('/api/relay', { cache: 'no-store' }),
      ]);
      setCfg(a.integracoes);
      setEntregas(b.entregas ?? []);
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      /* servidor pode estar reiniciando */
    }
  }, []);

  const copiar = async (texto: string, chave: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(chave);
    setTimeout(() => setCopiado(null), 2000);
    toast.success('Copiado.');
  };

  const salvar = async (novo: Integracoes) => {
    setSalvando(true);
    setCfg(novo);
    try {
      await pedir('/api/integracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novo),
      });
      toast.success('Integrações salvas.');
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Não foi possível salvar.');
      void carregar();
    } finally {
      setSalvando(false);
    }
  };

  const novoSegredo = async () => {
    try {
      const d = await pedir<{ segredo: string }>('/api/integracoes', { method: 'POST' });
      setCfg({ ...cfg, entrada: { ...cfg.entrada, segredo: d.segredo } });
      toast.warning('Segredo trocado', {
        description: 'O segredo anterior parou de funcionar agora. Atualize o n8n.',
      });
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Não foi possível trocar o segredo.');
    }
  };

  const simular = async () => {
    const exemplo = {
      event: 'order_approved',
      data: {
        order_id: `sim_${Date.now().toString(36)}`,
        amountMinor: 19700,
        currency: 'BRL',
        occurred_at: new Date().toISOString(),
        lead: {
          name: 'Simulação Teste',
          email: 'simulacao@exemplo.com.br',
          phone: '11987654321',
        },
        product: { name: 'Acesso Código Vencedor' },
        attribution: {
          event_source_url:
            'https://codigovencedor.com/checkout?utm_source=ig&utm_campaign=52666977144600&ad_id=52667052465200&fbclid=IwARsimulacao',
          ip_address: '187.54.12.89',
          user_agent: 'Mozilla/5.0 (simulação do console)',
          cookies: { fbc: 'fb.1.1712345678000.IwARsimulacao' },
        },
      },
    };

    try {
      await pedir('/api/webhook/in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CAPI-Secret': cfg.entrada.segredo,
        },
        body: JSON.stringify(exemplo),
      });

      toast.success('Webhook simulado recebido', {
        description: 'Ele aparece na caixa de entrada abaixo.',
      });
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('A simulação falhou.', {
        description: e instanceof Error ? e.message : 'Erro desconhecido.',
      });
    }
  };

  const testarDestino = async (id: string) => {
    toast.info('Enviando ping…');
    try {
      const d = await pedir<{ entrega?: Entrega }>('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinoId: id }),
      });
      const e: Entrega | undefined = d.entrega;
      if (e?.ok) {
        toast.success(`Destino respondeu ${e.httpStatus}`, {
          description: `${e.duracaoMs} ms · ${e.tentativas} tentativa(s)`,
        });
      } else {
        toast.error('O destino não respondeu', {
          description: e?.erro ?? 'Sem resposta após 3 tentativas.',
        });
      }
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Falha ao testar destino.', {
        description: e instanceof Error ? e.message : 'Erro desconhecido.',
      });
    }
    void carregar();
  };

  const base =
    publicBaseUrl?.replace(/\/+$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3333');
  // Duas formas de autenticar o recebimento. A do caminho existe porque o
  // backoffice do xWinner so oferece o campo "URL (https)" — nao ha onde
  // colocar um header customizado.
  const endpointCaminho = `${base}/api/webhook/in/${cfg.entrada.segredo}`;
  const endpointHeader = `${base}/api/webhook/in`;
  const ehLocal = base.includes('localhost') || base.includes('127.0.0.1');

  const curl = `curl -X POST ${endpointHeader} \
  -H "Content-Type: application/json" \
  -H "X-CAPI-Secret: ${cfg.entrada.segredo}" \
  -d '{"event":"purchase_approved","data":{...}}'`;
  const mascara = '••••••••••••';
  const ocultarSegredo = (texto: string) =>
    cfg.entrada.segredo ? texto.replace(cfg.entrada.segredo, mascara) : texto;
  const endpointCaminhoVisivel = mostrarUrlSensivel
    ? endpointCaminho
    : ocultarSegredo(endpointCaminho);
  const curlVisivel = mostrarSegredo
    ? curl
    : ocultarSegredo(curl);

  return (
    <div className="min-w-0">
      <IntegrationFlow onNavigate={selecionarAba} />
      <Tabs
        value={aba}
        onValueChange={(value) => value && selecionarAba(value as IntegrationTab)}
        className="mt-6 min-w-0 gap-5"
      >
        <div className="max-w-full overflow-x-auto rounded-xl border border-line-strong bg-surface-1/95 p-1.5">
          <TabsList className="h-auto min-w-max gap-1 bg-transparent p-0">
            {ABAS.map((item) => {
              const Icon = item.icon;
              const count =
                item.value === 'regras'
                  ? cfg.regras.length
                  : item.value === 'retornos'
                    ? cfg.saida.length
                    : item.value === 'historico'
                      ? entregas.length
                      : undefined;
              return (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="h-11 gap-2 rounded-lg px-4 text-label data-active:border-line-control data-active:bg-surface-3 data-active:text-fg-strong"
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                  {item.label}
                  {count !== undefined && (
                    <span className="rounded-full border border-line px-2 py-0.5 font-mono text-micro text-fg-muted tabular">
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="recebimento" className="min-w-0 outline-none">
      {/* ---------------------------------------------------------- */}
      <Section
        icon={Webhook}
        variant="card"
        title="Receber webhooks"
        description="Aponte a plataforma de vendas ou o n8n para este endereço e o payload chega pronto para revisão."
      >
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            {ehLocal && (
              <Callout tone="warning" icon={AlertTriangle} title="O xWinner exige https">
                O campo do backoffice é <strong>URL (https)</strong> e este
                console está em <code className="font-mono">{base}</code>. Abra o
                acesso público nas instruções desta aba e use a URL gerada no lugar de{' '}
                <code className="font-mono">localhost:3333</code>.
              </Callout>
            )}

            <Field
              id="endpoint-caminho"
              label="URL para o xWinner"
              helper="O backoffice do xWinner só tem o campo de URL — o segredo vai no próprio caminho. Cole esta URL em Integrações → Webhooks → Novo endpoint."
              className="rounded-lg border border-line bg-surface-2/55 p-4"
              action={<div className="flex gap-1">
                <Button size="sm" variant="ghost" aria-pressed={mostrarUrlSensivel} onClick={() => setMostrarUrlSensivel((value) => !value)}>
                  {mostrarUrlSensivel ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                  {mostrarUrlSensivel ? 'Ocultar' : 'Mostrar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copiar(endpointCaminho, 'ep-caminho')}>
                  {copiado === 'ep-caminho' ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  Copiar
                </Button>
              </div>}
            >
              <Input
                id="endpoint-caminho"
                readOnly
                value={endpointCaminhoVisivel}
                className="wrap-token font-mono"
              />
            </Field>

            <Field
              id="endpoint-header"
              label="URL para o n8n"
              helper="Quando o remetente aceita header customizado, prefira este formato: a URL fica limpa e o segredo não aparece nela."
              className="rounded-lg border border-line bg-surface-2/55 p-4"
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copiar(endpointHeader, 'ep-header')}
                >
                  {copiado === 'ep-header' ? (
                    <Check className="size-3.5 text-success" aria-hidden />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                  Copiar
                </Button>
              }
            >
              <Input
                id="endpoint-header"
                readOnly
                value={endpointHeader}
                className="wrap-token font-mono"
              />
            </Field>

            <Field
              id="segredo"
              label="Segredo"
              param="X-CAPI-Secret"
              helper="Vale para as duas URLs acima. Sem o segredo correto o endpoint responde 401."
              className="rounded-lg border border-line bg-surface-2/55 p-4"
              action={
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" aria-pressed={mostrarSegredo} onClick={() => setMostrarSegredo((value) => !value)}>
                    {mostrarSegredo ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                    {mostrarSegredo ? 'Ocultar' : 'Mostrar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copiar(cfg.entrada.segredo, 'seg')}
                  >
                    {copiado === 'seg' ? (
                      <Check className="size-3.5 text-success" aria-hidden />
                    ) : (
                      <Copy className="size-3.5" aria-hidden />
                    )}
                    Copiar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={novoSegredo}>
                    <RefreshCw className="size-3.5" aria-hidden />
                    Trocar
                  </Button>
                </div>
              }
            >
              <Input
                id="segredo"
                readOnly
                value={mostrarSegredo ? cfg.entrada.segredo : mascara}
                className="wrap-token font-mono"
              />
            </Field>

            <Accordion className="rounded-lg border border-line bg-surface-2/45">
              <AccordionItem value="instrucoes" className="last:border-b-0">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <span className="flex items-center gap-2 text-label font-semibold text-fg-body">
                    <Terminal className="size-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
                    Instruções técnicas
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <p className="mb-2 text-caption text-fg-muted">Teste pela linha de comando somente em um ambiente isolado.</p>
                  <pre className="wrap-token max-w-full overflow-x-auto whitespace-pre-wrap rounded-control border border-line-strong bg-surface-1 p-3 font-mono text-caption text-fg-muted">
                    {curlVisivel}
                  </pre>
                  <Button variant="outline" className="mt-3" onClick={simular}>
                    <Send className="size-4" aria-hidden />
                    Simular recebimento
                  </Button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Panel title="Modo de recebimento" icon={Inbox}>
              <p className="text-caption text-fg-muted">
                Quem decide o que acontece com cada webhook é a tabela de{' '}
                <strong className="text-fg-body">regras de roteamento</strong>{' '}
                (aba Regras). Um evento sem regra própria fica na fila.
              </p>

              <Callout tone="warning" icon={ShieldAlert} className="mt-3">
                Eventos de teste da plataforma (<code className="font-mono">lead@example.com</code>,{' '}
                <code className="font-mono">evt_preview…</code>, cupons de R$ 0,01)
                são barrados antes da Meta, mesmo em modo automático.
              </Callout>

              <Button variant="outline" className="mt-3 w-full" onClick={() => selecionarAba('regras')}>
                <GitBranch className="size-4" aria-hidden />
                Ver regras
              </Button>
            </Panel>

            <Panel title="Expor para a internet" icon={ArrowUpRight}>
              <p className="text-caption text-fg-muted">
                Este console roda em <code className="font-mono">localhost</code>{' '}
                e não é alcançável de fora. Para receber webhooks reais, abra um
                túnel:
              </p>
              <pre className="wrap-token mt-2 overflow-x-auto rounded-control border border-line-strong bg-surface-2 p-2.5 font-mono text-micro text-fg-muted">
                cloudflared tunnel --url http://localhost:3333
              </pre>
              <p className="mt-2 text-caption text-fg-muted">
                Na VPS o console roda em <code className="font-mono">3334</code>{' '}
                (a 3333 já é de outro container) e o hostname fixo do túnel é{' '}
                <code className="font-mono">capi.proxserverabner.site</code>.
              </p>
              <p className="mt-2 text-caption text-fg-muted">
                Use a URL gerada + <code className="font-mono">/api/webhook/in</code>.
                O segredo é a única proteção — não o compartilhe.
              </p>
            </Panel>
          </div>
        </div>

      </Section>
        </TabsContent>

        <TabsContent value="inbox" className="min-w-0 outline-none">
          <Section
            id="inbox"
            icon={Inbox}
            variant="card"
            title="Caixa de entrada"
            description="Eventos recebidos das plataformas. Carregue no formulário para revisar ou use o disparo direto."
          >
            <InboxList />
          </Section>
        </TabsContent>

      {/* ---------------------------------------------------------- */}
        <TabsContent value="regras" className="min-w-0 outline-none">
      <Section
        icon={GitBranch}
        variant="card"
        title="Regras de roteamento"
        description="Para cada evento da plataforma: qual evento vira na Meta, para quais pixels vai e se dispara sozinho ou espera revisão."
      >
        <RulesSection
          regras={cfg.regras ?? []}
          onChange={(regras) => setCfg({ ...cfg, regras })}
          onSalvar={(regras) => salvar({ ...cfg, regras })}
          salvando={salvando}
        />
      </Section>
        </TabsContent>

      {/* ---------------------------------------------------------- */}
        <TabsContent value="retornos" className="min-w-0 outline-none">
      <Section
        icon={ArrowUpRight}
        variant="card"
        title="Retorno para outros sistemas"
        description="Depois de cada disparo, devolva ao n8n ou ao CRM o que a Meta respondeu."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              salvar({
                ...cfg,
                saida: [
                  ...cfg.saida,
                  {
                    id: `dest_${Date.now().toString(36)}`,
                    nome: 'n8n — Código Vencedor',
                    url: 'https://n8n.proxserverabner.site/webhook/codigo-vencedor-capi',
                    headers: {},
                    eventos: ['dispatch.success', 'dispatch.error'],
                    ativo: false,
                  },
                ],
              })
            }
          >
            <Plus className="size-4" aria-hidden />
            Novo destino
          </Button>
        }
      >
        {cfg.saida.length === 0 ? (
          <div className="rounded-panel border border-dashed border-line-strong bg-surface-1 p-8 text-center">
            <p className="text-label font-medium text-fg-body">
              Nenhum destino configurado
            </p>
            <p className="mx-auto mt-1 max-w-md text-caption text-fg-muted">
              Sem destino, o resultado do disparo fica só no arquivo{' '}
              <code className="font-mono">logs/disparos.md</code>. Adicione um
              para o n8n saber se a Meta aceitou.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {cfg.saida.map((d, i) => (
              <li
                key={d.id}
                className="rounded-panel border border-line-strong bg-surface-1 p-4"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <Checkbox
                        checked={d.ativo}
                        onCheckedChange={(v) => {
                          const saida = [...cfg.saida];
                          saida[i] = { ...d, ativo: Boolean(v) };
                          void salvar({ ...cfg, saida });
                        }}
                      />
                      <StatusDot tone={d.ativo ? 'success' : 'neutral'}>
                        {d.ativo ? 'Ativo' : 'Desativado'}
                      </StatusDot>
                    </label>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testarDestino(d.id)}
                      >
                        <Send className="size-3.5" aria-hidden />
                        Testar
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remover o destino ${d.nome}`}
                        onClick={() =>
                          salvar({
                            ...cfg,
                            saida: cfg.saida.filter((x) => x.id !== d.id),
                          })
                        }
                      >
                        <Trash2 className="size-3.5 text-danger" aria-hidden />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <Field id={`nome-${d.id}`} label="Nome">
                      <Input
                        id={`nome-${d.id}`}
                        value={d.nome}
                        onChange={(e) => {
                          const saida = [...cfg.saida];
                          saida[i] = { ...d, nome: e.target.value };
                          setCfg({ ...cfg, saida });
                        }}
                        onBlur={() => salvar(cfg)}
                      />
                    </Field>
                    <Field
                      id={`url-${d.id}`}
                      label="URL"
                      helper="Recebe POST com corpo JSON."
                    >
                      <Input
                        id={`url-${d.id}`}
                        value={d.url}
                        onChange={(e) => {
                          const saida = [...cfg.saida];
                          saida[i] = { ...d, url: e.target.value };
                          setCfg({ ...cfg, saida });
                        }}
                        onBlur={() => salvar(cfg)}
                        className="wrap-token font-mono"
                      />
                    </Field>
                  </div>

                  <p className="text-caption text-fg-muted">
                    Nome e URL são salvos quando você sai do campo.
                  </p>

                  <fieldset>
                    <legend className="mb-2 text-label font-medium text-fg-body">
                      Enviar quando
                    </legend>
                    <div className="flex flex-wrap gap-4">
                      {(Object.keys(ROTULO_EVENTO) as EventoRelay[]).map((ev) => (
                        <label
                          key={ev}
                          className="flex cursor-pointer items-center gap-2 text-caption text-fg-body"
                        >
                          <Checkbox
                            checked={d.eventos.includes(ev)}
                            onCheckedChange={(v) => {
                              const eventos = v
                                ? [...d.eventos, ev]
                                : d.eventos.filter((x) => x !== ev);
                              const saida = [...cfg.saida];
                              saida[i] = { ...d, eventos };
                              void salvar({ ...cfg, saida });
                            }}
                          />
                          {ROTULO_EVENTO[ev]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Callout tone="info" icon={KeyRound}>
          O token da Meta e o segredo de entrada nunca entram no corpo enviado.
          O retorno contém apenas os dados necessários para o sistema configurado.
        </Callout>
      </Section>
        </TabsContent>

      {/* ---------------------------------------------------------- */}
        <TabsContent value="historico" className="min-w-0 outline-none">
      <Section
        icon={History}
        variant="card"
        title="Histórico de retornos"
        description="As últimas 50 tentativas de entrega ao n8n ou CRM."
        action={
          <Button size="sm" variant="ghost" onClick={carregar} disabled={salvando}>
            <RefreshCw className="size-3.5" aria-hidden />
            Atualizar
          </Button>
        }
      >
        {entregas.length === 0 ? (
          <p className="rounded-panel border border-dashed border-line-strong bg-surface-1 p-8 text-center text-caption text-fg-muted">
            Nenhuma entrega registrada ainda.
          </p>
        ) : (
          <div
            className="max-w-full overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Tabela do histórico de retornos"
          >
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {['Quando', 'Destino', 'Evento', 'HTTP', 'Tempo', 'Tentativas'].map(
                    (h) => (
                      <th
                        key={h}
                        scope="col"
                        className="py-2 pr-4 text-micro font-semibold tracking-wide text-fg-muted uppercase"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {entregas.map((e) => (
                  <tr key={e.id} className="border-b border-line">
                    <td className="py-2 pr-4 text-caption text-fg-muted tabular">
                      {new Date(e.em).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2 pr-4 text-caption text-fg-body">
                      {e.destinoNome}
                    </td>
                    <td className="py-2 pr-4 font-mono text-caption text-fg-muted">
                      {e.evento}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={cn(
                          'font-mono text-caption font-semibold tabular',
                          e.ok ? 'text-success' : 'text-danger'
                        )}
                      >
                        {e.httpStatus || '—'}
                        <span className="ml-2 font-sans text-caption font-medium">
                          {e.ok ? 'Entregue' : 'Falhou'}
                        </span>
                      </span>
                      {e.erro && (
                        <span className="ml-2 text-caption text-fg-muted">
                          {e.erro}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-caption text-fg-muted tabular">
                      {e.duracaoMs} ms
                    </td>
                    <td className="py-2 text-caption text-fg-muted tabular">
                      {e.tentativas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default IntegrationsPage;
