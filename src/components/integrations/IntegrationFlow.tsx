import {
  ArrowDown,
  ArrowRight,
  GitBranch,
  Inbox,
  Send,
  Webhook,
} from 'lucide-react';

export type IntegrationTab =
  | 'recebimento'
  | 'inbox'
  | 'regras'
  | 'retornos'
  | 'historico'
  | 'tag';

const STEPS: Array<{
  tab: IntegrationTab;
  title: string;
  description: string;
  icon: typeof Webhook;
}> = [
  {
    tab: 'recebimento',
    title: 'Recebimento',
    description: 'Plataforma ou n8n',
    icon: Webhook,
  },
  {
    tab: 'inbox',
    title: 'Caixa de entrada',
    description: 'Eventos recebidos',
    icon: Inbox,
  },
  {
    tab: 'regras',
    title: 'Regras',
    description: 'Meta, fila ou ignorar',
    icon: GitBranch,
  },
  {
    tab: 'retornos',
    title: 'Meta e retornos',
    description: 'Resultado para n8n ou CRM',
    icon: Send,
  },
];

export function IntegrationFlow({
  onNavigate,
}: {
  onNavigate: (tab: IntegrationTab) => void;
}) {
  return (
    <section
      aria-label="Fluxo das integrações"
      className="rounded-xl border border-line-strong bg-surface-1/95 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.14)] sm:p-5"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-center">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.tab} className="contents">
              <button
                type="button"
                onClick={() => onNavigate(step.tab)}
                className="group flex min-h-14 min-w-0 items-center gap-3 rounded-lg border border-line bg-surface-2/80 px-3 text-left transition-colors hover:border-line-control hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-accent-text/20 bg-accent-text/8 text-accent-text">
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-label font-semibold text-fg-strong">
                    {step.title}
                  </span>
                  <span className="block text-caption text-fg-muted">
                    {step.description}
                  </span>
                </span>
              </button>
              {index < STEPS.length - 1 && (
                <span className="flex items-center justify-center text-fg-muted" aria-hidden>
                  <ArrowRight className="hidden size-4 sm:block" strokeWidth={1.75} />
                  <ArrowDown className="size-4 sm:hidden" strokeWidth={1.75} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-caption text-fg-muted">
        O caminho de cada evento depende da regra: enviar para a Meta, deixar na fila ou ignorar.
      </p>
    </section>
  );
}
