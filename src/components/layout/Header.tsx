'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  ChevronDown,
  FlaskConical,
  Gauge,
  LogOut,
  Plug,
  Plus,
  Settings,
  Command,
  Send,
  Target,
  Workflow,
} from 'lucide-react';

import { useBrandStore, limparLegado } from '@/stores/useBrandStore';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import { useEstadoAutomatico, type SituacaoAuto } from '@/hooks/useEstadoAutomatico';
import { useEventStore } from '@/stores/useEventStore';
import { Badge } from '@/components/ui/badge';
import { SeletorDeEmpresa } from '@/components/empresa/SeletorDeEmpresa';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { CommandPalette } from '@/components/common/CommandPalette';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Os dois caminhos ate a Meta precisam estar ditos aqui, com todas as letras:
 * quem abre o console tem que ver que existe um manual e um automatico, e
 * qual dos dois esta ligado. A sublinha so aparece em tela larga.
 *
 * O item Pixels e o que corrige IA-1: o Pixel era o assunto central
 * do produto e o unico sem lugar na navegacao — vivia atras de um botao do
 * cabecalho.
 *
 * 🔴 TETO DE CINCO ITENS (IA-R1'). Eram quatro. O Painel abriu a quinta vaga por
 * decisao explicita do dono, registrada em `wiki/plano-dashboard-ux.md` (§3-bis):
 * ele nao e uma etapa do trabalho como as outras quatro, e a resposta a primeira
 * pergunta de quem abre o console — "entrou venda? saiu para a Meta?" — e por
 * isso fica ANTES de Instalacao e e a tela de chegada (D-2'). Um SEXTO item
 * continua proibido: significa que algo deveria ter virado aba de um dos cinco.
 *
 * Depois do Painel, a ordem e a do trabalho real, e nao a da ordem em que as
 * telas nasceram: primeiro instalar (webhook e tag), depois dizer para qual
 * Pixel vai, depois disparar na mao e so entao deixar a regra disparar sozinha.
 * Quem chega numa empresa nova le a navegacao de cima para baixo e ja tem o
 * roteiro. O Guia saiu daqui: ele nao e uma etapa do trabalho, e a consulta —
 * virou icone do cabecalho.
 */
const NAV = [
  {
    href: '/painel',
    rotulo: 'Painel',
    curto: 'Painel',
    sub: 'o que chegou e de onde veio',
    icon: Gauge,
    estado: false,
  },
  {
    href: '/instalacao',
    rotulo: 'Instalação',
    curto: 'Instalação',
    sub: 'webhook e tag do site',
    icon: Plug,
    estado: false,
  },
  {
    href: '/pixels',
    rotulo: 'Pixels',
    curto: 'Pixels',
    sub: 'os destinos e a trava de cada um',
    icon: Target,
    estado: false,
  },
  {
    href: '/',
    rotulo: 'Disparo manual',
    curto: 'Manual',
    sub: 'você monta e envia',
    icon: Send,
    estado: false,
  },
  {
    // A sublinha nao cita mais a xWinner: o recebimento deixou de ser de uma
    // plataforma so, e prometer "webhook xWinner" numa instalacao de outra
    // empresa seria mentira na primeira tela.
    href: '/automatico',
    rotulo: 'Disparo automático',
    curto: 'Auto',
    sub: 'regras → Meta, sem você digitar',
    icon: Workflow,
    estado: true,
  },
];

/**
 * As quatro situações do disparo automático, ditas nas variantes do `Badge`.
 *
 * Antes daqui existia o `SELO_AUTO`: um mapa de classes próprio, terceiro
 * sistema de cor de estado do produto, paralelo às variantes e ao realce do
 * item ativo da navegação. Três vocabulários para a mesma pergunta — "isto
 * está ligado?" — é o que 13.B manda acabar.
 *
 * A leitura, nos termos de §12.6:
 *   carregando · ainda lendo as regras — neutro, porque ainda não é estado
 *   desligado   · "só acumulando fila": nada sai sem um clique — neutro
 *   teste       · sai sozinho, mas com código de teste — info, não é risco
 *   producao    · sai sozinho e entra nas métricas reais — aviso, é o perigoso
 */
const VARIANTE_AUTO: Record<
  SituacaoAuto,
  React.ComponentProps<typeof Badge>['variant']
> = {
  carregando: 'neutro',
  desligado: 'neutro',
  teste: 'info',
  producao: 'aviso',
};

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [prefsAbertas, setPrefsAbertas] = useState(false);

  const marcas = useBrandStore((s) => s.marcas);
  const marcaAtivaId = useBrandStore((s) => s.marcaAtivaId);
  const carregado = useBrandStore((s) => s.carregado);
  const carregar = useBrandStore((s) => s.carregar);
  const carregarEmpresas = useEmpresaStore((s) => s.carregar);
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

  // O hook devolve "—" enquanto le as regras, e travessao nao e estado: em
  // tela estreita isso ficava indistinguivel de "desligado".
  const rotuloAuto =
    automatico.situacao === 'carregando' ? 'lendo…' : automatico.rotulo;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-0/90 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 w-full max-w-[1280px] items-center gap-2 px-4 py-2 sm:px-6 lg:gap-4 lg:px-8">
        {/* Quem e a empresa dona da tela. O literal "Codigo Vencedor" que
            ficava aqui virou o nome da empresa ATIVA, lido do
            `useEmpresaStore` — o Codigo Vencedor passou a ser uma empresa
            entre outras, e a logo dela e o que sinaliza que todo o resto do
            cabecalho fala dela. O nome do produto desceu para a legenda. */}
        <SeletorDeEmpresa />

        {/* Navegacao */}
        {/* 🔴 A barra de cima só mostra o menu a partir de `xl` (1280px).
            Era `lg` (1024px) quando os itens eram quatro. Com o Painel, os
            cinco não cabiam mais ao lado do seletor de empresa e do aglomerado
            da direita: o espaçador `flex-1` era espremido a zero, o aglomerado
            (que encolhe) também ia a zero, e os botões dele — que não encolhem
            — vazavam 23px para fora da janela, cortados pela borda. Era
            exatamente o "coisa vazando da tela" relatado. Entre 1024 e 1279 o
            menu agora desce para a faixa de baixo, que é feita para isso. */}
        <nav aria-label="Seções" className="hidden items-center gap-1 xl:flex">
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
                  // `min-w-0 shrink`: entre 1024 e 1400px o menu inteiro cabe
                  // porque cada item aceita encolher — antes nenhum cedia e o
                  // cabecalho era cortado na borda direita.
                  'flex min-h-control-sm min-w-0 shrink items-center gap-2 rounded-control px-3 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text',
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
                      <Badge variant={VARIANTE_AUTO[automatico.situacao]}>
                        {rotuloAuto}
                      </Badge>
                    )}
                  </span>
                  {/* A sublinha so entra a partir de 2xl: em 1280–1400px era
                      ela quem estourava a largura do cabecalho. */}
                  <span className="mt-0.5 hidden whitespace-nowrap text-caption font-normal text-fg-muted 2xl:block">
                    {item.sub}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* O aglomerado da direita nao tinha contêiner: cada botao era filho
            direto da linha e nada podia quebrar. Agora eles moram num flex
            proprio que encolhe (`min-w-0 shrink`) e, quando ainda assim nao
            cabe, desce para uma segunda linha alinhada a direita
            (`flex-wrap justify-end gap-y-1`) em vez de ser cortado. */}
        <div className="flex min-w-0 shrink flex-wrap items-center justify-end gap-2 gap-y-1">
          {/* Ambiente — sempre visivel, em qualquer largura. Producao e o
              perigoso. Virou link porque o destino virou pagina: o que antes
              abria um modal agora leva para /pixels, com o cartao do Pixel
              ativo na ancora. */}
          {carregado && ativa && (
            <Link
              href={`/pixels#${ativa.id}`}
              className={cn(
                'flex h-control-sm shrink-0 items-center gap-2 rounded-control border px-2.5 text-caption font-semibold tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text',
                emTeste
                  ? 'border-accent-text/40 bg-accent-text/10 text-accent-text hover:bg-accent-text/15'
                  : 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/15'
              )}
              title={
                emTeste
                  ? `Modo teste com o código ${ativa.testCode}. Abre os Pixels para trocar o pixel, o token ou o modo.`
                  : 'Modo produção: o evento entra nas métricas reais da conta. Abre os Pixels para trocar o pixel, o token ou o modo.'
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
            </Link>
          )}

          {/* Mantido, e nao removido, porque quem usa o produto ja decorou onde
              este botao fica — o que mudou e para onde ele leva. */}
          <Link
            href="/pixels"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'hidden 2xl:flex'
            )}
          >
            <Target className="size-4" strokeWidth={1.75} aria-hidden />
            Pixel e token
          </Link>

          {/* "Adicionar empresa" no canto superior direito, ao lado de "Pixel e
              token" — pedido explicito do dono. Ele nao abre o dialogo por
              estado proprio: avisa o `SeletorDeEmpresa`, que e quem tem o
              `EmpresaDialog`, pelo mesmo barramento de evento de janela que
              este cabecalho ja usa para abrir a paleta. Assim existe UM dialogo
              de empresa na arvore, e nao um por botao que o invoca.
              O rotulo encolhe antes de sumir: em telas estreitas ficam so os
              icones, e quem le a tela por audio recebe o `aria-label`. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('capi:adicionar-empresa'))
            }
            aria-label="Adicionar empresa"
            title="Adicionar empresa"
          >
            <Building2 className="size-4" strokeWidth={1.75} aria-hidden />
            <Plus className="-ml-1 size-3" strokeWidth={2.5} aria-hidden />
            {/* O rotulo por extenso so a partir de 2xl. O apelido "Empresa"
                vale ate `xl`, que e onde o menu volta para a barra de cima e o
                espaco acaba; de `xl` a `2xl` ficam so os icones, e o
                `aria-label` acima continua dizendo a acao por extenso. */}
            <span className="hidden 2xl:inline">Adicionar empresa</span>
            <span className="hidden sm:inline xl:hidden">Empresa</span>
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
            {/* A letra do atalho so a partir de 2xl; o icone fica sempre e o
                `aria-label` acima diz a acao por extenso. */}
            <span className="hidden font-mono text-caption 2xl:inline">K</span>
          </Button>

          {/* O Guia saiu da navegacao porque ele nao e uma etapa do trabalho: e
              consulta, do mesmo naipe das preferencias e do sair. Aqui ele fica
              visivel em qualquer largura — inclusive no celular, onde a grade
              de quatro nao tinha vaga para ele. */}
          <Link
            href="/guia"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            aria-label="Guia"
            title="Guia"
          >
            <BookOpen className="size-4" aria-hidden />
          </Link>

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
      </div>

      {/* Navegação e configuração em telas menores.

          `grid-cols-5` porque os itens agora são cinco: com quatro colunas o
          Painel descia sozinho para uma segunda linha, meia-largura, com cara
          de erro. E `xl:hidden` para casar com o `xl:flex` da barra de cima —
          se os dois usassem breakpoints diferentes, haveria uma faixa de
          largura com dois menus ou com nenhum. */}
      <nav
        aria-label="Seções"
        className="mx-auto grid w-full max-w-[1280px] grid-cols-5 gap-1 border-t border-line px-4 py-1.5 sm:px-6 xl:hidden"
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
              {/* So quando o rotulo curto nao e o completo: com os dois iguais
                  o leitor de tela anunciava "Pixels Pixels". */}
              {item.curto !== item.rotulo && (
                <span className="sr-only">{item.rotulo}</span>
              )}
            </Link>
          );
        })}
        {/* A grade continua em quatro colunas e nenhum assunto foi escondido:
            o "Pixel" que abria modal virou item da propria navegacao, e agora
            o Guia cedeu a vaga para Instalacao — ele continua a um toque, como
            icone do cabecalho, que aparece em qualquer largura. */}
      </nav>

      {/* Estado do automatico por escrito. Em tela estreita ele so existia
          como um ponto colorido no icone — cor sozinha nao e rotulo. */}
      <div className="mx-auto flex w-full max-w-[1280px] items-center gap-2 border-t border-line px-4 py-1.5 sm:px-6 lg:hidden">
        <Workflow className="size-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} aria-hidden />
        <span className="text-caption text-fg-muted">Disparo automático:</span>
        <Badge variant={VARIANTE_AUTO[automatico.situacao]}>{rotuloAuto}</Badge>
      </div>

      <SettingsDialog open={prefsAbertas} onOpenChange={setPrefsAbertas} />
      {/* "Pixel e token" na paleta deixou de abrir um modal e passou a ser o
          que o nome sempre prometeu: ir para o lugar onde o Pixel mora. */}
      <CommandPalette onAbrirMarcas={() => router.push('/pixels')} />
    </header>
  );
}

export default Header;
