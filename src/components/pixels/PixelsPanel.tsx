'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Target } from 'lucide-react';

import { useBrandStore, type MarcaPublica } from '@/stores/useBrandStore';
import { BrandDialog } from '@/components/brand/BrandDialog';
import { PixelCard } from '@/components/pixels/PixelCard';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import {
  Esqueleto,
  RegiaoDeEspera,
  Spinner,
  useEscadaDeEspera,
} from '@/components/common/Esqueleto';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * A lista de Pixels — a parte de /pixels que precisa de estado.
 *
 * Ela e a mesma lista que morava dentro do `BrandDialog`. Sair do modal nao e
 * mudanca de enfeite: enquanto estava la, nao havia URL para um Pixel, nem
 * como ver o estado de um Pixel sem abrir o modal (IA-1).
 *
 * O dado vem TODO do `useBrandStore` — nao ha um `fetch('/api/marcas')` nesta
 * pagina de proposito (IA-R8). E a mesma lista que o cabecalho e o disparo
 * manual leem, entao trocar o ativo aqui aparece la no mesmo quadro.
 */
export function PixelsPanel() {
  const marcas = useBrandStore((s) => s.marcas);
  const marcaAtivaId = useBrandStore((s) => s.marcaAtivaId);
  const carregando = useBrandStore((s) => s.carregando);
  const carregado = useBrandStore((s) => s.carregado);
  const erro = useBrandStore((s) => s.erro);
  const carregar = useBrandStore((s) => s.carregar);
  const setMarcaAtiva = useBrandStore((s) => s.setMarcaAtiva);
  const removerMarca = useBrandStore((s) => s.removerMarca);

  // `aberto` separado de `emEdicao` para que o dialogo possa fechar com
  // animacao sem o titulo trocar para "Novo Pixel" no meio da saida.
  const [dialogoAberto, setDialogoAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<MarcaPublica | null>(null);
  const [aApagar, setAApagar] = React.useState<MarcaPublica | null>(null);
  const [apagando, setApagando] = React.useState(false);

  const fase = useEscadaDeEspera(carregando && !carregado);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  // A ancora de /pixels#marca_abc. A rolagem nativa do navegador acontece
  // antes de a lista chegar do servidor e nao encontra elemento nenhum —
  // por isso ela e refeita assim que os cartoes existem.
  React.useEffect(() => {
    if (!carregado) return;
    const alvo = decodeURIComponent(window.location.hash.slice(1));
    if (!alvo) return;
    document.getElementById(alvo)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    });
  }, [carregado]);

  const abrirNovo = () => {
    setEmEdicao(null);
    setDialogoAberto(true);
  };

  const abrirEdicao = (marca: MarcaPublica) => {
    setEmEdicao(marca);
    setDialogoAberto(true);
  };

  const usar = (marca: MarcaPublica) => {
    setMarcaAtiva(marca.id);
    toast.success(`Disparo manual apontando para ${marca.nome}`, {
      description: marca.temToken
        ? undefined
        : 'Atenção: este Pixel está sem token, então nada sai enquanto isso não for resolvido.',
    });
  };

  const confirmarApagar = async () => {
    if (!aApagar) return;
    setApagando(true);
    try {
      await removerMarca(aApagar.id);
      toast.success(`${aApagar.nome} removido.`);
      setAApagar(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao remover.');
    } finally {
      setApagando(false);
    }
  };

  const botaoAdicionar = (
    <Button onClick={abrirNovo}>
      <Plus className="size-4" aria-hidden />
      Adicionar Pixel
    </Button>
  );

  /* ---------------------------------------------------------------- */

  let conteudo: React.ReactNode;

  if (!carregado && fase !== 'nada') {
    conteudo = (
      <RegiaoDeEspera rotulo="Carregando os Pixels">
        {fase === 'spinner' ? (
          <p className="flex items-center gap-2 text-caption text-fg-muted">
            <Spinner />
            Lendo os Pixels…
          </p>
        ) : (
          // C-16: a geometria do que vem, nao um retangulo qualquer — tres
          // cartoes da mesma altura dos de verdade.
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-[116px] rounded-panel" />
            ))}
          </div>
        )}
      </RegiaoDeEspera>
    );
  } else if (erro) {
    conteudo = (
      <EstadoVazio
        cenario="erro"
        titulo="Não foi possível ler os Pixels"
        motivo={erro}
        acao={
          <Button variant="outline" onClick={() => void carregar()}>
            Tentar de novo
          </Button>
        }
      />
    );
  } else if (marcas.length === 0) {
    conteudo = (
      <EstadoVazio
        icone={Target}
        titulo="Nenhum Pixel cadastrado"
        motivo="Um Pixel guarda o número do Pixel, o token da API de Conversões e o código de teste. Sem pelo menos um, não há para onde disparar."
        acao={botaoAdicionar}
      />
    );
  } else {
    conteudo = (
      <ul className="flex flex-col gap-3">
        {marcas.map((marca) => (
          <PixelCard
            key={marca.id}
            marca={marca}
            ativo={marca.id === marcaAtivaId}
            onUsar={() => usar(marca)}
            onEditar={() => abrirEdicao(marca)}
            // A trava do `default` e de config-store.ts: sem o botao aqui, o
            // servidor recusaria de todo jeito — e o operador nao levaria um
            // erro por ter clicado no que a tela ofereceu.
            onApagar={marca.id === 'default' ? undefined : () => setAApagar(marca)}
          />
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title font-semibold text-fg-strong">
          {carregado && !erro
            ? marcas.length === 1
              ? '1 Pixel'
              : `${marcas.length} Pixels`
            : 'Pixels'}
        </h2>
        {botaoAdicionar}
      </div>

      {conteudo}

      <BrandDialog
        open={dialogoAberto}
        onOpenChange={setDialogoAberto}
        marca={emEdicao}
      />

      <AlertDialog
        open={aApagar !== null}
        onOpenChange={(v) => {
          if (!v) setAApagar(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {aApagar?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O token de acesso guardado para este Pixel é apagado junto e não
              volta. Regras e retornos que apontem para ele param de encontrar
              destino.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apagando} />
            <AlertDialogAction
              variant="destructive"
              disabled={apagando}
              onClick={() => void confirmarApagar()}
            >
              {apagando ? 'Apagando…' : 'Apagar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default PixelsPanel;
