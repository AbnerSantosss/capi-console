'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, FlaskConical, Settings, Command } from 'lucide-react';

import { useBrandStore, limparLegado } from '@/stores/useBrandStore';
import { MetaGlyph } from '@/components/ui/brand-icons';
import { BrandDialog } from '@/components/brand/BrandDialog';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', rotulo: 'Console' },
  { href: '/integracoes', rotulo: 'Integrações' },
  { href: '/guia', rotulo: 'Guia' },
];

export function Header() {
  const pathname = usePathname();
  const [marcaAberta, setMarcaAberta] = useState(false);
  const [prefsAbertas, setPrefsAbertas] = useState(false);

  const marcas = useBrandStore((s) => s.marcas);
  const marcaAtivaId = useBrandStore((s) => s.marcaAtivaId);
  const carregado = useBrandStore((s) => s.carregado);
  const carregar = useBrandStore((s) => s.carregar);

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

  const ativa = marcas.find((m) => m.id === marcaAtivaId) ?? marcas[0];
  const emTeste = Boolean(ativa?.testCode?.trim());

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-0/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        {/* Marca do produto — o unico lugar com o laco colorido em caixa */}
        <Link
          href="/"
          className="flex h-control-sm shrink-0 items-center gap-2.5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <MetaGlyph size={28} decorative={false} />
          <span className="flex flex-col leading-none">
            <span className="text-label font-semibold text-fg-strong">
              Meta CAPI Console
            </span>
            <span className="mt-0.5 text-micro text-fg-muted">
              Código Vencedor
            </span>
          </span>
        </Link>

        {/* Navegacao */}
        <nav aria-label="Seções" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
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
                  'flex h-control-sm items-center rounded-control px-3 text-label font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  ativo
                    ? 'bg-surface-2 text-fg-strong'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg-body'
                )}
              >
                {item.rotulo}
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
            title={
              emTeste
                ? `Modo teste com o código ${ativa.testCode}`
                : 'Modo produção: o evento entra nas métricas reais da conta'
            }
          >
            {emTeste ? (
              <FlaskConical className="size-3.5" aria-hidden />
            ) : (
              <AlertTriangle className="size-3.5" aria-hidden />
            )}
            <span>{emTeste ? 'Teste' : 'Produção'}</span>
            <span className="hidden font-normal normal-case opacity-70 sm:inline">
              · {ativa.nome}
            </span>
          </button>
        )}

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
      </div>

      {/* Navegacao em telas pequenas */}
      <nav
        aria-label="Seções"
        className="flex items-center gap-1 border-t border-line px-4 py-1.5 md:hidden"
      >
        {NAV.map((item) => {
          const ativo =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? 'page' : undefined}
              className={cn(
                'flex h-control-lg flex-1 items-center justify-center rounded-control px-3 text-label font-medium transition-colors',
                ativo
                  ? 'bg-surface-2 text-fg-strong'
                  : 'text-fg-muted hover:text-fg-body'
              )}
            >
              {item.rotulo}
            </Link>
          );
        })}
      </nav>

      <BrandDialog open={marcaAberta} onOpenChange={setMarcaAberta} />
      <SettingsDialog open={prefsAbertas} onOpenChange={setPrefsAbertas} />
    </header>
  );
}

export default Header;
