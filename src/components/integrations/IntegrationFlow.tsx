import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  GitBranch,
  Inbox,
  Target,
  Webhook,
} from 'lucide-react';

/**
 * As abas que sobraram em `/automatico`. `historico` saiu porque deixou de ser
 * aba: virou secao dentro de Retornos (§7.3.3). `recebimento` e `tag` sairam
 * depois, na FASE A do plano multi-empresa: as duas eram INSTALACAO, e nao
 * disparo automatico, e viraram a rota `/instalacao`. Os dois `?aba=` antigos
 * continuam valendo — `IntegrationsPage` os traduz em redirecionamento.
 */
export type IntegrationTab = 'inbox' | 'regras' | 'retornos';

/**
 * Um passo do mapa ou leva a uma aba desta tela, ou leva a outra rota. Os dois
 * casos existem porque o destino final do evento — o Pixel — mora em `/pixels`
 * e nao aqui: ate a FASE 4 o mapa terminava em "Meta e retornos" e o Pixel,
 * que e a razao de tudo isto existir, nao aparecia em lugar nenhum (IA-3).
 */
type PassoDoFluxo = {
  id: string;
  title: string;
  description: string;
  icon: typeof Webhook;
} & (
  | { tipo: 'aba'; tab: IntegrationTab }
  | { tipo: 'rota'; href: string }
);

const STEPS: PassoDoFluxo[] = [
  {
    id: 'origem',
    tipo: 'rota',
    href: '/instalacao',
    title: 'Instalação',
    description: 'Webhook da plataforma e tag do site',
    icon: Webhook,
  },
  {
    id: 'inbox',
    tipo: 'aba',
    tab: 'inbox',
    title: 'Caixa de entrada',
    description: 'Eventos recebidos',
    icon: Inbox,
  },
  {
    id: 'regras',
    tipo: 'aba',
    tab: 'regras',
    title: 'Regras',
    description: 'Meta, fila ou ignorar',
    icon: GitBranch,
  },
  {
    id: 'pixels',
    tipo: 'rota',
    href: '/pixels',
    title: 'Pixels',
    description: 'O destino de cada conversão',
    icon: Target,
  },
  {
    id: 'retornos',
    tipo: 'aba',
    tab: 'retornos',
    title: 'Retornos',
    description: 'Resultado para n8n ou CRM',
    icon: ArrowUpRight,
  },
];

const CAIXA =
  'group flex min-h-14 min-w-0 items-center gap-3 rounded-control border border-line bg-surface-2/80 px-3 text-left transition-colors hover:border-line-control hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text';

function ConteudoDoPasso({ passo }: { passo: PassoDoFluxo }) {
  const Icon = passo.icon;
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control border border-accent-text/20 bg-accent-text/8 text-accent-text">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-label font-semibold text-fg-strong">
          {passo.title}
        </span>
        <span className="block text-caption text-fg-muted">
          {passo.description}
        </span>
      </span>
    </>
  );
}

export function IntegrationFlow({
  onNavigate,
}: {
  onNavigate: (tab: IntegrationTab) => void;
}) {
  return (
    <section
      aria-label="Fluxo das integrações"
      className="rounded-panel border border-line-strong bg-surface-1/95 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.14)] sm:p-5"
    >
      {/* Cinco passos so cabem lado a lado a partir de `lg`. Abaixo disso a
          fileira vira coluna com seta para baixo — nenhum passo some. O
          primeiro e o unico que sai desta tela: instalar e outra etapa, e
          mistura-la com o que acontece DEPOIS foi o que escondeu a instalacao
          por tanto tempo. */}
      <div className="grid gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-center">
        {STEPS.map((passo, index) => (
          <div key={passo.id} className="contents">
            {passo.tipo === 'rota' ? (
              <Link href={passo.href} className={CAIXA}>
                <ConteudoDoPasso passo={passo} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(passo.tab)}
                className={CAIXA}
              >
                <ConteudoDoPasso passo={passo} />
              </button>
            )}
            {index < STEPS.length - 1 && (
              <span
                className="flex items-center justify-center text-fg-muted"
                aria-hidden
              >
                <ArrowRight className="hidden size-4 lg:block" strokeWidth={1.75} />
                <ArrowDown className="size-4 lg:hidden" strokeWidth={1.75} />
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-caption text-fg-muted">
        O caminho de cada evento depende da regra: enviar para a Meta, deixar na fila ou ignorar.
      </p>
    </section>
  );
}
