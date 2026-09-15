import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppChrome } from '@/components/common/AppChrome';
import { DESCRICAO_PRODUTO, NOME_PRODUTO } from '@/lib/produto';
import './globals.css';

// IBM Plex Sans + IBM Plex Mono.
//
// Antes era Geist, e antes disso Plus Jakarta. A Geist é a fonte que vem de
// fábrica em projeto Next.js — junto com Inter e DM Sans, é o que todo
// console gerado por IA usa, e é parte do motivo de o produto parecer igual a
// todos os outros por mais que a gente refatore.
//
// A Plex não é neutra: tem o "a" de dois andares com a cauda reta, o "g" de
// um andar, terminais cortados em ângulo e um "l" com pé. São detalhes que se
// leem como uma decisão de alguém. Foi desenhada para produto técnico denso,
// que é exatamente esta tela, e tem um itálico verdadeiro (não oblíquo).
//
// A mono é a irmã da mesma família e essa é a razão de peso aqui: este
// console mostra id, hash, fbtrace, token e valor o tempo todo, e com famílias
// irmãs eles alinham com o texto ao redor em vez de parecerem citação colada
// de outro sistema. Os nomes das variáveis CSS continuam os mesmos.
const sans = IBM_Plex_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

// O título e a descrição saem de `produto.ts`: eles aparecem na aba do
// navegador e na prévia de link, e prender o nome de UMA empresa ("do Código
// Vencedor") aí era a mesma promessa quebrada que o resto da FASE C desfaz —
// o console passou a ser de quem instalar, não de um cliente só.
export const metadata: Metadata = {
  title: NOME_PRODUTO,
  description: DESCRICAO_PRODUTO,
};

export const viewport: Viewport = {
  // = --surface-0 de globals.css. O gate (G7) reprova se os dois divergirem:
  // a barra do navegador precisa ser a mesma cor do fundo da aplicacao.
  themeColor: '#0d0b08',
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
