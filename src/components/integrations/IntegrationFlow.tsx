import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  GitBranch,
  Inbox,
  ListTree,
  RotateCcw,
  Target,
  Webhook,
} from 'lucide-react';

/**
 * As abas que sobraram em `/automatico`. `historico` saiu porque deixou de ser
 * aba: virou secao dentro de Retornos (§7.3.3). `recebimento` e `tag` sairam
 * depois, na FASE A do plano multi-empresa: as duas eram INSTALACAO, e nao
 * disparo automatico, e viraram a rota `/instalacao`. Os dois `?aba=` antigos
 * continuam valendo — `IntegrationsPage` os traduz em redirecionamento.
 *
 * `testes` entrou depois, e NAO e uma estacao do trilho abaixo de proposito: o
 * trilho conta o caminho que o evento percorre, e a lista de testes e o
 * contrario disso — e onde o caminho termina antes da hora. Ela e aba, para
 * quem vai cadastrar, e nunca um passo, para quem esta lendo o caminho.
 */
export type IntegrationTab = 'inbox' | 'regras' | 'testes' | 'retornos';

/**
 * Um passo do trilho ou leva a uma aba desta tela, ou leva a outra rota. Os
 * dois casos existem porque o destino final do evento — o Pixel — mora em
 * `/pixels` e nao aqui: ate a FASE 4 o mapa terminava em "Meta e retornos" e o
 * Pixel, que e a razao de tudo isto existir, nao aparecia em lugar nenhum
 * (IA-3).
 */
type PassoDoFluxo = {
  id: string;
  title: string;
  icon: typeof Webhook;
  /** Nome da variavel de tinta da area a que a estacao pertence. Depois da
   *  FASE 3a ela entra so no TRACO do icone, e so quando a estacao esta
   *  ativa — nunca em fundo de chip (nao ha mais chip) e nunca no texto. */
  tinta: string;
} & (
  | { tipo: 'aba'; tab: IntegrationTab }
  | { tipo: 'rota'; href: string }
);

const PASSOS: PassoDoFluxo[] = [
  {
    id: 'instalacao',
    tipo: 'rota',
    href: '/instalacao',
    title: 'Instalação',
    icon: Webhook,
    tinta: 'var(--tinta-instalacao)',
  },
  {
    id: 'inbox',
    tipo: 'aba',
    tab: 'inbox',
    title: 'Caixa de entrada',
    icon: Inbox,
    tinta: 'var(--tinta-automatico)',
  },
  {
    id: 'regras',
    tipo: 'aba',
    tab: 'regras',
    title: 'Regras',
    icon: GitBranch,
    tinta: 'var(--tinta-automatico)',
  },
  {
    id: 'pixels',
    tipo: 'rota',
    href: '/pixels',
    title: 'Pixels',
    icon: Target,
    tinta: 'var(--tinta-pixels)',
  },
  {
    id: 'retornos',
    tipo: 'aba',
    tab: 'retornos',
    title: 'Retornos',
    icon: RotateCcw,
    tinta: 'var(--tinta-automatico)',
  },
];

/** Numero que ainda nao chegou vira travessao. Nunca zero de enfeite. */
const AUSENTE = '—';

function numero(valor: number | undefined): string {
  return typeof valor === 'number' ? valor.toLocaleString('pt-BR') : AUSENTE;
}

function plural(valor: number | undefined, um: string, muitos: string): string {
  if (typeof valor !== 'number') return `${AUSENTE} ${muitos}`;
  return `${valor.toLocaleString('pt-BR')} ${valor === 1 ? um : muitos}`;
}

type Estado = 'ok' | 'atencao' | 'desconhecido';

const ESTACAO =
  'group relative grid min-h-12 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto';

const ATIVA =
  'bg-surface-2 before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-tinta before:content-[""]';

function SeloDeEstado({ estado }: { estado: Estado }) {
  if (estado === 'desconhecido') {
    return (
      <span className="font-mono text-label font-semibold text-fg-muted tabular-nums">
        {AUSENTE}
      </span>
    );
  }
  const ok = estado === 'ok';
  return (
    <span className="flex items-center gap-1.5 text-caption text-fg-muted">
      <span
        aria-hidden
        className={`size-[7px] shrink-0 rounded-full ${ok ? 'bg-success' : 'bg-warning'}`}
      />
      {ok ? 'ok' : 'atenção'}
    </span>
  );
}

function Contador({ valor }: { valor: number | undefined }) {
  return (
    <span className="font-mono text-label font-semibold text-fg-body tabular-nums">
      {numero(valor)}
    </span>
  );
}

function ConteudoDaEstacao({
  passo,
  linha,
  direita,
  ativa,
}: {
  passo: PassoDoFluxo;
  linha: string;
  direita: ReactNode;
  /** A estacao aberta agora. So ela mostra o icone na tinta da propria area. */
  ativa: boolean;
}) {
  const Icon = passo.icon;
  return (
    <>
      {/* FASE 3a: o chip de 32px saiu. Cinco quadradinhos empilhados, cada um
          com fundo e borda da sua tinta, eram cinco caixas contando um caminho
          que ja e contado pelo texto ao lado — e "icone em quadrado
          arredondado" e assinatura de template.

          A COR tambem deixou de ser decoracao permanente: o glifo fica em
          `--fg-muted` e so a estacao ATIVA acende na tinta da area dela. Cor
          em tudo nao aponta nada; cor num lugar so diz "voce esta aqui". */}
      <span
        aria-hidden
        className={`flex size-8 items-center justify-center ${ativa ? '' : 'text-fg-muted'}`}
        style={ativa ? ({ color: passo.tinta } as CSSProperties) : undefined}
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-label font-semibold text-fg-strong">
          <span className="truncate">{passo.title}</span>
          {passo.tipo === 'rota' && (
            <ArrowUpRight
              className="size-3.5 shrink-0 text-fg-muted"
              strokeWidth={1.75}
              aria-hidden
            />
          )}
        </span>
        <span className="block truncate text-caption text-fg-muted">{linha}</span>
      </span>
      <span className="shrink-0">{direita}</span>
    </>
  );
}

/**
 * Trilho de estado (V-05). Substitui o mapa de cinco caixas iguais: cada
 * estacao mostra o numero REAL do seu trecho do caminho e leva ao lugar onde
 * se mexe nele.
 *
 * Quem passa os numeros: `IntegrationsPage`. Hoje ela ja tem `cfg.regras`
 * (total e quantas estao em automatico), os destinos de retorno e as marcas
 * com token; `pendentes` sai do resumo da caixa de entrada e `dominios` /
 * `webhookAtivo` da configuracao de instalacao. Toda prop de estado e
 * OPCIONAL de proposito: enquanto a pagina nao passar o dado, a estacao
 * mostra travessao — nenhum numero e inventado.
 */
export function IntegrationFlow({
  onNavigate,
  abaAtiva,
  dominios,
  webhookAtivo,
  naFila,
  regrasAutomaticas,
  regrasTotal,
  pixelsComToken,
  destinosAtivos,
}: {
  /** Troca de aba dentro de `/automatico`. Contrato antigo, mantido. */
  onNavigate: (tab: IntegrationTab) => void;
  /** Aba aberta agora — marca a estacao com `aria-current` e linha de tinta. */
  abaAtiva?: IntegrationTab;
  /** Quantos dominios autorizados a tag do site tem. */
  dominios?: number;
  /** O webhook da plataforma tem URL configurada. */
  webhookAtivo?: boolean;
  /** Eventos recebidos esperando disparo. */
  naFila?: number;
  /** Regras em disparo automatico. */
  regrasAutomaticas?: number;
  /** Total de regras cadastradas. */
  regrasTotal?: number;
  /** Pixels com token de acesso salvo. */
  pixelsComToken?: number;
  /** Destinos de retorno (n8n, CRM) ligados. */
  destinosAtivos?: number;
}) {
  const estadoInstalacao: Estado =
    webhookAtivo === undefined
      ? 'desconhecido'
      : webhookAtivo && (dominios ?? 0) > 0
        ? 'ok'
        : 'atencao';
  const estadoPixels: Estado =
    pixelsComToken === undefined
      ? 'desconhecido'
      : pixelsComToken > 0
        ? 'ok'
        : 'atencao';

  const linhas: Record<string, { linha: string; direita: ReactNode }> = {
    instalacao: {
      linha: `${
        webhookAtivo === undefined
          ? `webhook ${AUSENTE}`
          : webhookAtivo
            ? 'webhook ativo'
            : 'webhook sem URL'
      } · ${plural(dominios, 'domínio', 'domínios')}`,
      direita: <SeloDeEstado estado={estadoInstalacao} />,
    },
    inbox: {
      linha:
        typeof naFila === 'number'
          ? naFila === 1
            ? '1 esperando o disparo'
            : `${naFila.toLocaleString('pt-BR')} esperando o disparo`
          : `${AUSENTE} esperando o disparo`,
      direita: <Contador valor={naFila} />,
    },
    regras: {
      linha: `${numero(regrasAutomaticas)} automáticas de ${numero(regrasTotal)}`,
      direita: <Contador valor={regrasAutomaticas} />,
    },
    pixels: {
      linha: plural(pixelsComToken, 'pixel com token', 'pixels com token'),
      direita: <SeloDeEstado estado={estadoPixels} />,
    },
    retornos: {
      linha: plural(destinosAtivos, 'destino ligado', 'destinos ligados'),
      direita: <Contador valor={destinosAtivos} />,
    },
  };

  return (
    <section
      aria-labelledby="trilho-de-estado"
      className="w-full rounded-panel bg-surface-1 p-4 shadow-realce sm:p-5"
    >
      <div className="flex items-center gap-2.5">
        <ListTree
          aria-hidden
          className="size-5 shrink-0 text-tinta"
          strokeWidth={1.75}
        />
        <h2
          id="trilho-de-estado"
          className="text-label font-semibold text-fg-body"
        >
          Como está o caminho
        </h2>
      </div>

      {/* Vertical de proposito: em pe cada estacao cabe inteira, com o numero
          do lado, em qualquer largura. A fileira horizontal so mostrava cinco
          rotulos iguais e nenhum estado. */}
      <nav aria-label="Estado das integrações" className="mt-3 grid gap-0.5">
        {PASSOS.map((passo) => {
          const { linha, direita } = linhas[passo.id];
          const ativa = passo.tipo === 'aba' && passo.tab === abaAtiva;
          const classe = `${ESTACAO}${ativa ? ` ${ATIVA}` : ''}`;
          return passo.tipo === 'rota' ? (
            <Link key={passo.id} href={passo.href} className={classe}>
              <ConteudoDaEstacao
                passo={passo}
                linha={linha}
                direita={direita}
                ativa={ativa}
              />
            </Link>
          ) : (
            <button
              key={passo.id}
              type="button"
              onClick={() => onNavigate(passo.tab)}
              aria-current={ativa ? 'page' : undefined}
              className={classe}
            >
              <ConteudoDaEstacao
                passo={passo}
                linha={linha}
                direita={direita}
                ativa={ativa}
              />
            </button>
          );
        })}
      </nav>
    </section>
  );
}
