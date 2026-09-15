'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUpIcon,
  CircleSlash,
  Clock,
  FlaskConical,
  Inbox,
  ShieldAlert,
  Users,
} from '@/components/ui/icones';

import { pedir } from '@/lib/cliente-api';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import { Callout, Panel, Section } from '@/components/common/primitives';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import { Esqueleto } from '@/components/common/Esqueleto';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buscaDoPeriodo,
  periodoDaBusca,
  respostaEhDoPeriodo,
  rotuloDoPeriodo,
  SeletorDePeriodo,
  type PeriodoEscolhido,
} from '@/components/common/SeletorDePeriodo';
import { cn } from '@/lib/utils';

/**
 * Quem foram as pessoas por trás de um número do Painel.
 *
 * O Painel responde "quantos"; esta tela responde "quem". Ela é o destino dos
 * cliques em "Compras no período" e em cada nome de "Quais eventos chegaram" —
 * e é uma ROTA de verdade, não um recorte aberto embaixo do card: o operador
 * precisa poder mandar o link para alguém e voltar com o botão do navegador.
 *
 * 🔴 O período mora na URL, e não em estado local. É ele que faz a lista bater
 * com o número clicado: quem chegou aqui com `?dias=hoje` veio de um card que
 * contou "hoje", e trocar o botão reescreve a URL — assim recarregar a página,
 * copiar o link ou voltar mostram sempre o mesmo recorte.
 *
 * 🔴 E-mail sai MASCARADO da rota (`/api/inbox/pessoas`) e o nome sai inteiro.
 * Não é descuido nos dois sentidos: e-mail é credencial de acesso ao produto,
 * nome é como o operador acha a pessoa no backoffice.
 *
 * FASE 5 do redesign v4 — DADO TABULAR É TABELA.
 *
 * Isto aqui é uma planilha de compras: mesmos campos, uma linha por pessoa,
 * valores que só querem ser comparados de cima para baixo. Em cartão empilhado
 * o valor de cada linha nascia numa coluna diferente, e comparar R$ 497 com
 * R$ 1.497 virava trabalho de olho. A partir de 48rem a lista é uma `<table>`
 * de verdade, montada com `@tanstack/react-table` v9: cabeçalho fixo em cada
 * coluna, ordenação por quem/evento/valor/quando, dinheiro em `font-mono` +
 * `tabular-nums` alinhado à direita (o separador decimal cai sempre no mesmo
 * lugar) e separação por FILETE (`divide-y divide-line`) — nunca zebra, que é
 * pintar metade das linhas de uma cor que não quer dizer nada.
 *
 * 🔴 A ordem que chega do servidor é a ordem de estreia: `sorting` nasce vazio.
 * Ordenar é ESCOLHA de quem olha, e nenhuma coluna ordena sozinha — senão a
 * lista mentiria sobre qual recorte o card do Painel contou.
 *
 * Abaixo de 48rem a tabela dá lugar ao cartão de sempre, com os MESMOS dados e
 * a mesma ordem: numa tela de 390px seis colunas viram seis colunas de uma
 * palavra, e nada do que a linha diz pode sumir só porque o vidro encolheu.
 */

/* ------------------------------------------------------------------ */
/* O que a rota devolve                                                */
/* ------------------------------------------------------------------ */

type MotivoDeTeste = 'email-cadastrado' | 'nome-cadastrado' | 'padrao-conhecido' | 'email-repetido';

interface PessoaDoEvento {
  id: string;
  recebidoEm: string;
  nomeCliente?: string;
  emailMascarado?: string;
  orderId?: string;
  valor?: number;
  moeda?: string;
  evento: string;
  eventoMeta?: string;
  status: 'novo' | 'carregado' | 'disparado' | 'ignorado' | 'erro' | string;
  atribuicao: 'meta' | 'google' | 'tiktok' | 'microsoft' | 'nenhuma';
  emq?: number;
  motivoDeTeste?: MotivoDeTeste;
  explicacaoDeTeste?: string;
  autoBloqueadoPorSuspeita?: boolean;
  testeInterno?: boolean;
  testePlataforma?: boolean;
}

interface RespostaPessoas {
  pessoas: PessoaDoEvento[];
  periodo: string | number | { de: string; ate: string };
  janela: { inicio: string; fim: string };
  amostra: number;
  tetoDaAmostra: number;
}

/* ------------------------------------------------------------------ */
/* Vocabulário da linha                                                */
/* ------------------------------------------------------------------ */

const dinheiro = (v?: number, moeda = 'BRL') =>
  v === undefined || !Number.isFinite(v)
    ? '—'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(v);

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * De onde veio o clique, em palavra.
 *
 * "Sem atribuição" NÃO é defeito nem erro, e por isso o selo é neutro e não de
 * perigo: é a venda PIX sem rastro do anúncio — exatamente a venda que este
 * console existe para recuperar. O que ela perde é o direito de contar como
 * resultado de campanha, não o direito de ir para a Meta.
 */
const ROTULO_ATRIBUICAO: Record<PessoaDoEvento['atribuicao'], string> = {
  meta: 'clique da Meta',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
  microsoft: 'Microsoft Ads',
  nenhuma: 'sem atribuição',
};

const TOM_ATRIBUICAO: Record<
  PessoaDoEvento['atribuicao'],
  'info' | 'neutro' | 'sucesso' | 'aviso' | 'perigo'
> = {
  meta: 'info',
  google: 'neutro',
  tiktok: 'neutro',
  microsoft: 'neutro',
  nenhuma: 'neutro',
};

const ROTULO_STATUS: Record<string, string> = {
  novo: 'na fila',
  carregado: 'carregado no disparo',
  disparado: 'enviado à Meta',
  ignorado: 'não enviado',
  erro: 'erro no envio',
};

const TOM_STATUS: Record<string, 'sucesso' | 'aviso' | 'perigo' | 'neutro'> = {
  novo: 'aviso',
  carregado: 'neutro',
  disparado: 'sucesso',
  ignorado: 'neutro',
  erro: 'perigo',
};

const ROTULO_MOTIVO: Record<MotivoDeTeste, string> = {
  'email-cadastrado': 'e-mail na lista de testes',
  'nome-cadastrado': 'nome na lista de testes',
  'padrao-conhecido': 'padrão de teste',
  'email-repetido': 'mesmo e-mail em várias compras',
};

const ehDaEquipe = (p: PessoaDoEvento) => p.testeInterno === true || p.testePlataforma === true;

/* ------------------------------------------------------------------ */
/* Pedaços de célula, reaproveitados pela tabela e pelo cartão          */
/* ------------------------------------------------------------------ */

function Quem({ p }: { p: PessoaDoEvento }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="min-w-0 break-words text-label font-medium text-fg-strong">
        {p.nomeCliente || 'sem nome no evento'}
      </span>
      {(p.emailMascarado || p.orderId) && (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-fg-muted">
          {p.emailMascarado && (
            <span className="wrap-token min-w-0 font-mono">{p.emailMascarado}</span>
          )}
          {p.orderId && <span className="wrap-token min-w-0 font-mono">pedido {p.orderId}</span>}
        </span>
      )}
    </div>
  );
}

/**
 * Dinheiro e EMQ na mesma pilha, os dois à direita e os dois tabulares: é a
 * coluna que existe para ser lida na vertical, e um número que balança de meio
 * pixel por linha destrói exatamente essa leitura.
 */
function Valor({ p }: { p: PessoaDoEvento }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-label font-semibold whitespace-nowrap text-fg-strong tabular-nums">
        {dinheiro(p.valor, p.moeda)}
      </span>
      {typeof p.emq === 'number' && (
        <span className="font-mono text-caption whitespace-nowrap text-fg-muted tabular-nums">
          EMQ {p.emq}
        </span>
      )}
    </div>
  );
}

function Quando({ p }: { p: PessoaDoEvento }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-caption whitespace-nowrap text-fg-muted tabular-nums">
      <Clock className="size-3 shrink-0" aria-hidden />
      {quando(p.recebidoEm)}
    </span>
  );
}

/** O estado do evento mais as ressalvas que explicam por que ele está assim. */
function Situacao({ p }: { p: PessoaDoEvento }) {
  const equipe = ehDaEquipe(p);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge variant={TOM_STATUS[p.status] ?? 'neutro'}>
          {ROTULO_STATUS[p.status] ?? p.status}
        </Badge>
        {equipe && (
          <Badge variant="aviso">
            <FlaskConical aria-hidden />
            teste
          </Badge>
        )}
        {p.autoBloqueadoPorSuspeita === true && (
          <Badge variant="aviso">
            <ShieldAlert aria-hidden />
            automático barrado
          </Badge>
        )}
        {p.motivoDeTeste && <Badge variant="neutro">{ROTULO_MOTIVO[p.motivoDeTeste]}</Badge>}
      </div>
      {p.explicacaoDeTeste && (
        <p className="min-w-0 text-caption break-words text-fg-muted">{p.explicacaoDeTeste}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A tabela                                                            */
/* ------------------------------------------------------------------ */

/**
 * O que cada coluna VESTE. Largura e alinhamento moram aqui, num só lugar, e
 * valem ao mesmo tempo para o `<th>` e para o `<td>` — é isso que faz a coluna
 * do valor ficar reta de cima a baixo sem ninguém repetir `text-right` seis
 * vezes.
 *
 * O slot `columnMeta` do `tableFeatures` é a forma v9 de tipar isto por tabela;
 * a alternativa é `declare module` global, que valeria para o produto inteiro
 * para servir a uma tela só.
 */
interface MetaColuna {
  celula: string;
}

/**
 * 🔴 API da v9, que NÃO é a da v8: não existe `useReactTable` nem
 * `getCoreRowModel()` como opção. As features entram uma a uma em
 * `tableFeatures()` — sem `rowSortingFeature` registrado, `column.getCanSort`
 * simplesmente não existe — e os row models são SLOTS dessa mesma chamada.
 * Fora do render de propósito: recriar isto a cada passada invalida os modelos.
 */
const recursos = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnMeta: {} as MetaColuna,
});

const ajudante = createColumnHelper<typeof recursos, PessoaDoEvento>();

/** Array estável: `?? []` solto nasceria novo a cada render (v9, §data). */
const SEM_PESSOAS: PessoaDoEvento[] = [];

function montarColunas(mostrarEvento: boolean) {
  const colunas = [
    ajudante.accessor((p) => p.nomeCliente ?? '', {
      id: 'quem',
      header: 'Quem',
      meta: { celula: 'min-w-0' },
      cell: ({ row }) => <Quem p={row.original} />,
    }),
    ajudante.accessor((p) => p.evento, {
      id: 'evento',
      header: 'Evento',
      meta: { celula: 'w-[9rem]' },
      cell: ({ row }) => (
        <Badge variant="neutro" className="font-mono">
          {row.original.evento}
        </Badge>
      ),
    }),
    ajudante.accessor((p) => (typeof p.valor === 'number' && Number.isFinite(p.valor) ? p.valor : null), {
      id: 'valor',
      header: 'Valor',
      sortDescFirst: true,
      meta: { celula: 'w-[7.5rem] text-right' },
      cell: ({ row }) => <Valor p={row.original} />,
    }),
    ajudante.accessor((p) => new Date(p.recebidoEm).getTime(), {
      id: 'quando',
      header: 'Quando',
      sortDescFirst: true,
      meta: { celula: 'w-[8rem]' },
      cell: ({ row }) => <Quando p={row.original} />,
    }),
    /* Situação e atribuição NÃO ordenam: ordenariam pelo slug guardado
       (`novo`, `nenhuma`), que não é a palavra que está na tela — uma coluna
       que ordena por um critério invisível é pior do que uma que não ordena. */
    ajudante.accessor((p) => p.status, {
      id: 'situacao',
      header: 'Situação',
      enableSorting: false,
      meta: { celula: 'w-[13rem]' },
      cell: ({ row }) => <Situacao p={row.original} />,
    }),
    ajudante.accessor((p) => p.atribuicao, {
      id: 'atribuicao',
      header: 'Atribuição',
      enableSorting: false,
      meta: { celula: 'w-[9.5rem]' },
      cell: ({ row }) => (
        <Badge variant={TOM_ATRIBUICAO[row.original.atribuicao]}>
          {ROTULO_ATRIBUICAO[row.original.atribuicao]}
        </Badge>
      ),
    }),
  ];

  // Quando a tela inteira já é de um evento só, a coluna repetiria o título em
  // todas as linhas. Some a COLUNA, não o dado: o nome continua no cabeçalho.
  return ajudante.columns(mostrarEvento ? colunas : colunas.filter((c) => c.id !== 'evento'));
}

const COLUNAS_COM_EVENTO = montarColunas(true);
const COLUNAS_SEM_EVENTO = montarColunas(false);

function TabelaDePessoas({
  pessoas,
  mostrarEvento,
  legenda,
}: {
  pessoas: PessoaDoEvento[];
  mostrarEvento: boolean;
  legenda: string;
}) {
  /**
   * Nasce VAZIO, e é o ponto do parágrafo de cima: a lista estreia na ordem em
   * que o servidor mandou, que é a ordem com que o card do Painel contou.
   */
  const [ordem, setOrdem] = useState<SortingState>([]);

  const tabela = useTable({
    features: recursos,
    columns: mostrarEvento ? COLUNAS_COM_EVENTO : COLUNAS_SEM_EVENTO,
    data: pessoas.length > 0 ? pessoas : SEM_PESSOAS,
    getRowId: (p) => p.id,
    state: { sorting: ordem },
    onSortingChange: setOrdem,
  });

  const linhas = tabela.getRowModel().rows;

  return (
    <Panel className="min-w-0 p-0">
      {/* A tabela só a partir de 48rem: abaixo disso seis colunas viram seis
          colunas de uma palavra, e o cartão diz o mesmo sem picotar nada. */}
      <div className="hidden min-w-0 overflow-x-auto md:block">
        <table className="w-full border-collapse text-label">
          <caption className="sr-only">{legenda}</caption>
          {/* O degrau de tamanho mora aqui, e não no `<th>`: `tailwind-merge`
              trata `text-caption` e `text-fg-muted` como a mesma família
              `text-*` e descartaria o primeiro ao passar os dois pelo `cn`.
              No `<thead>`, sozinho e fora do `cn`, ele sobrevive. */}
          <thead className="text-caption">
            {tabela.getHeaderGroups().map((grupo) => (
              <tr key={grupo.id} className="border-b border-line">
                {grupo.headers.map((cabecalho) => {
                  const coluna = cabecalho.column;
                  const meta = coluna.columnDef.meta;
                  const sentido = coluna.getIsSorted();
                  return (
                    <th
                      key={cabecalho.id}
                      scope="col"
                      aria-sort={
                        !coluna.getCanSort()
                          ? undefined
                          : sentido === 'asc'
                            ? 'ascending'
                            : sentido === 'desc'
                              ? 'descending'
                              : 'none'
                      }
                      /* Sem `uppercase tracking-wide`: caixa alta espaçada em
                         cabeçalho é a assinatura de template que a §10 do plano
                         proíbe. Quem separa o rótulo do dado é o tom
                         (`fg-muted`) e o filete de baixo. */
                      className={cn(
                        'px-3 py-2 text-left font-medium text-fg-muted',
                        meta?.celula
                      )}
                    >
                      {cabecalho.isPlaceholder ? null : coluna.getCanSort() ? (
                        <button
                          type="button"
                          onClick={coluna.getToggleSortingHandler()}
                          title={`Ordenar por ${String(coluna.columnDef.header)}`}
                          className={cn(
                            'group inline-flex max-w-full items-center gap-1 rounded-control text-fg-muted transition-colors hover:text-fg-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto',
                            meta?.celula?.includes('text-right') && 'flex-row-reverse'
                          )}
                        >
                          <tabela.FlexRender header={cabecalho} />
                          {sentido === 'asc' ? (
                            <ChevronUpIcon className="size-3 shrink-0 text-tinta-texto" aria-hidden />
                          ) : sentido === 'desc' ? (
                            <ChevronDown className="size-3 shrink-0 text-tinta-texto" aria-hidden />
                          ) : (
                            <ChevronDown
                              className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                              aria-hidden
                            />
                          )}
                        </button>
                      ) : (
                        <tabela.FlexRender header={cabecalho} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          {/* Filete entre linhas, nunca zebra: a FASE 3a decidiu que superfície
              se separa por LUZ, e pintar uma linha sim outra não é inventar um
              significado para uma cor que não tem nenhum. */}
          <tbody className="divide-y divide-line">
            {linhas.map((linha) => (
              <tr key={linha.id} className="transition-colors hover:bg-tinta/6">
                {linha.getAllCells().map((celula) => (
                  <td
                    key={celula.id}
                    className={cn('px-3 py-2.5 align-top', celula.column.columnDef.meta?.celula)}
                  >
                    <tabela.FlexRender cell={celula} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex min-w-0 list-none flex-col gap-3 p-3 md:hidden">
        {linhas.map((linha) => (
          <CartaoDaPessoa key={linha.id} p={linha.original} mostrarEvento={mostrarEvento} />
        ))}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* O cartão de celular — os mesmos dados, em pé                        */
/* ------------------------------------------------------------------ */

/**
 * Abaixo de 48rem não há tabela, e também não há dado a menos: o cartão mostra
 * exatamente as seis colunas, empilhadas.
 *
 * Perdeu a borda e o `bg-surface-2/60` da FASE 3b: contorno virou vocabulário
 * de CONTROLE, e opacidade em cor de superfície é justamente o que as receitas
 * de `primitives.tsx` proíbem. Quem separa um cartão do outro é o degrau de luz
 * do `surface-2` sobre o painel, mais o espaço entre eles.
 */
function CartaoDaPessoa({ p, mostrarEvento }: { p: PessoaDoEvento; mostrarEvento: boolean }) {
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-control bg-surface-2 p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <Quem p={p} />
        <Valor p={p} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Quando p={p} />
        {mostrarEvento && (
          <Badge variant="neutro" className="font-mono">
            {p.evento}
          </Badge>
        )}
        <Badge variant={TOM_ATRIBUICAO[p.atribuicao]}>{ROTULO_ATRIBUICAO[p.atribuicao]}</Badge>
      </div>
      <Situacao p={p} />
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* A tela                                                              */
/* ------------------------------------------------------------------ */

export interface ListaDePessoasProps {
  /**
   * O recorte. Um dos dois, nunca os dois — é o mesmo par que a rota aceita.
   *   `{ compras: true }`      — todas as compras do período.
   *   `{ evento: 'Purchase' }` — um nome de evento, como o painel o agrupou.
   */
  recorte: { compras: true } | { evento: string };
  /** O que a lista está mostrando, em uma frase, para o cabeçalho da Section. */
  titulo: string;
  descricao: string;
}

export function ListaDePessoas({ recorte, titulo, descricao }: ListaDePessoasProps) {
  const empresaAtivaId = useEmpresaStore((s) => s.empresaAtivaId);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  /**
   * O período NÃO tem estado próprio: ele É a URL. Um `useState` aqui criaria
   * uma segunda verdade, e o botão "voltar" do navegador mudaria a URL sem
   * mudar a tela — o clássico filtro que mente sobre o número ao lado.
   */
  const periodo = useMemo(() => periodoDaBusca(params), [params]);
  const busca = buscaDoPeriodo(periodo);

  const [dados, setDados] = useState<RespostaPessoas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  /** Traz de volta o que o console classificou como teste da equipe. */
  const [comTestes, setComTestes] = useState(false);

  const soCompras = 'compras' in recorte;
  const nomeDoEvento = 'evento' in recorte ? recorte.evento : '';

  const trocarPeriodo = useCallback(
    (p: PeriodoEscolhido) => {
      const proximo = new URLSearchParams(params.toString());
      // Limpar as três e reescrever evita a URL híbrida `?dias=7&de=…`, que o
      // `periodoValido` do servidor resolveria a favor das datas — e a tela
      // ficaria com o botão de 7 dias aceso mostrando outro intervalo.
      proximo.delete('dias');
      proximo.delete('de');
      proximo.delete('ate');
      for (const [k, v] of new URLSearchParams(buscaDoPeriodo(p))) proximo.set(k, v);
      router.replace(`${pathname}?${proximo.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  useEffect(() => {
    let vivo = true;
    const alvo =
      `/api/inbox/pessoas?${busca}` +
      (soCompras ? '&compras=1' : `&evento=${encodeURIComponent(nomeDoEvento)}`) +
      (comTestes ? '&equipe=todos' : '');

    void (async () => {
      try {
        const r = await pedir<RespostaPessoas>(alvo, { cache: 'no-store' });
        if (!vivo) return;
        setDados(r);
        setErro(null);
      } catch (e) {
        if (!vivo) return;
        setErro(e instanceof Error ? e.message : 'Não foi possível montar a lista.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // Mesma regra do Painel: nenhum `setState` síncrono dentro do efeito (todos
    // vêm depois do `await`) e `vivo` mata a corrida entre duas janelas.
  }, [busca, soCompras, nomeDoEvento, comTestes, empresaAtivaId, tentativa]);

  // `useMemo` e não `?? []` solto: o array vazio nasceria novo a cada render e
  // faria a soma abaixo recalcular sem que nada tenha mudado.
  const pessoas = useMemo(() => dados?.pessoas ?? SEM_PESSOAS, [dados]);
  const atualizando = dados !== null && !respostaEhDoPeriodo(dados.periodo, periodo);

  /** A soma da própria lista — não vem do painel, para não haver dois números. */
  const somaVisivel = useMemo(() => {
    const moedas = new Set(
      pessoas.filter((p) => typeof p.valor === 'number').map((p) => p.moeda ?? 'BRL')
    );
    if (moedas.size !== 1) return null;
    const total = pessoas.reduce(
      (s, p) => (typeof p.valor === 'number' && Number.isFinite(p.valor) ? s + p.valor : s),
      0
    );
    return { total: Math.round(total * 100) / 100, moeda: [...moedas][0] };
  }, [pessoas]);

  const voltar = (
    <Button variant="ghost" size="sm" render={<Link href={`/painel?${busca}`} />}>
      <ArrowLeft className="size-4" aria-hidden />
      Voltar ao painel
    </Button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-3">
        <SeletorDePeriodo
          valor={periodo}
          aoMudar={trocarPeriodo}
          rotuloDoGrupo="Período da lista"
          className="w-full"
        />
        <p className="min-w-0 text-caption text-fg-muted">
          {rotuloDoPeriodo(periodo)}
          {dados && ` · ${pessoas.length} ${pessoas.length === 1 ? 'pessoa' : 'pessoas'}`}
          {somaVisivel &&
            ` · ${somaVisivel.total.toLocaleString('pt-BR', {
              style: 'currency',
              currency: somaVisivel.moeda,
            })}`}
          {!comTestes && ' · teste da equipe fora da lista'}
          {atualizando && (
            <span className="text-fg-body"> Refazendo a lista para a nova janela…</span>
          )}
        </p>
      </div>

      {erro && (
        <Callout tone="danger" title="A lista não carregou">
          <p className="text-caption text-fg-body">{erro}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTentativa((t) => t + 1)}
            className="mt-3"
          >
            Tentar de novo
          </Button>
        </Callout>
      )}

      {dados && dados.amostra >= dados.tetoDaAmostra && (
        <Callout tone="warning" title="Esta leitura bateu o teto">
          <p className="text-caption text-fg-body">
            A lista olha os {dados.tetoDaAmostra} eventos mais recentes desta empresa. Como o teto
            foi atingido, pode existir gente deste período que ficou de fora: escolha um período
            mais curto para ver a lista fechada.
          </p>
        </Callout>
      )}

      <Section
        title={titulo}
        description={descricao}
        icon={Users}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={comTestes ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={comTestes}
              onClick={() => setComTestes((v) => !v)}
            >
              <FlaskConical className="size-4" aria-hidden />
              {comTestes ? 'Esconder testes da equipe' : 'Mostrar testes da equipe'}
            </Button>
            {voltar}
          </div>
        }
      >
        {carregando && !dados ? (
          <div className="flex min-w-0 flex-col gap-2" aria-busy="true" aria-label="Montando a lista">
            {Array.from({ length: 5 }, (_, i) => (
              <Esqueleto key={i} className="h-24 rounded-control" />
            ))}
          </div>
        ) : pessoas.length === 0 ? (
          <EstadoVazio
            cenario="filtrado"
            icone={soCompras ? CircleSlash : Inbox}
            titulo={
              soCompras
                ? 'Nenhuma compra neste período'
                : `Nenhum evento ${nomeDoEvento} neste período`
            }
            motivo={
              comTestes
                ? 'Nem com os testes da equipe à mostra há algo nesta janela.'
                : 'Pode ser que não tenha entrado nada, ou que tudo o que entrou seja teste da equipe — que fica fora da lista por padrão.'
            }
            acao={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => trocarPeriodo({ dias: '90', de: null, ate: null })}
                >
                  Olhar os últimos 90 dias
                </Button>
                {!comTestes && (
                  <Button variant="ghost" size="sm" onClick={() => setComTestes(true)}>
                    Mostrar testes da equipe
                  </Button>
                )}
              </div>
            }
          />
        ) : (
          <TabelaDePessoas pessoas={pessoas} mostrarEvento={soCompras} legenda={titulo} />
        )}
      </Section>
    </div>
  );
}
