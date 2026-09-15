'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import {
  ArrowUpRight,
  FlaskConical,
  GitBranch,
  History,
  Inbox,
  KeyRound,
  Plug,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import {
  Field,
  Section,
  Panel,
  Callout,
  StatusDot,
} from '@/components/common/primitives';
import { InboxList } from './InboxList';
import { RulesSection } from './RulesSection';
import type { Entrega, EventoRelay, Integracoes } from './tipos';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import {
  IntegrationFlow,
  type IntegrationTab,
} from './IntegrationFlow';
import { ChaveDoAutomatico } from './ChaveDoAutomatico';
import { ListaDeTestes } from './ListaDeTestes';
import type { ListaDeTeste } from '@/lib/deteccao-de-teste';
const ROTULO_EVENTO: Record<EventoRelay, string> = {
  'dispatch.success': 'Disparo aceito pela Meta',
  'dispatch.error': 'Disparo recusado',
  'inbox.received': 'Webhook recebido',
};

/**
 * Tres abas em dois grupos rotulados. O grupo responde "em que parte do caminho
 * do evento isto acontece", que e a pergunta que a lista plana de seis abas nao
 * respondia (§7.6).
 *
 * O grupo "O que entra" — Recebimento e Tag do site — saiu inteiro daqui na
 * FASE A do plano multi-empresa e virou a rota `/instalacao`. As duas abas nao
 * eram "o que acontece com o evento": eram o que se faz UMA vez, antes de
 * qualquer evento existir. Enquanto moravam dentro de uma tela chamada "Disparo
 * automatico", a primeira tarefa do produto era tambem a mais escondida.
 */
const GRUPOS: Array<{
  id: string;
  label: string;
  abas: Array<{ value: IntegrationTab; label: string; icon: typeof Inbox }>;
}> = [
  {
    id: 'acontece',
    label: 'O que acontece',
    abas: [
      { value: 'inbox', label: 'Caixa de entrada', icon: Inbox },
      { value: 'regras', label: 'Regras', icon: GitBranch },
      // Fica junto de Regras porque responde a mesma pergunta — "o que decide
      // o destino deste evento?" —, so que pelo lado de quem mandou em vez do
      // lado do que foi mandado.
      { value: 'testes', label: 'Testes da equipe', icon: FlaskConical },
    ],
  },
  {
    id: 'sai',
    label: 'O que sai',
    abas: [{ value: 'retornos', label: 'Retornos', icon: ArrowUpRight }],
  },
];

const ABAS = GRUPOS.flatMap((grupo) => grupo.abas);

const ABA_PADRAO: IntegrationTab = 'inbox';

/** `?aba=` so aceita o que existe; qualquer outra coisa cai no padrao. */
function abaDaConsulta(valor: string | null): IntegrationTab | null {
  return ABAS.some((item) => item.value === valor)
    ? (valor as IntegrationTab)
    : null;
}

/**
 * 🔴 COMPATIBILIDADE PERMANENTE COM O HASH ANTIGO — NAO TIRE ESTE MAPA.
 *
 * Ate a FASE 4 a aba vivia em `window.location.hash`. Todo `#inbox`, `#regras`
 * ou `#historico` ja salvo em favorito ou colado numa conversa continua tendo
 * que abrir a aba certa: link publicado nao expira. Mesmo princípio da decisao
 * irreversivel #10 (a URL de webhook de um segmento vale para sempre). Isto nao
 * e uma migracao com prazo — e uma traducao que fica.
 *
 * `#historico` e o caso especial: a aba deixou de existir, entao ele aponta
 * para Retornos, onde o Historico virou secao. O hash sobrevive como ANCORA de
 * conteudo (`#historico` rola ate a secao), que e a funcao nativa que o uso
 * como estado de aba vinha roubando (IA-R4).
 */
const HASH_LEGADO: Record<string, IntegrationTab> = {
  inbox: 'inbox',
  regras: 'regras',
  retornos: 'retornos',
  historico: 'retornos',
};

/**
 * 🔴 COMPATIBILIDADE PERMANENTE COM AS DUAS ABAS QUE MUDARAM DE ROTA.
 *
 * `?aba=recebimento` e `?aba=tag` (e os hashes `#recebimento`/`#tag`) sao links
 * que ja existem em favorito, em anotacao e em conversa com cliente. Eles nao
 * podem morrer so porque o conteudo mudou de endereco: levam para `/instalacao`
 * na ancora certa, que e exatamente onde a pessoa esperava cair.
 *
 * Vale o mesmo principio da decisao irreversivel #10 — endereco publicado
 * responde para sempre. Isto nao tem prazo de validade.
 */
const ROTA_LEGADA: Record<string, string> = {
  recebimento: '/instalacao#webhook',
  tag: '/instalacao#tag',
};

/** Unica ancora de conteudo que sobrevive a traducao do hash. */
const ANCORA_HISTORICO = 'historico';

function abaDoHashLegado(hash: string): IntegrationTab | null {
  return HASH_LEGADO[hash.replace(/^#/, '')] ?? null;
}

/**
 * O hash como fonte externa, lido por `useSyncExternalStore`. Duas razoes para
 * nao ser `useState` + efeito: no servidor o hash nao existe (o snapshot de
 * servidor e string vazia, e a hidratacao nao acusa divergencia), e o valor em
 * cache so e invalidado por `hashchange`/`popstate` — nunca pelo nosso proprio
 * `replaceState` de limpeza. Se o cache reagisse a limpeza, a aba escolhida
 * pelo link antigo sumiria no intervalo entre apagar o hash e o roteador
 * publicar o `?aba=` equivalente.
 */
let hashEmCache: string | null = null;

function lerHash(): string {
  if (hashEmCache === null) hashEmCache = window.location.hash;
  return hashEmCache;
}

function lerHashNoServidor(): string {
  return '';
}

function assinarHash(aoMudar: () => void): () => void {
  const sincronizar = () => {
    hashEmCache = window.location.hash;
    aoMudar();
  };
  window.addEventListener('hashchange', sincronizar);
  window.addEventListener('popstate', sincronizar);
  return () => {
    window.removeEventListener('hashchange', sincronizar);
    window.removeEventListener('popstate', sincronizar);
  };
}

/** Id de destino de retorno. Fora do componente: o relogio e impuro e o corpo
 *  de um componente precisa ser idempotente (react-hooks/purity). */
function novoIdDeDestino(): string {
  return `dest_${Date.now().toString(36)}`;
}

export function IntegrationsPage({
  inicial,
}: {
  inicial: { integracoes: Integracoes; entregas: Entrega[] };
}) {
  // Os dados chegam prontos do Server Component: sem efeito de mount, sem
  // primeiro paint vazio. `carregar` fica so para o botao de atualizar.
  const [cfg, setCfg] = useState<Integracoes>(inicial.integracoes);
  const [entregas, setEntregas] = useState<Entrega[]>(inicial.entregas);
  const [salvando, setSalvando] = useState(false);

  // So para batizar o destino novo com o nome de quem o esta criando.
  const empresaAtiva = useEmpresaStore((s) => s.ativa());

  // A aba ativa mora na URL, nao em estado local (IA-R3): `?aba=regras` abre
  // Regras direto, inclusive em aba nova do navegador e ja no HTML que vem do
  // servidor. O hash antigo entra como segunda opcao e nunca ganha do `?aba=`.
  // Filtro e busca continuam FORA da URL de proposito (IA-R5): sao efemeros e
  // so poluiriam o historico.
  const parametros = useSearchParams();
  const router = useRouter();
  const hash = useSyncExternalStore(assinarHash, lerHash, lerHashNoServidor);
  const aba: IntegrationTab =
    abaDaConsulta(parametros.get('aba')) ?? abaDoHashLegado(hash) ?? ABA_PADRAO;

  /**
   * Troca de aba REESCREVE a entrada atual do historico em vez de empilhar uma
   * nova. Com `pushState`, sete cliques em aba deixariam sete entradas entre o
   * operador e a tela de onde ele veio, e o "voltar" do navegador viraria um
   * "desfazer clique de aba" — o caminho de volta fica inutilizavel. Aba e
   * ponto de vista, nao destino; a URL continua copiavel e compartilhavel, que
   * era o objetivo de tirar isto do hash.
   *
   * `window.history.replaceState` e nao `router.replace` porque a rota e
   * `force-dynamic`: uma navegacao do roteador releria a configuracao inteira
   * no servidor a cada clique. O Next reflete o replaceState nativo em
   * `useSearchParams`.
   */
  const selecionarAba = (value: IntegrationTab) => {
    const novos = new URLSearchParams(parametros.toString());
    novos.set('aba', value);
    window.history.replaceState(null, '', `?${novos.toString()}`);
  };

  // As duas abas que viraram `/instalacao` precisam LEVAR o visitante para la,
  // e nao apenas cair no padrao: quem abriu `?aba=tag` queria a tag do site, e
  // aterrissar calado na caixa de entrada e pior do que um 404 — parece que o
  // recurso sumiu. `useRef` porque `router.replace` remonta esta tela: sem a
  // trava, o efeito reentraria e o historico viraria um laco.
  const jaRedirecionou = useRef(false);
  useEffect(() => {
    if (jaRedirecionou.current) return;
    const daConsulta = parametros.get('aba') ?? '';
    const doHash = window.location.hash.replace(/^#/, '');
    const destino = ROTA_LEGADA[daConsulta] ?? ROTA_LEGADA[doHash];
    if (!destino) return;
    jaRedirecionou.current = true;
    router.replace(destino);
  }, [parametros, router]);

  // Traduz o hash antigo em `?aba=` uma unica vez, por higiene da URL — quem ja
  // mostrou a aba certa foi a derivacao acima, entao esta limpeza nunca pode
  // ser o que faz o link antigo funcionar.
  const hashJaTraduzido = useRef(false);
  useEffect(() => {
    if (hashJaTraduzido.current) return;
    const legado = abaDoHashLegado(window.location.hash);
    const jaTemConsulta = new URLSearchParams(window.location.search).has('aba');
    if (!legado || jaTemConsulta) return;
    hashJaTraduzido.current = true;
    const ehAncora = window.location.hash.replace(/^#/, '') === ANCORA_HISTORICO;
    const novos = new URLSearchParams(window.location.search);
    novos.set('aba', legado);
    window.history.replaceState(
      null,
      '',
      `?${novos.toString()}${ehAncora ? `#${ANCORA_HISTORICO}` : ''}`
    );
  }, []);

  // `#historico` continua rolando ate a secao — so que agora como ancora de
  // conteudo dentro de Retornos. O painel so existe depois de a aba virar, por
  // isso o efeito depende de `aba` e nao roda so na montagem.
  const historicoJaRolado = useRef(false);
  useEffect(() => {
    if (historicoJaRolado.current || aba !== 'retornos') return;
    if (window.location.hash.replace(/^#/, '') !== ANCORA_HISTORICO) return;
    const alvo = document.getElementById(ANCORA_HISTORICO);
    if (!alvo) return;
    historicoJaRolado.current = true;
    alvo.scrollIntoView({ block: 'start' });
  }, [aba]);

  // Em tela estreita as cinco abas passam da largura e a faixa rola na
  // horizontal — nenhuma aba e escondida. Se a aba ativa veio da URL, ela pode
  // nascer fora do campo de visao: entao a FAIXA rola ate mostra-la, nunca a
  // pagina.
  const faixaDeAbas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const caixa = faixaDeAbas.current;
    const alvo = caixa?.querySelector<HTMLElement>(
      '[data-slot="tabs-trigger"][data-active]'
    );
    if (!caixa || !alvo) return;
    const folga = 12;
    const limites = caixa.getBoundingClientRect();
    const item = alvo.getBoundingClientRect();
    if (item.left < limites.left + folga) {
      caixa.scrollLeft -= limites.left + folga - item.left;
    } else if (item.right > limites.right - folga) {
      caixa.scrollLeft += item.right - (limites.right - folga);
    }
  }, [aba]);

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

  /**
   * Acrescenta um destino de retorno. Extraido do `onClick` do cabecalho porque
   * o EstadoVazio precisa oferecer exatamente a MESMA acao (C-11): duas copias
   * do mesmo corpo divergiriam no primeiro ajuste.
   */
  const novoDestino = async () => {
    const id = novoIdDeDestino();
    const nomeEmpresa = empresaAtiva?.nome?.trim();
    await salvar({
      ...cfg,
      saida: [
        ...cfg.saida,
        {
          id,
          // 🔴 Nome e URL saem da empresa ativa, e a URL nasce VAZIA. Antes os
          // dois eram literais do n8n de um cliente especifico: num console com
          // mais de uma empresa, o destino novo da empresa B nascia apontando
          // para o n8n da empresa A — e bastava alguem ligar o Ativo para os
          // retornos de B irem parar no fluxo de A. Nao ha URL padrao possivel
          // aqui: so o operador sabe qual e a desta empresa.
          nome: nomeEmpresa ? `n8n — ${nomeEmpresa}` : 'Destino de retorno',
          url: '',
          headers: {},
          eventos: ['dispatch.success', 'dispatch.error'],
          ativo: false,
        },
      ],
    });
  };

  const salvar = async (novo: Integracoes) => {
    setSalvando(true);
    setCfg(novo);

    // 🔴 Destino sem URL fica NA TELA e fora do disco. O esquema do servidor
    // exige URL http(s) — e o destino novo nasce vazio de proposito, porque so
    // o operador sabe qual e a desta empresa. Mandar o destino pela metade
    // faria TODA gravacao desta pagina responder 400 enquanto ele nao colasse o
    // endereco, inclusive as gravacoes de regra e de dominio da tag, que nao
    // tem nada a ver com retornos.
    const pendentes = novo.saida.filter((d) => !d.url.trim());
    const paraGravar: Integracoes =
      pendentes.length > 0
        ? { ...novo, saida: novo.saida.filter((d) => d.url.trim()) }
        : novo;

    try {
      await pedir('/api/integracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paraGravar),
      });
      // O que NAO foi salvo e dito em voz alta: um destino que some na proxima
      // recarga sem ninguem avisar e a definicao de tela que mente.
      toast.success(
        'Integrações salvas.',
        pendentes.length > 0
          ? {
              description:
                pendentes.length === 1
                  ? 'Um destino de retorno ainda está sem URL e não foi salvo.'
                  : `${pendentes.length} destinos de retorno ainda estão sem URL e não foram salvos.`,
            }
          : undefined
      );
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Não foi possível salvar.');
      void carregar();
    } finally {
      setSalvando(false);
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

  return (
    <div className="min-w-0">
      {/* A trava do Pixel, no topo da tela que fala de automatico. A trava da
          REGRA continua na aba Regras — a chave so mostra a contagem dela, e
          por isso recebe `cfg.regras`, que e a lista que aquela aba edita. */}
      <div className="mb-6 min-w-0">
        <ChaveDoAutomatico
          regras={cfg.regras ?? []}
          onIrParaRegras={() => selecionarAba('regras')}
        />
      </div>
      <IntegrationFlow onNavigate={selecionarAba} />
      <Tabs
        value={aba}
        onValueChange={(value) => value && selecionarAba(value as IntegrationTab)}
        className="mt-6 min-w-0 gap-5"
      >
        <div
          ref={faixaDeAbas}
          className="max-w-full overflow-x-auto rounded-panel border border-line-strong bg-surface-1 p-1.5"
        >
          {/* Os grupos sao divisoria visual (P6, proximidade) e nao semantica:
              `role="presentation"` mantem a `tablist` com abas como unicos
              filhos reconhecidos, e cada aba aponta o rotulo do seu grupo por
              `aria-describedby` — quem usa leitor de tela ouve "Recebimento,
              O que entra", e nao uma lista plana de cinco nomes soltos. */}
          <TabsList
            aria-label="Seções do disparo automático"
            className="h-auto w-max min-w-full items-stretch gap-2 bg-transparent p-0"
          >
            {GRUPOS.map((grupo, indice) => (
              <div
                key={grupo.id}
                role="presentation"
                className={cn(
                  'flex min-w-0 flex-col gap-1 px-1',
                  indice > 0 && 'border-l border-line pl-3'
                )}
              >
                <span
                  id={`grupo-${grupo.id}`}
                  className="px-1 text-caption font-semibold tracking-wide text-fg-muted uppercase"
                >
                  {grupo.label}
                </span>
                <div role="presentation" className="flex items-center gap-1">
                  {grupo.abas.map((item) => {
                    const Icon = item.icon;
                    const count =
                      item.value === 'regras'
                        ? cfg.regras.length
                        : item.value === 'retornos'
                          ? cfg.saida.length
                          : item.value === 'testes'
                            ? // Os dois somados: para quem olha a aba, a
                              // pergunta é "quantas pessoas estão barradas",
                              // e não por qual dos dois campos cada uma entrou.
                              (cfg.testes?.emails?.length ?? 0) +
                              (cfg.testes?.nomes?.length ?? 0)
                            : undefined;
                    return (
                      <TabsTrigger
                        key={item.value}
                        value={item.value}
                        aria-describedby={`grupo-${grupo.id}`}
                        className="h-11 gap-2 rounded-control px-4 text-label data-active:border-line-control data-active:bg-surface-3 data-active:text-fg-strong"
                      >
                        <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                        {item.label}
                        {count !== undefined && (
                          <Badge className="font-mono tabular">{count}</Badge>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsList>
        </div>

        <TabsContent value="inbox" className="min-w-0 outline-none">
          <div className="flex min-w-0 flex-col gap-5">
            {/* Este painel vivia na aba Recebimento, que virou `/instalacao`. Ele
                NAO foi junto: a pergunta que ele responde — "por que este evento
                parou aqui em vez de ir para a Meta?" — so aparece olhando a
                caixa de entrada. Em `/instalacao` seria um aviso sobre uma tela
                que o operador ainda nem abriu. */}
            <Panel title="Modo de recebimento" icon={Inbox}>
              <p className="text-caption text-fg-muted">
                Quem decide o que acontece com cada webhook é a tabela de{' '}
                <strong className="text-fg-body">regras de roteamento</strong>{' '}
                (aba Regras). Um evento sem regra própria fica na fila.
              </p>

              <Callout tone="warning" icon={ShieldAlert} className="mt-3">
                Eventos de teste da plataforma (<code className="font-mono">lead@example.com</code>,{' '}
                <code className="font-mono">evt_preview…</code>, cupons de R$ 0,01)
                são barrados antes da Meta, mesmo em modo automático. O e-mail pessoal que a equipe
                usa para testar o checkout, o console não adivinha — esse se cadastra em{' '}
                <strong className="text-fg-body">Testes da equipe</strong>.
              </Callout>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => selecionarAba('regras')}>
                  <GitBranch className="size-4" aria-hidden />
                  Ver regras
                </Button>
                <Button variant="outline" onClick={() => selecionarAba('testes')}>
                  <FlaskConical className="size-4" aria-hidden />
                  Testes da equipe
                </Button>
                <Link
                  href="/instalacao#webhook"
                  className={buttonVariants({ variant: 'ghost' })}
                >
                  <Plug className="size-4" aria-hidden />
                  Onde a URL do webhook é gerada
                </Link>
              </div>
            </Panel>

            <Section
              id="inbox"
              icon={Inbox}
              variant="card"
              title="Caixa de entrada"
              description="Eventos recebidos das plataformas. Carregue no formulário para revisar ou use o disparo direto."
            >
              <InboxList />
            </Section>
          </div>
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
        <TabsContent value="testes" className="min-w-0 outline-none">
      <Section
        icon={FlaskConical}
        variant="card"
        title="Testes da equipe"
        description="Quem da equipe bate no checkout para testar. O que casa com esta lista nunca chega à Meta."
      >
        {/* 🔴 A gravação passa pelo MESMO `salvar` das outras abas, e manda a
            configuração inteira. Um PUT só com `testes` funcionaria — o
            servidor mescla sobre o disco —, mas duas rotas de gravação para o
            mesmo arquivo é como se perde um campo no dia em que uma delas
            esquecer de reenviar algo. */}
        <ListaDeTestes
          testes={cfg.testes}
          onSalvar={(testes: ListaDeTeste) => void salvar({ ...cfg, testes })}
          salvando={salvando}
        />
      </Section>
        </TabsContent>

      {/* ---------------------------------------------------------- */}
        <TabsContent value="retornos" className="min-w-0 outline-none">
          {/* "Historico" deixou de ser aba e virou secao daqui (§7.3.3): o log
              de entregas e o resultado DESTE assunto, nao um assunto proprio.
              Nada foi escondido — as duas secoes dividem o painel e o contador
              de entregas continua a vista no cabecalho do Historico. */}
          <div className="flex min-w-0 flex-col gap-5">
      <Section
        icon={ArrowUpRight}
        variant="card"
        title="Retorno para outros sistemas"
        description="Depois de cada disparo, devolva ao n8n ou ao CRM o que a Meta respondeu."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => void novoDestino()}
          >
            <Plus className="size-4" aria-hidden />
            Novo destino
          </Button>
        }
      >
        {cfg.saida.length === 0 ? (
          <EstadoVazio
            icone={ArrowUpRight}
            titulo="Nenhum destino configurado"
            motivo={
              <>
                Sem destino, o resultado do disparo fica só no arquivo{' '}
                <code className="font-mono">logs/disparos.md</code> — o n8n e o
                CRM nunca ficam sabendo se a Meta aceitou.
              </>
            }
            acao={
              <Button variant="outline" onClick={() => void novoDestino()}>
                <Plus className="size-4" aria-hidden />
                Novo destino
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {cfg.saida.map((d, i) => (
              <li
                key={d.id}
                // FASE 3a: a lista de destinos vive dentro de uma `Section`
                // variante cartão (`surface-1`). Sobe para `surface-2` para
                // ter o degrau de 0.04 que o G3′ cobra, e larga a borda.
                className="rounded-panel bg-surface-2 p-4"
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
                      helper="Recebe POST com corpo JSON. O destino novo nasce sem URL: cole aqui a desta empresa."
                    >
                      <Input
                        id={`url-${d.id}`}
                        value={d.url}
                        placeholder="https://exemplo.com/webhook/…"
                        spellCheck={false}
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

      <Section
        id={ANCORA_HISTORICO}
        icon={History}
        variant="card"
        title="Histórico de retornos"
        description="As últimas 50 tentativas de entrega ao n8n ou CRM."
        action={
          <div className="flex items-center gap-2">
            <Badge className="font-mono tabular">{entregas.length}</Badge>
            <Button size="sm" variant="ghost" onClick={carregar} disabled={salvando}>
              <RefreshCw className="size-3.5" aria-hidden />
              Atualizar
            </Button>
          </div>
        }
      >
        {entregas.length === 0 ? (
          <EstadoVazio
            icone={History}
            titulo="Nenhuma entrega registrada"
            motivo="O histórico só ganha linhas depois do primeiro disparo com um destino ativo. Se já houve disparo, o destino pode estar desligado."
            acao={
              <Button variant="outline" onClick={carregar} disabled={salvando}>
                <RefreshCw className="size-4" aria-hidden />
                Atualizar
              </Button>
            }
          />
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
                        className="py-2 pr-4 text-caption font-semibold tracking-wide text-fg-muted uppercase"
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
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}

export default IntegrationsPage;
