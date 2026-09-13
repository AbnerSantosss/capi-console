'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from '@base-ui/react/menu';
import { toast } from 'sonner';
import { Building2, Check, ChevronDown, Pencil, Plus } from 'lucide-react';

import { useEmpresaStore, type EmpresaPublica } from '@/stores/useEmpresaStore';
import { EmpresaDialog } from '@/components/empresa/EmpresaDialog';
import { NOME_PRODUTO } from '@/lib/produto';
import { cn } from '@/lib/utils';

/**
 * Quem e a empresa dona de tudo o que esta na tela (P8).
 *
 * Isto ocupa o lugar do bloco fixo do cabecalho — o que ate a FASE D dizia
 * "Meta CAPI Console" em cima e o literal "Codigo Vencedor" embaixo. A ordem
 * das duas linhas INVERTEU de proposito, e nao por estetica: o dono pediu "a
 * logo dela sinalizada pra ver que todo esse menu e referente a ela". A linha
 * forte passa a ser a EMPRESA, porque e ela que muda; o produto vira a
 * legenda, porque ele e sempre o mesmo. Com varias empresas no mesmo console,
 * errar de empresa custa um evento real disparado para o Pixel errado — entao
 * quem esta ativo precisa ser a primeira coisa legivel do cabecalho, nao a
 * segunda.
 *
 * 🔴 Nenhum `fetch` aqui (E-8): a leitura e a gravacao moram no
 * `useEmpresaStore`. Este componente so pede e mostra.
 *
 * 🔴 Nenhuma cor nova: as classes sao as do DS (`surface-*`, `fg-*`, `line*`,
 * `accent-text`). A UNICA cor arbitraria da tela e a `cor` que o operador
 * escolheu para a empresa, e ela entra por `style` — e dado, nao classe.
 */

/* ------------------------------------------------------------------ */
/* A insignia — logo quando existe, iniciais quando nao                */
/* ------------------------------------------------------------------ */

/** Ate duas letras: a inicial da primeira e a da ultima palavra do nome. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * A cor da empresa e escolha do operador, entao ela pode ser clara OU escura —
 * e texto branco sobre amarelo nao se le. Por isso a letra alterna entre o
 * branco que o botao primario ja usa e a propria superficie de fundo do app
 * (`--surface-0`, quase preta). Continua sem cor nova: sao os dois extremos da
 * paleta que ja existem.
 */
function letraEscura(cor: string): boolean {
  const casa = /^#([0-9a-f]{6})$/i.exec(cor.trim());
  if (!casa) return false;
  const n = Number.parseInt(casa[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Luminancia percebida (ITU-R BT.601) — basta para decidir preto x branco.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

function Insignia({
  empresa,
  className,
}: {
  empresa: EmpresaPublica;
  className?: string;
}) {
  const fonte = empresa.logoDataUrl ?? empresa.logoUrl;

  if (fonte) {
    return (
      // A logo e DECORATIVA (`alt=""`) porque o nome da empresa esta escrito ao
      // lado, em texto: descrever a imagem aqui faria o leitor de tela dizer o
      // nome duas vezes.
      // A logo chega como `data:` URL gravada pelo operador (teto de 150 KB no
      // servidor): o next/image nao otimiza `data:` e nao ha dominio remoto
      // para configurar, entao <img> aqui e a escolha certa, nao um atalho.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fonte}
        alt=""
        className={cn('shrink-0 rounded object-cover', className)}
      />
    );
  }

  const cor = empresa.cor?.trim();

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full text-caption font-semibold',
        cor
          ? letraEscura(cor)
            ? 'text-surface-0'
            : 'text-white'
          : 'bg-surface-2 text-fg-body',
        className
      )}
      style={cor ? { backgroundColor: cor } : undefined}
    >
      {iniciaisDe(empresa.nome)}
    </span>
  );
}

/* ------------------------------------------------------------------ */

export function SeletorDeEmpresa(): React.JSX.Element {
  const router = useRouter();

  const empresas = useEmpresaStore((s) => s.empresas);
  const empresaAtivaId = useEmpresaStore((s) => s.empresaAtivaId);
  const setEmpresaAtiva = useEmpresaStore((s) => s.setEmpresaAtiva);

  const [menuAberto, setMenuAberto] = React.useState(false);
  const [dialogo, setDialogo] = React.useState<'criar' | 'editar' | null>(null);

  const ativa = empresas.find((e) => e.id === empresaAtivaId) ?? empresas[0];

  /**
   * O barramento de eventos de janela que o cabecalho JA usa para abrir a
   * paleta (`capi:abrir-paleta`). O botao "Adicionar empresa" do canto
   * superior direito e os dois itens da paleta falam com este componente por
   * aqui — o dialogo e o menu moram DENTRO do seletor (ele nao recebe props,
   * por contrato), e inventar um contexto novo so para dois botoes seria mais
   * peca do que o problema pede.
   */
  React.useEffect(() => {
    const abrirMenu = () => setMenuAberto(true);
    const abrirDialogo = () => setDialogo('criar');
    window.addEventListener('capi:trocar-empresa', abrirMenu);
    window.addEventListener('capi:adicionar-empresa', abrirDialogo);
    return () => {
      window.removeEventListener('capi:trocar-empresa', abrirMenu);
      window.removeEventListener('capi:adicionar-empresa', abrirDialogo);
    };
  }, []);

  const trocar = async (empresa: EmpresaPublica) => {
    setMenuAberto(false);
    if (empresa.id === empresaAtivaId) return;
    try {
      await setEmpresaAtiva(empresa.id);
      // `router.refresh()` e o que faz as paginas de servidor (/instalacao,
      // /automatico) relerem com o cookie novo. Sem ele o cabecalho trocaria
      // de nome e o corpo continuaria mostrando o webhook da empresa anterior.
      router.refresh();
      toast.success(`Agora você está em ${empresa.nome}`);
    } catch (e) {
      toast.error('Não foi possível trocar de empresa', {
        description:
          e instanceof Error ? e.message : 'Tente de novo em alguns instantes.',
      });
    }
  };

  return (
    <>
      <Menu.Root open={menuAberto} onOpenChange={setMenuAberto}>
        <Menu.Trigger
          render={
            <button
              type="button"
              // Botao de verdade, e nao uma div clicavel: o teclado precisa
              // chegar aqui com Tab e abrir com Enter/Espaco.
              aria-label={
                ativa
                  ? `Empresa ativa: ${ativa.nome}. Trocar de empresa`
                  : 'Trocar de empresa'
              }
              className="flex h-control-sm shrink-0 cursor-pointer items-center gap-2.5 rounded-control px-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text aria-expanded:bg-surface-2"
            />
          }
        >
          {ativa ? (
            <Insignia empresa={ativa} className="size-7" />
          ) : (
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
            >
              <Building2 className="size-4" strokeWidth={1.75} />
            </span>
          )}
          <span className="hidden min-w-0 flex-col leading-none sm:flex">
            <span className="max-w-40 truncate text-label font-semibold text-fg-strong">
              {ativa ? ativa.nome : NOME_PRODUTO}
            </span>
            <span className="mt-0.5 truncate text-caption text-fg-muted">
              {ativa ? NOME_PRODUTO : 'lendo as empresas…'}
            </span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="start"
            sideOffset={6}
            className="isolate z-50"
          >
            <Menu.Popup className="min-w-60 origin-(--transform-origin) rounded-panel border border-line-control bg-surface-3 p-1 shadow-lg outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              {/* O `Menu.Group` nao e enfeite: o `Menu.GroupLabel` LANCA se
                  nao achar o contexto do grupo (MenuGroupContext), e e ele
                  que amarra o rotulo ao `role="group"` para o leitor de tela. */}
              <Menu.Group>
                <Menu.GroupLabel className="px-2 py-1.5 text-caption font-semibold tracking-wide text-fg-muted uppercase">
                  Empresas
                </Menu.GroupLabel>

                {empresas.map((empresa) => {
                  const estaAtiva = empresa.id === (ativa?.id ?? empresaAtivaId);
                  return (
                    <Menu.Item
                      key={empresa.id}
                      onClick={() => void trocar(empresa)}
                      className="flex cursor-default items-center gap-2.5 rounded-control border-l-2 border-transparent px-2 py-1.5 text-body text-fg-body outline-none select-none data-highlighted:border-accent-text data-highlighted:bg-accent-text/15 data-highlighted:text-fg-strong"
                    >
                      <Insignia empresa={empresa} className="size-5" />
                      <span className="min-w-0 flex-1 truncate">{empresa.nome}</span>
                      {/* O ✓ e o que diz qual esta ativa — cor sozinha nao e
                          rotulo, e um leitor de tela nao ve realce nenhum. */}
                      {estaAtiva && (
                        <>
                          <Check className="size-4 shrink-0 text-accent-text" aria-hidden />
                          <span className="sr-only">(empresa ativa)</span>
                        </>
                      )}
                    </Menu.Item>
                  );
                })}
              </Menu.Group>

              <Menu.Separator className="my-1 h-px bg-line-strong" />

              <Menu.Item
                onClick={() => setDialogo('criar')}
                className="flex cursor-default items-center gap-2.5 rounded-control border-l-2 border-transparent px-2 py-1.5 text-body text-fg-body outline-none select-none data-highlighted:border-accent-text data-highlighted:bg-accent-text/15 data-highlighted:text-fg-strong"
              >
                <Plus className="size-4 shrink-0" aria-hidden />
                Adicionar empresa
              </Menu.Item>

              {ativa && (
                <Menu.Item
                  onClick={() => setDialogo('editar')}
                  className="flex cursor-default items-center gap-2.5 rounded-control border-l-2 border-transparent px-2 py-1.5 text-body text-fg-body outline-none select-none data-highlighted:border-accent-text data-highlighted:bg-accent-text/15 data-highlighted:text-fg-strong"
                >
                  <Pencil className="size-4 shrink-0" aria-hidden />
                  Editar empresa atual
                </Menu.Item>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* Criar tem duas etapas (empresa + primeiro Pixel); editar so a
          primeira. Quem decide isso e a presenca da prop `empresa`. */}
      <EmpresaDialog
        aberto={dialogo !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setDialogo(null);
        }}
        empresa={dialogo === 'editar' ? ativa : undefined}
      />
    </>
  );
}

export default SeletorDeEmpresa;
