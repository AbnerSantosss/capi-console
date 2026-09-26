'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { HelpCircle, LogOut, Plus, Settings } from '@/components/ui/icones';

import { AppMark } from '@/components/ui/app-mark';
import { Button } from '@/components/ui/button';
import { EmpresaDialog } from '@/components/empresa/EmpresaDialog';
import {
  EVENTO_EDITAR_EMPRESA,
  ID_AVISO_OUTRA_ABA,
  ListaDeEmpresas,
} from '@/components/empresa/SeletorDeEmpresa';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { reacaoAoNavegar } from '@/lib/abas-empresa';
import { destinoAoTrocar, slugDoEndereco } from '@/lib/empresa-do-endereco';
import { NOME_PRODUTO } from '@/lib/produto';
import {
  EVENTO_EMPRESA_TROCADA_FORA,
  useEmpresaStore,
  type DetalheTrocaFora,
  type EmpresaPublica,
} from '@/stores/useEmpresaStore';
import { useEventStore } from '@/stores/useEventStore';
import styles from './console.module.css';

/**
 * A lateral de empresas (V3 do v7): a coluna de 248px à esquerda, a partir
 * de `lg`. Abaixo disso o mesmo conteúdo abre numa gaveta (`GavetaDeEmpresas`).
 *
 * De cima para baixo: a marca, "Nova empresa", a lista de empresas com o
 * selo de estado e, no pé, Ajuda, Preferências e Sair — o que antes morava no
 * menu do operador, no canto do cabeçalho.
 *
 * A empresa marcada na lista é a do ENDEREÇO, nunca a do store. Trocar de
 * empresa é navegar (`ListaDeEmpresas`, V2).
 *
 * Esta lateral monta UMA vez em toda tela do console (mora no layout do
 * grupo), inclusive abaixo de `lg`, onde fica escondida por CSS e continua
 * montada. Por isso é ela a dona do que tem de existir uma vez só:
 *
 *  - o ouvinte de "outra aba trocou a empresa" (C2), que veio do antigo
 *    seletor do cabeçalho;
 *  - os diálogos de criar e editar empresa e o de Preferências, que a paleta,
 *    a lista e a gaveta abrem por evento de janela.
 */

/** Pede à lateral que abra as Preferências (o diálogo mora aqui). */
export const EVENTO_ABRIR_PREFERENCIAS = 'capi:abrir-preferencias';

/**
 * A lista de empresas que a casca mostra.
 *
 * O layout do servidor lê a lista uma vez, e layout não re-renderiza na
 * navegação: depois de criar uma empresa, a lista do servidor fica velha. A
 * do store é a que acompanha, então ela vale assim que chega. Até lá (e no
 * HTML do servidor, que não tem store) vale a do servidor, e as duas
 * renderizações começam iguais.
 */
export function useListaDeEmpresas(doServidor: EmpresaPublica[]): EmpresaPublica[] {
  const carregado = useEmpresaStore((s) => s.carregado);
  const doStore = useEmpresaStore((s) => s.empresas);
  return carregado && doStore.length > 0 ? doStore : doServidor;
}

/** Apaga o cookie de sessão e limpa PII do rascunho local (D10). */
async function sair() {
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
}

/*
 * O anel de foco daqui é o ciano da casca (`--border-focus`), e quem o pinta é
 * a regra `.lateral :focus-visible` de `console.module.css` (V9): a mesma cor
 * na coluna fixa, na gaveta e nas abas da empresa. Sob toque (`pointer:
 * coarse`), todo link e botão da lateral ganha 48px de altura por lá também.
 */
const ITEM_DO_PE =
  'flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * "Nova empresa": abre o diálogo de criar, que mora na lateral e atende por
 * evento de janela (`capi:adicionar-empresa`). A lateral, a gaveta e o vazio
 * de `/empresas` usam este mesmo botão, então o texto e o caminho são um só.
 */
export function BotaoNovaEmpresa({
  aoEscolher,
  className,
  size,
}: {
  aoEscolher?: () => void;
  className?: string;
  size?: React.ComponentProps<typeof Button>['size'];
}) {
  return (
    <Button
      variant="outline"
      size={size}
      className={className}
      onClick={() => {
        aoEscolher?.();
        window.dispatchEvent(new CustomEvent('capi:adicionar-empresa'));
      }}
    >
      <Plus aria-hidden />
      Nova empresa
    </Button>
  );
}

/**
 * "Pular para o conteúdo" (V9): o primeiro Tab de toda tela do console, em
 * qualquer largura. Leva o foco direto ao `<main>` da página, sem atravessar
 * a lista de empresas, o cabeçalho e as abas. Fica fora da tela até receber
 * foco (`.pularParaConteudo`). O `<main>` ganha `tabindex="-1"` só para
 * poder receber o foco; ele não entra na ordem do Tab.
 */
function PularParaConteudo() {
  const pular = () => {
    const principal = document.querySelector<HTMLElement>('[data-console] main');
    if (!principal) return;
    if (!principal.hasAttribute('tabindex')) principal.setAttribute('tabindex', '-1');
    principal.focus();
  };
  return (
    <button type="button" onClick={pular} className={`${styles.pularParaConteudo} text-label`}>
      Pular para o conteúdo
    </button>
  );
}

/**
 * O conteúdo da lateral, igual na coluna fixa e na gaveta. `aoEscolher` fecha
 * a gaveta quando o operador escolhe algo; `acaoDoTopo` é o botão de fechar
 * dela, ao lado da marca.
 */
export function ConteudoDaLateral({
  empresas,
  aoEscolher,
  acaoDoTopo,
}: {
  empresas: EmpresaPublica[];
  aoEscolher?: () => void;
  acaoDoTopo?: React.ReactNode;
}) {
  const pathname = usePathname();
  const idDoRotulo = React.useId();
  const naAjuda = pathname.startsWith('/guia');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* A marca, na altura do cabeçalho: as duas linhas se alinham. */}
      <div className="flex h-[var(--altura-cabecalho)] shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <Link
          href="/"
          onClick={aoEscolher}
          aria-label={`${NOME_PRODUTO}: ir para a Visão geral da empresa ativa`}
          className="flex min-w-0 items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <AppMark size={22} className="shrink-0 text-fg-strong" />
          <span className="truncate text-label font-semibold tracking-tight text-fg-strong">
            {NOME_PRODUTO}
          </span>
        </Link>
        {acaoDoTopo}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        <BotaoNovaEmpresa aoEscolher={aoEscolher} className="w-full justify-start" />

        <nav aria-labelledby={idDoRotulo} className="flex flex-col gap-1.5">
          <p
            id={idDoRotulo}
            className="px-2 text-caption font-semibold tracking-wide text-fg-muted uppercase"
          >
            Empresas
          </p>
          <ListaDeEmpresas empresas={empresas} aoEscolher={aoEscolher} />
        </nav>
      </div>

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-line px-3 py-3 text-label">
        <Link
          href="/guia"
          onClick={aoEscolher}
          aria-current={naAjuda ? 'page' : undefined}
          className={`${ITEM_DO_PE} ${naAjuda ? 'bg-tinta/15 font-medium text-fg-strong' : 'text-fg-body hover:text-fg-strong'}`}
        >
          <HelpCircle className="size-4 shrink-0" aria-hidden />
          Ajuda
        </Link>
        <button
          type="button"
          onClick={() => {
            aoEscolher?.();
            window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_PREFERENCIAS));
          }}
          className={`${ITEM_DO_PE} text-fg-body hover:text-fg-strong`}
        >
          <Settings className="size-4 shrink-0" aria-hidden />
          Preferências
        </button>
        <button
          type="button"
          onClick={() => void sair()}
          className={`${ITEM_DO_PE} text-danger`}
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          Sair do console
        </button>
      </div>
    </div>
  );
}

export function LateralDeEmpresas({ empresas: doServidor }: { empresas: EmpresaPublica[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const empresas = useListaDeEmpresas(doServidor);

  const [dialogo, setDialogo] = React.useState<
    { tipo: 'criar' } | { tipo: 'editar'; id: string } | null
  >(null);
  const [prefsAbertas, setPrefsAbertas] = React.useState(false);

  /**
   * O barramento de eventos de janela que o console já usa para abrir a
   * paleta (`capi:abrir-paleta`). "Nova empresa" (aqui e na gaveta), o lápis
   * da empresa aberta, "Preferências" e o item "Adicionar empresa" da paleta
   * falam com os diálogos daqui por ele: um diálogo só para cada coisa, montado
   * uma vez, em vez de um por lugar que o abre.
   */
  React.useEffect(() => {
    const criar = () => setDialogo({ tipo: 'criar' });
    const editar = (evento: Event) => {
      const id = (evento as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setDialogo({ tipo: 'editar', id });
    };
    const preferencias = () => setPrefsAbertas(true);
    window.addEventListener('capi:adicionar-empresa', criar);
    window.addEventListener(EVENTO_EDITAR_EMPRESA, editar);
    window.addEventListener(EVENTO_ABRIR_PREFERENCIAS, preferencias);
    return () => {
      window.removeEventListener('capi:adicionar-empresa', criar);
      window.removeEventListener(EVENTO_EDITAR_EMPRESA, editar);
      window.removeEventListener(EVENTO_ABRIR_PREFERENCIAS, preferencias);
    };
  }, []);

  /**
   * T6 (C2) — OUTRA aba trocou a empresa; o store já acompanhou (cookie,
   * estado, Pixels) e avisou por {@link EVENTO_EMPRESA_TROCADA_FORA}
   * (`capi:empresa-trocada-fora`). O efeito veio do antigo seletor do
   * cabeçalho sem mudança: a lateral o substitui e monta em toda tela.
   *
   *  - Sem rascunho: recarrega a tela (a página remonta pela `key` da empresa)
   *    e diz por que ela mudou sozinha.
   *  - Com rascunho: NÃO recarrega por cima do que o operador está digitando.
   *    Um aviso fixo diz de quem são os dados na tela e oferece "Recarregar
   *    agora". Até lá, o servidor recusa (409) salvar esses dados na empresa
   *    nova, porque o PUT diz de qual empresa eles são.
   *
   * `empresaDaTela` guarda a empresa que a tela ainda mostra enquanto o aviso
   * vale — é ela, e não a "anterior" da última troca, que o aviso tem de
   * nomear quando a outra aba troca duas vezes. Se a outra aba VOLTA para
   * essa empresa, não há nada a recarregar.
   *
   * V2 (v7): numa página de empresa (`/e/<slug>/…`), a empresa da tela é a do
   * ENDEREÇO, e acompanhar a outra aba é NAVEGAR para a mesma aba da empresa
   * nova (`destinoAoTrocar`). Reler a página não bastaria: o endereço seguiria
   * dizendo a empresa antiga. Fora de `/e/` (`/empresas`, `/guia`), relê.
   * Duas abas em empresas diferentes ao mesmo tempo continuam fora do jogo:
   * o store é um só para o navegador, e é dele que `pedir()` tira a empresa.
   */
  const empresaDaTela = React.useRef<string | null>(null);

  React.useEffect(() => {
    const recarregar = (idNovo: string) => {
      empresaDaTela.current = null;
      const slugNovo = useEmpresaStore.getState().empresas.find((e) => e.id === idNovo)?.slug;
      if (slugNovo && slugDoEndereco(pathname)) {
        router.push(destinoAoTrocar(pathname, slugNovo));
      } else {
        router.refresh();
      }
    };
    const aoTrocarFora = (evento: Event) => {
      const detalhe = (evento as CustomEvent<DetalheTrocaFora>).detail;
      if (!detalhe?.id) return;
      const { empresas: lista, rascunhoSujo } = useEmpresaStore.getState();
      const nomeDe = (id: string) => lista.find((e) => e.id === id)?.nome;
      const slugDaTela = slugDoEndereco(pathname);
      const doEndereco = slugDaTela ? lista.find((e) => e.slug === slugDaTela)?.id : undefined;
      const daTela = doEndereco ?? empresaDaTela.current ?? detalhe.anterior;

      if (daTela === detalhe.id) {
        empresaDaTela.current = null;
        toast.dismiss(ID_AVISO_OUTRA_ABA);
        const nome = nomeDe(detalhe.id);
        toast.success(
          nome
            ? `Outra aba voltou para ${nome}, a empresa desta tela.`
            : 'Outra aba voltou para a empresa desta tela.'
        );
        return;
      }

      if (!rascunhoSujo) {
        toast.dismiss(ID_AVISO_OUTRA_ABA);
        recarregar(detalhe.id);
        toast.info(
          `Empresa trocada em outra aba: agora você está em ${nomeDe(detalhe.id) ?? 'outra empresa'}`
        );
        return;
      }

      empresaDaTela.current = daTela;
      toast.warning(
        `Outra aba trocou para ${nomeDe(detalhe.id) ?? 'outra empresa'}. Esta tela ainda mostra dados de ${nomeDe(daTela) ?? 'a empresa anterior'}.`,
        {
          id: ID_AVISO_OUTRA_ABA,
          duration: Infinity,
          description: 'Recarregar descarta o que ainda não foi salvo nesta tela.',
          action: { label: 'Recarregar agora', onClick: () => recarregar(detalhe.id) },
        }
      );
    };
    window.addEventListener(EVENTO_EMPRESA_TROCADA_FORA, aoTrocarFora);
    return () => window.removeEventListener(EVENTO_EMPRESA_TROCADA_FORA, aoTrocarFora);
  }, [router, pathname]);

  /** A lista mais nova, lida de dentro do efeito sem virar dependência dele. */
  const listaAtual = React.useEffectEvent(() => empresas);

  /**
   * V3, passo 3a (ressalva 1 da revisão da V2): nunca mostrar dados de uma
   * empresa sob o endereço de outra.
   *
   * O caso: esta aba está em `/e/alfa/…` com rascunho, outra aba troca para
   * beta, e o aviso fixo sobe. Se o operador segue navegando DENTRO de alfa, a
   * árvore da empresa não remonta (mesma `key`), ninguém realinha o store, e
   * as telas passariam a pedir os dados de beta sob o endereço de alfa. Antes,
   * este efeito só apagava o aviso a cada navegação, e era exatamente isso que
   * acontecia.
   *
   * Agora, a cada endereço novo com o aviso de pé, vale de novo a regra de C2
   * (`reacaoAoNavegar`, em `abas-empresa.ts`): sem rascunho, a aba vai para a
   * mesma tela na empresa que está valendo; com rascunho, o aviso FICA. Se o
   * endereço novo é de outra empresa, foi escolha do operador, e ela vale.
   *
   * Só age com o aviso de pé (`empresaDaTela`). Numa troca comum, feita nesta
   * aba, o endereço muda ANTES de o `EmpresaDoEndereco` alinhar o store (o
   * efeito dele roda depois deste), e comparar os dois ali levaria a aba de
   * volta para a empresa de onde ela acabou de sair.
   *
   * 🔴 Não escreve no store nem no cookie: quem alinha é o `EmpresaDoEndereco`
   * da tela de destino. Escrever daqui faria duas abas trocarem uma com a
   * outra sem fim.
   */
  React.useEffect(() => {
    const idComAviso = empresaDaTela.current;
    if (idComAviso === null) return;
    const lista = listaAtual();
    const { empresaAtivaId, rascunhoSujo } = useEmpresaStore.getState();
    const reacao = reacaoAoNavegar({
      pathname,
      slugDoEndereco: slugDoEndereco(pathname),
      slugDoStore: lista.find((e) => e.id === empresaAtivaId)?.slug ?? null,
      temRascunho: rascunhoSujo,
      slugComAviso: lista.find((e) => e.id === idComAviso)?.slug ?? null,
    });
    if (reacao.tipo === 'manterAviso') return;
    empresaDaTela.current = null;
    toast.dismiss(ID_AVISO_OUTRA_ABA);
    if (reacao.tipo === 'ir') router.push(reacao.destino);
  }, [pathname, router]);

  const emEdicao =
    dialogo?.tipo === 'editar' ? empresas.find((e) => e.id === dialogo.id) : undefined;

  return (
    <>
      {/* Antes da lateral no DOM: é o primeiro Tab também abaixo de `lg`,
          quando a coluna fixa está escondida e o cabeçalho vem primeiro. */}
      <PularParaConteudo />
      <div className={`${styles.lateral} ${styles.lateralFixa}`}>
        <ConteudoDaLateral empresas={empresas} />
      </div>

      {/* Criar tem duas etapas (empresa + primeiro Pixel); editar só a
          primeira. Quem decide isso é a presença da prop `empresa`. */}
      <EmpresaDialog
        // Editar uma empresa que sumiu da lista não abre nada: sem a prop
        // `empresa`, o diálogo viraria o de CRIAR, e o operador não pediu isso.
        aberto={dialogo?.tipo === 'criar' || emEdicao !== undefined}
        onOpenChange={(aberto) => {
          if (!aberto) setDialogo(null);
        }}
        empresa={emEdicao}
      />
      <SettingsDialog open={prefsAbertas} onOpenChange={setPrefsAbertas} />
    </>
  );
}

export default LateralDeEmpresas;
