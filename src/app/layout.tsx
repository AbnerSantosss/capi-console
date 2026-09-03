import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppChrome } from '@/components/common/AppChrome';
import './globals.css';

const sans = Plus_Jakarta_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Meta CAPI Console',
  description:
    'Console de disparo manual de conversões para a Meta Conversions API do Código Vencedor.',
};

export const viewport: Viewport = {
  themeColor: '#0a0e14',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // sem maximumScale: bloquear o zoom quebra a acessibilidade
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      // o Next 16 so assume o controle do scroll na navegacao com este atributo
      data-scroll-behavior="smooth"
      className={`${sans.variable} ${mono.variable} dark antialiased`}
    >
      {/* Extensões de navegador (ColorZilla, Grammarly e afins) injetam
          atributos no <body> antes do React hidratar, o que gera um aviso de
          mismatch que não vem do nosso código. */}
      <body
        suppressHydrationWarning
        className="app-mesh min-h-[100dvh] bg-background text-foreground"
      >
        <AppChrome />
        <TooltipProvider delay={200}>
          {children}
          <Toaster
            position="bottom-right"
            duration={4000}
            closeButton
            toastOptions={{
              classNames: {
                toast:
                  'rounded-panel border border-line-strong bg-surface-3 text-fg-body shadow-xl',
                title: 'text-label font-semibold text-fg-strong',
                description: 'text-caption text-fg-muted',
                success: 'border-success/40',
                error: 'border-danger/40',
                warning: 'border-warning/40',
              },
            }}
          />
        </TooltipProvider>
      </body>
    </html>
  );
}
