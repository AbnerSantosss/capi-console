'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  CircleDot,
  FlaskConical,
  LogOut,
  Settings,
  Command,
  Send,
  Target,
  Workflow,
} from 'lucide-react';

import { useBrandStore, limparLegado } from '@/stores/useBrandStore';
import { useEstadoAutomatico } from '@/hooks/useEstadoAutomatico';
import { useEventStore } from '@/stores/useEventStore';
import { MetaGlyph } from '@/components/ui/brand-icons';
import { BrandDialog } from '@/components/brand/BrandDialog';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { CommandPalette } from '@/components/common/CommandPalette';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Os dois caminhos ate a Meta precisam estar ditos aqui, com todas as letras:
 * quem abre o console tem que ver que existe um manual e um automatico, e
 * qual dos dois esta ligado. A sublinha so aparece em tela larga.
 */
const NAV = [
  {
    href: '/',
    rotulo: 'Disparo manual',
    curto: 'Manual',
    sub: 'você monta e envia',
    icon: Send,
    estado: false,
  },
  {
    href: '/integracoes',
    rotulo: 'Disparo automático',
    curto: 'Auto',
    sub: 'webhook xWinner → regras',
    icon: Workflow,
    estado: true,
  },
  {
    href: '/guia',
    rotulo: 'Guia',
    curto: 'Guia',
    sub: 'como operar',
    icon: BookOpen,
    estado: false,
  },
];

const SELO_AUTO = {
  carregando: 'border-line text-fg-disabled',
  desligado: 'border-line-strong text-fg-muted',
  teste: 'border-accent-text/40 bg-accent-text/10 text-accent-text',
  producao: 'border-warning/50 bg-warning/10 text-warning',
} as const;

export function Header() {
  const pathname = usePathname();
  const [marcaAberta, setMarcaAberta] = useState(false);
  const [prefsAbertas, setPrefsAbertas] = useState(false);

  const marcas = useBrandStore((s) => s.marcas);
  const marcaAtivaId = useBrandStore((s) => s.marcaAtivaId);
  const carregado = useBrandStore((s) => s.carregado);
  const carregar = useBrandStore((s) => s.carregar);
  const automatico = useEstadoAutomatico();

  useEffect(() => {
    void carregar();
    if (limparLegado()) {
      toast.warning('Token removido do navegador', {
        description:
          'Versões anteriores guardavam o token da Meta no localStorage. Ele foi apagado; o token agora fica só no servidor.',
        duration: 10000,
      });
    }
  }, [carregar]);

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

  // O hook devolve "—" enquanto le as regras, e travessao nao e estado: em
  // tela estreita isso ficava indistinguivel de "desligado".
  const rotuloAuto =
    automatico.situacao === 'carregando' ? 'lendo…' : automatico.rotulo;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-0/90 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 w-full max-w-[1280px] items-center gap-2 px-4 py-2 sm:px-6 lg:gap-4 lg:px-8">
        {/* Marca do produto — o unico lugar com o laco colorido em caixa */}
        <Link
          href="/"
          className="flex h-control-sm shrink-0 items-center gap-2.5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <MetaGlyph size={28} decorative={false} />
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-label font-semibold text-fg-strong">
              Meta CAPI Console
            </span>
            <span className="mt-0.5 text-micro text-fg-muted">
              Código Vencedor
            </span>
          </span>
        </Link>

        {/* Navegacao */}
        <nav aria-label="Seções" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const Icon = item.icon;
            const ativo =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex min-h-control-sm items-center gap-2 rounded-control px-3 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  ativo
                    ? 'bg-surface-2 text-fg-strong'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg-body'
                )}
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="flex flex-col leading-none">
                  <span className="flex items-center gap-1.5 text-label font-medium whitespace-nowrap">
                    {item.rotulo}
                    {item.estado && (
                      <span
                        className={cn(
                          'rounded-full border px-1.5 py-px text-micro font-semibold tracking-wide',
                          SELO_AUTO[automatico.situacao]
                        )}
                      >
                        {rotuloAuto}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 hidden whitespace-nowrap text-micro font-normal text-fg-disabled xl:block">
                    {item.sub}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Ambiente — sempre visivel, em qualquer largura. Producao e o perigoso. */}
        {carregado && ativa && (
          <button
            type="button"
            onClick={() => setMarcaAberta(true)}
            className={cn(
              'flex h-control-sm shrink-0 items-center gap-2 rounded-control border px-2.5 text-micro font-semibold tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              emTeste
                ? 'border-accent-text/40 bg-accent-text/10 text-accent-text hover:bg-accent-text/15'
                : 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/15'
            )}
            aria-haspopup="dialog"
            title={
              emTeste
                ? `Modo teste com o código ${ativa.testCode}. Clique para trocar o pixel, o token ou o modo.`
                : 'Modo produção: o evento entra nas métricas reais da conta. Clique para trocar o pixel, o token ou o modo.'
            }
          >
            {emTeste ? (
              <FlaskConical className="size-3.5" aria-hidden />
            ) : (
              <AlertTriangle className="size-3.5" aria-hidden />
            )}
            <span>{emTeste ? 'Teste' : 'Produção'}</span>
            {/* Sem a seta o selo parecia so um aviso de status, e ninguem
                descobria que a configuracao do pixel mora atras dele. */}
            <ChevronDown className="size-3.5 opacity-70" aria-hidden />
          </button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setMarcaAberta(true)}
          className="hidden 2xl:flex"
        >
          <Target className="size-4" strokeWidth={1.75} aria-hidden />
          Pixel e token
        </Button>

        {/* Paleta de comandos */}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            window.dispatchEvent(new CustomEvent('capi:abrir-paleta'))
          }
          className="hidden lg:flex"
          aria-label="Abrir a paleta de comandos"
        >
          <Command className="size-3.5" aria-hidden />
          <span className="font-mono text-micro">K</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPrefsAbertas(true)}
          aria-label="Preferências"
        >
          <Settings className="size-4" aria-hidden />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => void sair()}
          aria-label="Sair do console"
          title="Sair do console"
        >
          <LogOut className="size-4" aria-hidden />
        </Button>
      </div>

      {/* Navegação e configuração em telas menores. */}
      <nav
        aria-label="Seções"
        className="mx-auto grid w-full max-w-[1280px] grid-cols-4 gap-1 border-t border-line px-4 py-1.5 sm:px-6 lg:hidden"
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const ativo =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? 'page' : undefined}
              className={cn(
                'flex min-h-control-lg min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1 text-caption font-medium transition-colors',
                ativo
                  ? 'bg-surface-2 text-fg-strong'
                  : 'text-fg-muted hover:text-fg-body'
              )}
            >
              <span className="shrink-0">
                <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="max-w-full truncate">{item.curto}</span>
              <span className="sr-only">{item.rotulo}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMarcaAberta(true)}
          className="flex min-h-control-lg min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1 text-caption font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg-body"
          aria-haspopup="dialog"
        >
          <CircleDot className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="truncate">Pixel</span>
        </button>
      </nav>

      {/* Estado do automatico por escrito. Em tela estreita ele so existia
          como um ponto colorido no icone — cor sozinha nao e rotulo. */}
      <div className="mx-auto flex w-full max-w-[1280px] items-center gap-2 border-t border-line px-4 py-1.5 sm:px-6 lg:hidden">
        <Workflow className="size-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} aria-hidden />
        <span className="text-caption text-fg-muted">Disparo automático:</span>
        <span
          className={cn(
            'rounded-full border px-1.5 py-px text-micro font-semibold tracking-wide',
            SELO_AUTO[automatico.situacao]
          )}
        >
          {rotuloAuto}
        </span>
      </div>

      <BrandDialog open={marcaAberta} onOpenChange={setMarcaAberta} />
      <SettingsDialog open={prefsAbertas} onOpenChange={setPrefsAbertas} />
      <CommandPalette onAbrirMarcas={() => setMarcaAberta(true)} />
    </header>
  );
}

export default Header;
