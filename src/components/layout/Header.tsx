'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from '@base-ui/react/menu';
import { toast } from 'sonner';
import {
  Bell,
  BookOpen,
  Gauge,
  LogOut,
  Plug,
  Plus,
  Search,
  Send,
  Settings,
  Target,
  User,
  Workflow,
} from 'lucide-react';

import { useBrandStore, limparLegado } from '@/stores/useBrandStore';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import { useEstadoAutomatico } from '@/hooks/useEstadoAutomatico';
import { useEventStore } from '@/stores/useEventStore';
import { useUserStore } from '@/stores/useUserStore';
import { SeletorDeEmpresa } from '@/components/empresa/SeletorDeEmpresa';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { CommandPalette } from '@/components/common/CommandPalette';
import { AppMark } from '@/components/ui/app-mark';
import { NOME_PRODUTO } from '@/lib/produto';
import { cn } from '@/lib/utils';

/**
 * As cinco seções do console, na ordem do trabalho real.
 *
 * 🔴 TETO DE CINCO ITENS (IA-R1'). O Painel abriu a quinta vaga por decisão
 * registrada em `wiki/plano-dashboard-ux.md` (§3-bis): ele responde a primeira
 * pergunta de quem abre o console — "entrou venda? saiu para a Meta?" — e por
 * isso vem antes de Instalação. Um SEXTO item continua proibido: significa que
 * algo deveria ter virado aba de um dos cinco.
 *
 * Depois do Painel a ordem é a do trabalho: instalar (webhook e tag), dizer
 * para qual Pixel vai, disparar na mão e só então deixar a regra disparar
 * sozinha. O Guia não é etapa de trabalho, é consulta: mora no menu do
 * operador.
 *
 * A lista é exportada porque a barra de abas do rodapé (`BarraDeAbas.tsx`)
 * mostra exatamente as mesmas cinco seções com os rótulos curtos. Duas listas
 * paralelas seriam duas navegações que discordam na primeira mudança.
 */
export const SECOES = [
  { href: '/painel', rotulo: 'Painel', curto: 'Painel', icon: Gauge },
  { href: '/instalacao', rotulo: 'Instalação', curto: 'Instalar', icon: Plug },
  { href: '/pixels', rotulo: 'Pixels', curto: 'Pixels', icon: Target },
  { href: '/', rotulo: 'Disparo manual', curto: 'Manual', icon: Send },
  { href: '/automatico', rotulo: 'Disparo automático', curto: 'Auto', icon: Workflow },
] as const;

/** `/` só está ativo em `/`; as outras casam por prefixo (abas e âncoras). */
export function secaoAtiva(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** Até duas letras do nome do operador; sem nome, o ícone genérico. */
function iniciaisDoOperador(nome: string): string | null {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return null;
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Uma linha só de item de menu — as cinco do operador são idênticas. */
const ITEM_MENU =
  'flex cursor-default items-center gap-2.5 rounded-control border-l-2 border-transparent px-2 py-1.5 text-body text-fg-body outline-none select-none data-highlighted:border-accent-text data-highlighted:bg-accent-text/15 data-highlighted:text-fg-strong';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [prefsAbertas, setPrefsAbertas] = useState(false);

  const marcas = useBrandStore((s) => s.marcas);
  const marcaAtivaId = useBrandStore((s) => s.marcaAtivaId);
  const carregado = useBrandStore((s) => s.carregado);
  const carregar = useBrandStore((s) => s.carregar);
  const carregarEmpresas = useEmpresaStore((s) => s.carregar);
  const nomeOperador = useUserStore((s) => s.nome);
  const automatico = useEstadoAutomatico();

  useEffect(() => {
    void carregar();
    // A lista de empresas entra pelo mesmo caminho das marcas: o cabecalho e o
    // unico componente presente em toda tela, entao e dele a montagem que
    // enche os dois stores. O `SeletorDeEmpresa` so le — ele nunca busca.
    void carregarEmpresas();
    if (limparLegado()) {
      toast.warning('Token removido do navegador', {
        description:
          'Versões anteriores guardavam o token da Meta no localStorage. Ele foi apagado; o token agora fica só no servidor.',
        duration: 10000,
      });
    }
  }, [carregar, carregarEmpresas]);

  /** Apaga o cookie de sessão e limpa PII do rascunho local (D10). */
  const sair = async () => {
    try {
      await fetch('/api/sessao', { method: 'DELETE' });
    } catch {
      /* offline: o cookie expira sozinho */
    }
    try {
      useEventStore.persist.clearStorage();
      useEventStore.getState().reset();
    } catch {
      /* localStorage indisponível */
    }
    // Recarga completa de propósito, e não router.push: sair precisa descartar
    // o estado em memória da sessão anterior (marcas, rascunho do evento, fila)
    // — um push manteria os stores vivos para quem entrasse depois.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  };

  const ativa = marcas.find((m) => m.id === marcaAtivaId) ?? marcas[0];
  const emTeste = Boolean(ativa?.testCode?.trim());
  const iniciais = iniciaisDoOperador(nomeOperador);

  /**
   * A pílula de ambiente carrega o estado do automático (R-03). Antes eram
   * duas coisas: um selo de ambiente aqui em cima e uma faixa inteira
   * "Disparo automático: N em produção" numa terceira linha do cabeçalho —
   * faixa que, de quebra, sumia entre 1024 e 1279px porque estava em
   * `lg:hidden` enquanto a tira de abas ia até `xl`. As duas viraram esta
   * pílula, visível em QUALQUER largura: o buraco de 1024–1279px deixa de
   * existir por construção, e não por um breakpoint corrigido.
   */
  const contaAuto =
    automatico.situacao === 'carregando'
      ? 'lendo…'
      : automatico.regrasAuto === 0
        ? 'sem auto'
        : `${automatico.regrasAuto} auto`;
  const ambienteLongo = `${emTeste ? 'TESTE' : 'PRODUÇÃO'} · ${contaAuto}`;
  const ambienteCurto = emTeste ? 'TESTE' : 'PROD';
  const ambienteFalado = [
    emTeste
      ? `Modo teste com o código ${ativa?.testCode ?? ''}`.trim()
      : 'Modo produção: o evento entra nas métricas reais',
    automatico.situacao === 'carregando'
      ? 'ainda lendo as regras'
      : automatico.regrasAuto === 0
        ? 'nenhuma regra em disparo automático'
        : `${automatico.regrasAuto} ${
            automatico.regrasAuto === 1 ? 'regra' : 'regras'
          } em disparo automático`,
    'Abre os Pixels',
  ].join('. ');

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-0/82 backdrop-blur-md">
      {/* UMA linha, 56px, em qualquer largura. O cabeçalho anterior tinha três
          (linha de controles + tira de 5 abas + faixa de status) e chegava a
          305px no celular: a dobra inteira era casca. A navegação das telas
          estreitas desceu para a barra de abas do rodapé, que é onde o polegar
          alcança, e o estado do automático entrou na pílula de ambiente. */}
      <div className="mx-auto flex h-[var(--altura-cabecalho)] w-full max-w-cabecalho items-center gap-2.5 px-4 sm:px-6 lg:px-8">
        {/* Marca do produto. O vetor é o oficial (`ui/app-mark.tsx`) — o
            quadrado com gradiente é a moldura, não um desenho novo. */}
        <Link
          href="/painel"
          aria-label={`${NOME_PRODUTO} — ir para o Painel`}
          className="flex shrink-0 items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          <span className="grid size-[1.625rem] shrink-0 place-items-center rounded-control bg-linear-to-br from-accent-fill to-accent-fill-active text-white shadow-realce-forte">
            <AppMark size={16} className="text-white" />
          </span>
          {/* Some só na faixa de 80rem a 92rem: é onde o menu já está na linha
              e o espaço acaba. O quadrado com a marca fica, e o `aria-label`
              do link continua dizendo o nome por extenso. */}
          <span className="hidden text-label font-semibold tracking-tight text-fg-strong sm:inline xl:hidden barra:inline">
            {NOME_PRODUTO}
          </span>
        </Link>

        <span aria-hidden className="h-5 w-px shrink-0 bg-line-strong" />

        {/* Quem é a empresa dona da tela — visível em TODA largura, inclusive
            no celular, onde o nome vivia escondido. Errar de empresa custa um
            evento real no Pixel errado. */}
        <SeletorDeEmpresa />

        {/* A navegação de cima só cabe a partir de 80rem. Abaixo disso quem
            navega é a barra de abas do rodapé — nunca as duas ao mesmo tempo,
            e nunca nenhuma das duas. */}
        <nav aria-label="Seções" className="ml-1 hidden items-center xl:flex">
          {SECOES.map((item) => {
            const Icon = item.icon;
            const ativo = secaoAtiva(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  // A linha de 2px na tinta da área assenta na borda de baixo
                  // do cabeçalho: é a régua que diz onde você está, e não um
                  // retângulo azul de fundo (azul é ação, não localização).
                  'group relative flex h-[var(--altura-cabecalho)] items-center px-0.5',
                  ativo &&
                    'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-tinta'
                )}
              >
                <span
                  className={cn(
                    'flex items-center gap-2 rounded-control px-2.5 py-1.5 text-label font-medium whitespace-nowrap transition-colors',
                    ativo
                      ? 'text-fg-strong'
                      : 'text-fg-muted group-hover:bg-surface-2 group-hover:text-fg-body'
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  {item.rotulo}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {carregado && ativa && (
            <Link
              href={`/pixels#${ativa.id}`}
              aria-label={ambienteFalado}
              title={ambienteFalado}
              className={cn(
                'flex h-control-sm shrink-0 items-center gap-2 rounded-full border px-2.5 text-caption font-semibold tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text',
                emTeste
                  ? 'border-accent-text/40 bg-accent-text/10 text-accent-text hover:bg-accent-text/15'
                  : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15'
              )}
            >
              {/* Ponto com halo, e não ponto que pulsa: nada se move parado
                  nesta casa. O halo é um anel fixo. */}
              <span
                aria-hidden
                className={cn(
                  'size-[0.4375rem] shrink-0 rounded-full ring-3',
                  emTeste
                    ? 'bg-accent-text ring-accent-text/20'
                    : 'bg-warning ring-warning/20'
                )}
              />
              {/* Mesma faixa, mesmo motivo. O `title` e o `aria-label` do link
                  seguem com a frase inteira, então o leitor de tela e o
                  passar do mouse continuam dizendo quantas regras estão em
                  disparo automático mesmo quando o selo está curto. */}
              <span className="hidden sm:inline xl:hidden barra:inline">{ambienteLongo}</span>
              <span className="sm:hidden xl:inline barra:hidden">{ambienteCurto}</span>
            </Link>
          )}

          {/* Busca — o mesmo botão em três tamanhos, pela conta do espaço.
              A linha tem 78rem úteis (container de 82rem menos o respiro) e o
              menu de cinco seções come 41,6rem deles. Com o campo por extenso
              (15rem) a conta dá 95,6rem: não cabe em largura nenhuma, porque
              quem limita é o container, não a janela. O flex então esmagava o
              único que podia encolher — o seletor de empresa, de 10,5rem para
              0,1rem, com o nome da empresa sumindo.
              Então: de 80rem para cima, onde o menu está na tela, a busca é
              ícone + ⌘K (5,5rem) e sobram 4rem. Abaixo de 80rem o menu desceu
              para a barra de abas e o campo por extenso volta a caber. */}
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('capi:abrir-paleta'))
            }
            aria-label="Buscar pedido, e-mail ou regra"
            className="hidden h-control-sm w-60 shrink items-center gap-2 rounded-control border border-line bg-surface-1 px-2.5 text-label text-fg-muted shadow-realce transition-colors hover:border-line-control hover:bg-surface-2 hover:text-fg-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text lg:flex xl:hidden"
          >
            <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate">Buscar pedido, e-mail, regra</span>
            <kbd
              aria-hidden
              className="ml-auto rounded-sm border border-line-control px-1.5 font-mono text-caption"
            >
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('capi:abrir-paleta'))
            }
            aria-label="Buscar pedido, e-mail ou regra"
            title="Buscar pedido, e-mail ou regra (⌘K)"
            className="grid size-control-sm shrink-0 place-items-center gap-1.5 rounded-control border border-line bg-surface-1 text-fg-muted shadow-realce transition-colors hover:border-line-control hover:bg-surface-2 hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text lg:hidden xl:flex xl:h-control-sm xl:w-auto xl:items-center xl:px-2"
          >
            <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {/* O atalho fica à vista de propósito: sem o campo por extenso, é
                ele que conta que dá para buscar digitando. */}
            <kbd
              aria-hidden
              className="hidden rounded-sm border border-line-control px-1.5 font-mono text-caption xl:inline"
            >
              ⌘K
            </kbd>
          </button>

          {/* Avisos leva para os retornos do disparo automático — é lá que o
              erro de entrega aparece por escrito. O sino não abre uma caixa de
              notificação que o produto não tem. */}
          <Link
            href="/automatico#retornos"
            aria-label="Avisos: retornos e erros do disparo automático"
            title="Avisos: retornos e erros do disparo automático"
            className="grid size-control-sm shrink-0 place-items-center rounded-control border border-line bg-surface-1 text-fg-muted shadow-realce transition-colors hover:border-line-control hover:bg-surface-2 hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <Bell className="size-4" strokeWidth={1.75} aria-hidden />
          </Link>

          {/* Menu do operador. Os três botões soltos que moravam aqui (Guia,
              Preferências, Sair) mais "Pixel e token" e "Adicionar empresa"
              cabem num menu só — era esse aglomerado que quebrava em cinco
              linhas em 1536px. */}
          <Menu.Root>
            <Menu.Trigger
              render={
                <button
                  type="button"
                  aria-label={
                    nomeOperador
                      ? `Menu do operador: ${nomeOperador}`
                      : 'Menu do operador'
                  }
                  className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-linear-to-br from-accent-fill to-accent-fill-active text-caption font-semibold text-white ring-2 ring-surface-3 transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                />
              }
            >
              {iniciais ?? <User className="size-4" strokeWidth={2} aria-hidden />}
            </Menu.Trigger>

            <Menu.Portal>
              <Menu.Positioner
                side="bottom"
                align="end"
                sideOffset={6}
                className="isolate z-50"
              >
                <Menu.Popup className="min-w-56 origin-(--transform-origin) rounded-panel border border-line-control bg-surface-3 p-1 shadow-lg outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                  <Menu.Item
                    onClick={() => router.push('/pixels')}
                    className={ITEM_MENU}
                  >
                    <Target className="size-4 shrink-0" aria-hidden />
                    Pixel e token
                  </Menu.Item>
                  <Menu.Item
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('capi:adicionar-empresa')
                      )
                    }
                    className={ITEM_MENU}
                  >
                    <Plus className="size-4 shrink-0" aria-hidden />
                    Adicionar empresa
                  </Menu.Item>
                  <Menu.Item
                    onClick={() => router.push('/guia')}
                    className={ITEM_MENU}
                  >
                    <BookOpen className="size-4 shrink-0" aria-hidden />
                    Abrir o guia
                  </Menu.Item>
                  <Menu.Item
                    onClick={() => setPrefsAbertas(true)}
                    className={ITEM_MENU}
                  >
                    <Settings className="size-4 shrink-0" aria-hidden />
                    Preferências
                  </Menu.Item>

                  <Menu.Separator className="my-1 h-px bg-line-strong" />

                  <Menu.Item
                    onClick={() => void sair()}
                    className={cn(ITEM_MENU, 'text-danger')}
                  >
                    <LogOut className="size-4 shrink-0" aria-hidden />
                    Sair do console
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>

      <SettingsDialog open={prefsAbertas} onOpenChange={setPrefsAbertas} />
      {/* "Pixel e token" na paleta deixou de abrir um modal e passou a ser o
          que o nome sempre prometeu: ir para o lugar onde o Pixel mora. */}
      <CommandPalette onAbrirMarcas={() => router.push('/pixels')} />
    </header>
  );
}

export default Header;
