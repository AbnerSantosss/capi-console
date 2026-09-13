'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Target } from 'lucide-react';

import { useBrandStore, type MarcaPublica } from '@/stores/useBrandStore';
import { useRegrasDeRoteamento } from '@/hooks/useEstadoAutomatico';
import { BrandDialog } from '@/components/brand/BrandDialog';
import { CardDePixel } from '@/components/pixels/CardDePixel';
import {
  contarRegrasAuto,
  contarRegrasQueEnviam,
} from '@/components/pixels/estado-pixel';
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
 * O dado de Pixel vem TODO do `useBrandStore` — nao ha um `fetch('/api/marcas')`
 * nesta pagina de proposito (IA-R8). E a mesma lista que o cabecalho e o
 * disparo manual leem, entao trocar o ativo aqui aparece la no mesmo quadro.
 *
 * As REGRAS sao a segunda leitura desta tela, e ela e obrigatoria por dois
 * motivos que nao tem outra fonte:
 *   - o estado 🟡 de 8.2.3 depende de quantas regras em `auto` apontam para o
 *     Pixel;
 *   - PX-11 exige que a confirmacao de apagar CONTE as regras afetadas, em vez
 *     de dizer "pode afetar regras".
 * Nenhuma rota nova (8.4, 8.A) e nenhuma leitura nova: e LITERALMENTE o mesmo
 * GET /api/integracoes que o cabecalho ja faz em toda pagina do console, agora
 * lido inteiro em vez de reduzido a um numero — `useRegrasDeRoteamento()`.
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

  /**
   * As regras de roteamento, do store compartilhado. `null` enquanto nao se
   * sabe — e `null` NAO vira zero: PX-11 pede a contagem de verdade, e
   * "0 regras enviam para ele" quando a leitura falhou seria um numero falso
   * na hora de apagar.
   */
  const regras = useRegrasDeRoteamento();

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

  // PX-12 — o foco inicial da confirmacao vai para "Cancelar", nunca para o
  // botao destrutivo. A ordem do rodape ja poe Cancelar primeiro, mas ordem e
  // acidente de layout: trocar os dois de lugar amanha nao pode transformar
  // "Enter sem ler" em um Pixel apagado.
  const refCancelar = React.useRef<HTMLButtonElement | null>(null);

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
              <Esqueleto key={i} className="h-[248px] rounded-panel" />
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
          <CardDePixel
            key={marca.id}
            marca={marca}
            ativo={marca.id === marcaAtivaId}
            // Regras ainda nao lidas contam como zero SO para o estado: o 🟡
            // ("ligado e nada acontece") e o 🟢 dependem disto, e enquanto o
            // campo `autoDisparo` nao existir (FASE 6) nenhum dos dois pode
            // aparecer de qualquer forma — o card para em ⚪ antes de chegar
            // aqui. Na confirmacao de apagar, onde o numero vira frase, `null`
            // continua sendo `null`.
            regrasAuto={regras ? contarRegrasAuto(regras, marca.id) : 0}
            onUsar={() => usar(marca)}
            onEditar={() => abrirEdicao(marca)}
            // A trava do `default` e de config-store.ts: sem o item de menu
            // aqui, o servidor recusaria de todo jeito — e o operador nao
            // levaria um erro por ter clicado no que a tela ofereceu.
            onApagar={marca.id === 'default' ? undefined : () => setAApagar(marca)}
          />
        ))}
      </ul>
    );
  }

  /* ---------------------------------------------------------------- */
  /* PX-11 — a confirmacao nomeia o Pixel e CONTA as regras afetadas   */
  /* ---------------------------------------------------------------- */

  const afetadas =
    aApagar && regras ? contarRegrasQueEnviam(regras, aApagar.id) : null;

  let consequencia: React.ReactNode;
  if (afetadas === null) {
    // Sem a lista de regras, a tela diz que nao sabe. Inventar "0 regras" aqui
    // seria o pior dos mundos: a frase mais tranquilizadora no momento em que
    // menos se pode garantir.
    consequencia =
      'Não foi possível conferir quantas regras enviam para ele — a lista de regras não carregou. As regras que apontarem para este Pixel continuarão existindo, mas ficarão sem destino.';
  } else if (afetadas === 0) {
    consequencia =
      'Nenhuma regra envia para ele. Eventos já enviados não são afetados.';
  } else if (afetadas === 1) {
    consequencia =
      '1 regra envia para ele. Ela continuará existindo, mas ficará sem destino. Eventos já enviados não são afetados.';
  } else {
    consequencia = `${afetadas} regras enviam para ele. Elas continuarão existindo, mas ficarão sem destino. Eventos já enviados não são afetados.`;
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
        <AlertDialogContent initialFocus={refCancelar}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apagar o Pixel &ldquo;{aApagar?.nome}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {consequencia} O token de acesso guardado para este Pixel é
              apagado junto e não volta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={refCancelar} disabled={apagando} />
            <AlertDialogAction
              variant="destructive"
              disabled={apagando}
              onClick={() => void confirmarApagar()}
            >
              {apagando ? 'Apagando…' : 'Apagar Pixel'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default PixelsPanel;
