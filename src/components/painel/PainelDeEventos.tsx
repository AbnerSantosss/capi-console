'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowDownRight,
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  FlaskConical,
  Gauge,
  Globe,
  Inbox,
  MousePointerClick,
  ShoppingBag,
  Sparkles,
  Target,
  X,
} from '@/components/ui/icones';

import { pedir } from '@/lib/cliente-api';
import { slugDoEndereco } from '@/lib/empresa-do-endereco';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import { Callout, Section } from '@/components/common/primitives';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import { Esqueleto } from '@/components/common/Esqueleto';
import { BarraAnimada, NumeroAnimado } from '@/components/common/motion';
import { Button } from '@/components/ui/button';
import {
  buscaDoPeriodo,
  PERIODO_PADRAO,
  respostaEhDoPeriodo,
  rotuloDoPeriodo,
  SeletorDePeriodo,
  type PeriodoEscolhido,
} from '@/components/common/SeletorDePeriodo';
import { FILTROS_VAZIOS, type FiltrosInboxValor } from '@/components/integrations/FiltrosInbox';
import { InboxList } from '@/components/integrations/InboxList';
import { parMeta, type ParMeta } from '@/components/integrations/eventos-legiveis';
import { MAPA_EVENTOS_ORIGEM } from '@/lib/parser';
import { cn } from '@/lib/utils';

/**
 * Painel de eventos — a primeira tela do console.
 *
 * A tela de chegada mostra DUAS coisas e para: quanto entrou de dinheiro e
 * quais eventos chegaram. Nada aqui dispara evento — o painel só LÊ
 * `GET /api/inbox/resumo`, que por sua vez só conta o que já está na caixa de
 * entrada (regra 1 do CLAUDE.md).
 *
 * 🔴 Por que só isso na primeira dobra: o dono abriu o console e disse que o
 * painel "tem que apresentar apenas os principais eventos e, quando clicar, a
 * lista referente àqueles eventos". Dezoito números de uma vez não são um
 * painel, são um relatório: ninguém sabe por onde começar. Volume, atribuição
 * e qualidade continuam inteiros, mas atrás de um botão — medem o
 * FUNCIONAMENTO do console, e essa é a segunda pergunta, não a primeira.
 *
 * Cada card é um botão. O clique não troca de rota nem escreve filtro na URL
 * (IA-R5): ele abre, logo abaixo, a lista dos eventos daquele recorte, com o
 * mesmo vocabulário de filtro que a caixa de entrada usa. Assim o número do
 * card e a lista vêm da mesma janela de dados e não se contradizem.
 *
 * 🔴 Teste da equipe fica fora de toda porcentagem (regra 4) e tem card
 * próprio, para nunca ser confundido com venda.
 */

/* ------------------------------------------------------------------ */
/* O que a rota devolve                                                */
/* ------------------------------------------------------------------ */

interface CardContagem {
  total: number;
  pct: number | null;
}

interface ResumoInbox {
  /** O período que o servidor usou: `'hoje'`, `'ontem'`, 7, 30, 90 ou `{de, ate}`. */
  periodo: string | number | { de: string; ate: string };
  /** De quando até quando ele contou, em ISO. */
  janela: { inicio: string; fim: string };
  amostra: number;
  /** `false` = a amostra parou antes do começo da janela; o número é um piso. */
  amostraCobreJanela: boolean;
  base: number;
  volume: {
    recebidos: number;
    /** Só envio real. O que foi só para o "Testar eventos" vem em `enviadosEmTeste`. */
    enviados: CardContagem;
    /** Reais que a Meta só recebeu em modo teste: fora de "Enviados" e do valor (C9, D20). */
    enviadosEmTeste: number;
    naFila: CardContagem;
    ignorados: CardContagem;
    testesEquipe: number;
  };
  atribuicao: {
    metaFbclid: CardContagem;
    metaFbc: CardContagem;
    google: CardContagem;
    tiktok: CardContagem;
    microsoft: CardContagem;
    semAtribuicao: CardContagem;
  };
  qualidade: {
    emqMedio: number | null;
    enviadosComEmq: number;
  };
  porEvento: Array<{ evento: string; total: number; pct: number | null }>;
  receitaEnviada: { total: number; moeda: string } | null;
  compras: ComprasDoPeriodo;
}

interface ValorDeCompras {
  total: number;
  /** `null` quando o período misturou moedas — somar seria inventar um número. */
  valor: number | null;
}

interface ComprasDoPeriodo extends ValorDeCompras {
  moeda: string | null;
  /** Aceitas de verdade: compra que só foi em modo teste está em `enviadasEmTeste`. */
  enviadas: number;
  enviadasEmTeste: number;
  /**
   * 🔴 Aqui, e só aqui, "atribuído" é `fbclid || fbc` — sinal DA META. Os cards
   * de "De onde veio o tráfego" contam os cinco sinais, e de propósito: naquela
   * seção a pergunta é de onde veio o tráfego todo; nesta, o que pode ser
   * cobrado da campanha da Meta, que é a campanha que este console serve.
   */
  atribuidasMeta: ValorDeCompras;
  /**
   * O resto — e ele CONTINUA SENDO ENVIADO à Meta. São as vendas PIX sem rastro
   * de clique, que é exatamente a venda que este produto existe para recuperar.
   * O que elas não fazem é entrar no número de resultado da campanha.
   */
  semAtribuicaoMeta: ValorDeCompras;
}

/** Só eventos reais: o recorte que todo card de métrica abre. */
const SO_REAIS: FiltrosInboxValor = { ...FILTROS_VAZIOS, equipe: 'reais' };

/**
 * O que dizer quando parte do que saiu foi só para o "Testar eventos" (C9, D20).
 *
 * Envio com o Pixel em modo teste não conta conversão nem ensina a campanha,
 * então fica fora de "Enviados à Meta" e do valor enviado. A frase diz quantos
 * foram, por que não contam e o que fazer. `null` quando não houve nenhum: a
 * tela não fala de teste que não aconteceu.
 */
function avisoDeModoTeste(n: number): string | null {
  if (n <= 0) return null;
  return `${n} em modo teste, fora da conta: ${
    n === 1 ? 'foi' : 'foram'
  } só para o Testar eventos da Meta. Os que já saíram em teste podem ir de verdade: apague o código de teste do Pixel na aba Pixels e use Enviar agora na Fila.`;
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

/**
 * O matiz entra só no ícone e na barra — nunca no texto, que continua nos
 * tokens de leitura (`--fg-*`) para o gate de contraste continuar valendo.
 */
type Matiz = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'neutro';

const FUNDO_DO_MATIZ: Record<Matiz, string> = {
  'chart-1': 'bg-chart-1/12 text-chart-1',
  'chart-2': 'bg-chart-2/12 text-chart-2',
  'chart-3': 'bg-chart-3/12 text-chart-3',
  'chart-4': 'bg-chart-4/12 text-chart-4',
  'chart-5': 'bg-chart-5/12 text-chart-5',
  neutro: 'bg-surface-3 text-fg-muted',
};

const BARRA_DO_MATIZ: Record<Matiz, string> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
  neutro: 'bg-fg-disabled',
};

function textoDaPorcentagem(pct: number | null): string {
  if (pct === null) return 'sem base de comparação';
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} % dos eventos reais`;
}

/* Grade de NÚMEROS, não grade de cartões. O KPI secundário perdeu a caixa
   (borda em volta + fundo + raio) e ficou com um filete no topo: quando
   dezoito retângulos iguais dividem a tela, a linha fina deixa de separar
   e vira textura, e nenhum deles é mais importante que o outro. O filete
   horizontal alinha a leitura na régua de cima — os números ficam numa
   mesma pauta — e devolve ao Destaque o papel de único objeto com forma.
   O estado ativo/hover pinta o próprio filete na tinta da área: é o mesmo
   sinal de antes, num traço em vez de num contorno.

   Mora fora do `CardPainel` porque o card de evento usa a MESMA forma com
   outro conteúdo (nome técnico em mono, rótulo em português). Duas receitas
   de cartão na mesma tela seriam duas famílias, que é o defeito que o v4
   passou a fase inteira apagando. */
function classesDoCard(ativo: boolean, clicavel: boolean): string {
  return cn(
    'flex min-w-0 flex-col items-start gap-2 border-t pt-3 text-left',
    ativo ? 'border-tinta-texto' : 'border-line',
    clicavel &&
      cn(
        'cursor-pointer transition-colors hover:border-tinta-texto',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto'
      )
  );
}

function CardPainel({
  titulo,
  explicacao,
  total,
  pct,
  icone: Icone,
  matiz = 'neutro',
  comBarra = false,
  aoClicar,
  ativo = false,
  aviso,
}: {
  titulo: string;
  explicacao: string;
  total: number;
  pct?: number | null;
  icone: React.ElementType;
  matiz?: Matiz;
  comBarra?: boolean;
  aoClicar?: () => void;
  ativo?: boolean;
  /**
   * Linha extra, só quando existe (ex.: envios em modo teste que ficaram fora
   * da conta). Vai também no `aria-label`: sem isso, quem usa leitor de tela
   * ouviria o número sem saber que parte ficou de fora.
   */
  aviso?: string | null;
}) {
  const temPct = pct !== undefined && pct !== null;
  const descricao = [
    `${titulo}: ${total} ${total === 1 ? 'evento' : 'eventos'}`,
    temPct ? `${pct} por cento dos eventos reais` : '',
    // Sem o ponto final: o `join('. ')` logo abaixo já põe um.
    aviso ? aviso.replace(/\.$/, '') : '',
    aoClicar ? 'Abrir a lista destes eventos.' : '',
  ]
    .filter(Boolean)
    .join('. ');

  const conteudo = (
    <>
      <span className="flex w-full min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 text-label font-medium text-fg-muted">{titulo}</span>
        <span
          aria-hidden
          className={cn('flex size-7 shrink-0 items-center justify-center rounded-control', FUNDO_DO_MATIZ[matiz])}
        >
          <Icone className="size-4" />
        </span>
      </span>

      <span className="flex min-w-0 items-baseline gap-2">
        <NumeroAnimado valor={total} casas={0} className="text-data font-semibold text-fg-strong" />
        {pct !== undefined && (
          <span className="min-w-0 text-caption text-fg-muted">{textoDaPorcentagem(pct)}</span>
        )}
      </span>

      {comBarra && (
        <BarraAnimada percentual={pct ?? 0} corBarra={BARRA_DO_MATIZ[matiz]} className="h-1.5 w-full" />
      )}

      <span className="min-w-0 text-caption break-words text-fg-muted">{explicacao}</span>

      {aviso && <span className="min-w-0 text-caption break-words text-fg-body">{aviso}</span>}
    </>
  );

  if (!aoClicar) {
    return <div className={classesDoCard(ativo, false)}>{conteudo}</div>;
  }

  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={descricao}
      className={classesDoCard(ativo, true)}
    >
      {conteudo}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* O card de um evento                                                 */
/* ------------------------------------------------------------------ */

/**
 * O par "nome da plataforma → evento da Meta", em português.
 *
 * O card mostra o nome que a plataforma mandou (`purchase_approved`), porque é
 * esse que aparece no backoffice dela e é por ele que se procura. Mas o
 * catálogo da Meta é indexado pelo nome DELA (`Purchase`), então a tabela do
 * parser faz a ponte. Quando o nome já chega no vocabulário da Meta — é o caso
 * da tag do site — ele não está na tabela e vai direto para o catálogo.
 *
 * `null` tem significado: este nome não vira conversão nenhuma na Meta
 * (abandono, estorno, financeiro interno). Não é falha, e o card diz isso.
 */
function eventoDaMeta(eventoOrigem: string): ParMeta | null {
  const equivalente =
    eventoOrigem in MAPA_EVENTOS_ORIGEM ? MAPA_EVENTOS_ORIGEM[eventoOrigem] : eventoOrigem;
  return equivalente ? parMeta(equivalente) : null;
}

/**
 * Um dos eventos principais: quantos chegaram e, quando dá, quanto em dinheiro.
 *
 * Mesma forma do `CardPainel` (filete no topo, sem caixa) com outro conteúdo: o
 * título é o nome TÉCNICO em mono, e o português vem embaixo, ao lado do nome
 * que a Meta usa. Traduzir o nome técnico seria esconder justamente a palavra
 * que o operador vai procurar no Gerenciador de Eventos.
 */
function CardDeEvento({
  evento,
  total,
  pct,
  valor,
  aoClicar,
  ativo,
}: {
  evento: string;
  total: number;
  pct: number | null;
  /** Já formatado, e só quando o valor é do recorte inteiro deste evento. */
  valor: string | null;
  aoClicar: () => void;
  ativo: boolean;
}) {
  const par = eventoDaMeta(evento);
  const Icone = par?.icon ?? Ban;
  const matiz: Matiz = par?.tecnico === 'Purchase' ? 'chart-1' : par ? 'chart-2' : 'neutro';

  return (
    <button
      type="button"
      onClick={aoClicar}
      // O card é um interruptor, e quem ouve a tela precisa saber disso: o
      // mesmo clique que abriu a lista fecha.
      aria-pressed={ativo}
      aria-label={`Evento ${evento}: ${total} ${total === 1 ? 'evento' : 'eventos'}. ${
        ativo ? 'Fechar a lista destes eventos.' : 'Abrir a lista destes eventos.'
      }`}
      className={classesDoCard(ativo, true)}
    >
      <span className="flex w-full min-w-0 items-start justify-between gap-2">
        <span className="wrap-token min-w-0 font-mono text-label text-fg-body">{evento}</span>
        <span
          aria-hidden
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-control',
            FUNDO_DO_MATIZ[matiz]
          )}
        >
          <Icone className="size-4" />
        </span>
      </span>

      <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <NumeroAnimado valor={total} casas={0} className="text-data font-semibold text-fg-strong" />
        {valor !== null && (
          <span className="min-w-0 font-mono text-label text-fg-body tabular-nums">{valor}</span>
        )}
        <span className="min-w-0 text-caption text-fg-muted">{textoDaPorcentagem(pct)}</span>
      </span>

      <BarraAnimada percentual={pct ?? 0} corBarra={BARRA_DO_MATIZ[matiz]} className="h-1.5 w-full" />

      <span className="min-w-0 text-caption break-words text-fg-muted">
        {par ? (
          <>
            Vai para a Meta como {par.pt} · <span className="font-mono">{par.tecnico}</span>.
          </>
        ) : (
          'Não vira conversão na Meta: não existe evento padrão equivalente.'
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* O destaque de compras                                               */
/* ------------------------------------------------------------------ */

/**
 * `valor === null` quer dizer que o recorte tem compras em mais de uma moeda e
 * o resumo se recusou a somar (ver `inbox-resumo.ts`). O espaço de 56px do
 * `--text-display` é para NÚMERO — uma frase ali vira o maior objeto da tela e
 * não explica nada (o dono leu "moedas misturadas" e não entendeu; DS-v4-3).
 * Por isso o degrau grande recebe um travessão, e a explicação vai numa linha
 * pequena logo abaixo, em `AvisoDeMoedasDiferentes`.
 */
function dinheiro(valor: number | null, moeda: string | null): string {
  if (valor === null) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: moeda ?? 'BRL' });
}

/**
 * O que aparece no lugar da soma quando as compras do período vieram em moedas
 * diferentes.
 *
 * A frase anterior — "Compras em mais de uma moeda, o total não soma" — era a
 * segunda tentativa e o dono também não entendeu: ela descreve a REGRA do
 * programa, não o que aconteceu com o dinheiro dele. Esta diz o fato (vieram em
 * moedas diferentes), a consequência (um total único ficaria errado) e para
 * onde ir (o valor de cada compra está na lista). Sem travessão e sem jargão.
 */
const AVISO_MOEDAS_DIFERENTES =
  'Houve compras em moedas diferentes. Um total único ficaria errado, por isso o valor aparece em cada compra na lista.';

function AvisoDeMoedasDiferentes({ valor }: { valor: number | null }) {
  if (valor !== null) return null;
  return <span className="text-caption text-fg-muted">{AVISO_MOEDAS_DIFERENTES}</span>;
}

/**
 * O cartão principal do Painel: quantas compras e quanto em dinheiro.
 *
 * É o único Destaque da tela (receita `tinta`, no máximo um por página) porque
 * é a única pergunta que se faz antes de todas as outras. Os outros cartões
 * medem o funcionamento do console; este mede o negócio.
 *
 * O corpo inteiro é um link para "Quem comprou" (`/e/<slug>/eventos?vista=compras`
 * desde a V2; antes, `/painel/compras`), levando o período junto na
 * URL — a lista que abre lá tem que ter o tamanho do número que foi clicado
 * aqui, e é a query que garante isso.
 *
 * A divisão embaixo é a resposta ao "sem atribuição não pode contabilizar na
 * campanha": o número do meio é o que a campanha da Meta pode reivindicar, o da
 * direita é o que chegou sem rastro de clique. Os dois somam o total de cima, e
 * os dois foram enviados à Meta — separar aqui é contabilidade, não filtro.
 */
function DestaqueDeCompras({
  compras,
  periodo,
  href,
}: {
  compras: ComprasDoPeriodo;
  periodo: string;
  href: string;
}) {
  const plural = compras.total === 1 ? 'compra' : 'compras';
  const emTeste = avisoDeModoTeste(compras.enviadasEmTeste);
  // O aviso de moedas já termina em ponto; o dinheiro, não.
  const valorFalado =
    compras.valor === null ? AVISO_MOEDAS_DIFERENTES : `${dinheiro(compras.valor, compras.moeda)}.`;

  return (
    <Section
      title="Compras no período"
      description={`${periodo}. Clique para ver quem comprou.`}
      icon={ShoppingBag}
      variant="card"
      tinta
    >
      <Link
        href={href}
        aria-label={`${compras.total} ${plural}, ${valorFalado}${
          emTeste ? ` ${emTeste}` : ''
        } Abrir a lista de quem comprou.`}
        className={cn(
          'group flex min-w-0 flex-col gap-4 rounded-panel border border-line-strong bg-surface-2 p-4 transition-colors sm:p-5',
          'hover:border-tinta-texto hover:bg-surface-3',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto'
        )}
      >
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-3">
          {/* O rótulo vem ACIMA do número, e o número é o maior objeto da
              tela (--text-display, o sétimo degrau, fluido de 40 a 56px).
              Quem abre o console lê primeiro QUANTO entrou; o rótulo só é
              procurado por quem já viu o número. Invertido — rótulo embaixo —
              o olho pousa no texto pequeno antes do dado, que é exatamente o
              "sem contraste" que o dono descreveu: nada dominava a tela.
              Mono + tabular porque dinheiro se lê pela coluna do separador. */}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-label text-fg-muted">Valor no período</span>
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="min-w-0 font-mono text-display font-medium text-fg-strong tabular-nums">
                {dinheiro(compras.valor, compras.moeda)}
              </span>
              {/* A quantidade acompanha o valor na mesma linha de base, um
                  degrau abaixo: é a mesma frase ("R$ X em N compras"), não um
                  segundo indicador. `number-flow` continua aqui — é o número
                  que troca quando o período muda. */}
              <span className="flex shrink-0 items-baseline gap-1.5 text-data text-fg-body">
                <NumeroAnimado valor={compras.total} casas={0} className="tabular-nums" />
                <span className="text-label text-fg-muted">{plural}</span>
              </span>
            </span>
            <AvisoDeMoedasDiferentes valor={compras.valor} />
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 text-label font-medium text-tinta-texto">
            Ver quem comprou
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </div>

        {/* UMA linha com três pares rótulo·valor, divididos por filete — e não
            três caixas. Três caixas diziam "três coisas diferentes"; o filete
            diz "a mesma conta, repartida". Abaixo de sm o filete sai e os três
            empilham, porque filete vertical em coluna única não divide nada. */}
        <div className="grid min-w-0 grid-cols-1 gap-y-3 border-t border-line pt-3 sm:grid-cols-3 sm:gap-y-0 sm:divide-x sm:divide-line">
          <div className="flex min-w-0 flex-col gap-0.5 sm:pr-4">
            <span className="text-caption text-fg-muted">Contam para a campanha da Meta</span>
            <span className="text-label font-semibold text-fg-strong tabular-nums">
              {compras.atribuidasMeta.total} · {dinheiro(compras.atribuidasMeta.valor, compras.moeda)}
            </span>
            <span className="text-caption text-fg-muted">Chegaram com fbclid ou cookie _fbc.</span>
          </div>

          <div className="flex min-w-0 flex-col gap-0.5 sm:px-4">
            <span className="text-caption text-fg-muted">Sem atribuição da Meta</span>
            <span className="text-label font-semibold text-fg-strong tabular-nums">
              {compras.semAtribuicaoMeta.total} ·{' '}
              {dinheiro(compras.semAtribuicaoMeta.valor, compras.moeda)}
            </span>
            <span className="text-caption text-fg-muted">
              Fora do resultado da campanha — mas enviadas à Meta do mesmo jeito.
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-0.5 sm:pl-4">
            <span className="text-caption text-fg-muted">Já aceitas pela Meta</span>
            <span className="text-label font-semibold text-fg-strong tabular-nums">
              {compras.enviadas} de {compras.total}
            </span>
            {/* C9 (D20): compra que só foi para o "Testar eventos" não é
                aceite da Meta. Sem esta linha, "o resto" esconderia justamente
                a venda que o Pixel em modo teste não contou. */}
            {compras.enviadasEmTeste > 0 && (
              <span className="text-caption text-fg-body">{emTeste}</span>
            )}
            <span className="text-caption text-fg-muted">
              O resto está na fila ou foi marcado para não enviar.
            </span>
          </div>
        </div>
      </Link>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

interface Recorte {
  filtros: FiltrosInboxValor;
  rotulo: string;
  /**
   * O nome do evento, quando o recorte veio de um card de evento. Serve a duas
   * coisas: marcar qual card está aberto e oferecer, no cabeçalho da lista, o
   * atalho para `/e/<slug>/eventos?evento=` — a tela "quem mandou", que tem URL e pode
   * ser mandada a alguém.
   */
  evento?: string;
  /** Muda a cada clique para a lista nascer de novo, mesmo no mesmo card. */
  chave: number;
}

export function PainelDeEventos() {
  const empresaAtivaId = useEmpresaStore((s) => s.empresaAtivaId);

  const [periodo, setPeriodo] = useState<PeriodoEscolhido>(PERIODO_PADRAO);
  const [resumo, setResumo] = useState<ResumoInbox | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recorte, setRecorte] = useState<Recorte | null>(null);
  /**
   * Volume, atribuição e qualidade começam fechados. São a saúde do console, e
   * a primeira pergunta de quem abre a tela é o negócio, não o encanamento.
   */
  const [detalhes, setDetalhes] = useState(false);
  /** Contador do botão "Tentar de novo": muda, o efeito refaz a chamada. */
  const [tentativa, setTentativa] = useState(0);

  /**
   * A busca mora DENTRO do efeito, e não numa função chamada por ele.
   *
   * Duas razões, nesta ordem:
   *
   * 1. Nenhum `setState` síncrono dentro de efeito — é render em cascata, e o
   *    `react-hooks/set-state-in-effect` reprova no `npm run lint` (mesma
   *    regra que o `Esqueleto` já respeita). Aqui
   *    todo `setState` acontece DEPOIS do `await`, dentro da continuação.
   * 2. `vivo` mata a corrida: trocar 7 → 30 → 90 depressa dispara três
   *    respostas, e sem a trava a primeira a voltar pode ser a última a
   *    escrever. O painel mostraria o número de uma janela com o rótulo de
   *    outra — exatamente o tipo de número mentiroso que este painel existe
   *    para não produzir.
   *
   * `carregando` só vira `false` e nunca volta a `true`: ao trocar de período
   * os números velhos continuam na tela e quem avisa é o `atualizando`,
   * derivado, sem estado novo.
   */
  // String, e não o objeto: dependência de efeito comparada por identidade
  // refaria a busca a cada render, já que o objeto do período nasce novo.
  const busca = buscaDoPeriodo(periodo);

  // V2 (v7): as listas "quem comprou" e "quem mandou" são vistas da aba Eventos
  // da empresa do ENDEREÇO. Fora de `/e/<slug>` (não deveria acontecer), o
  // endereço antigo, que o proxy leva à empresa ativa.
  const slugDaTela = slugDoEndereco(usePathname());
  const abaEventos = slugDaTela ? `/e/${encodeURIComponent(slugDaTela)}/eventos` : null;

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const dados = await pedir<{ resumo: ResumoInbox }>(`/api/inbox/resumo?${busca}`, {
          cache: 'no-store',
        });
        if (!vivo) return;
        setResumo(dados.resumo);
        setErro(null);
      } catch (e) {
        // Sessão expirada já redireciona sozinha dentro de `pedir`.
        if (!vivo) return;
        setErro(e instanceof Error ? e.message : 'Não foi possível montar o painel.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // Trocar de empresa troca a resposta inteira: o header X-Empresa-Id muda.
    // `tentativa` existe para o botão "Tentar de novo" refazer a chamada.
  }, [busca, empresaAtivaId, tentativa]);

  /** Abre a lista do recorte e leva o foco até ela. */
  const abrirRecorte = useCallback(
    (filtros: FiltrosInboxValor, rotulo: string, evento?: string) => {
      setRecorte((r) => ({ filtros, rotulo, evento, chave: (r?.chave ?? 0) + 1 }));
      window.requestAnimationFrame(() => {
        document
          .getElementById('recorte-do-painel')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    []
  );

  /** Segundo clique no mesmo card fecha a lista — é a volta sem procurar botão. */
  const alternarEvento = useCallback(
    (evento: string) => {
      if (recorte?.evento === evento) {
        setRecorte(null);
        return;
      }
      abrirRecorte({ ...SO_REAIS, evento }, evento, evento);
    },
    [abrirRecorte, recorte]
  );

  const seletorDePeriodo = (
    <SeletorDePeriodo
      valor={periodo}
      aoMudar={setPeriodo}
      rotuloDoGrupo="Período do painel"
      className="w-full"
    />
  );

  /**
   * O dinheiro só aparece no card quando ele é, comprovadamente, o dinheiro
   * DAQUELE card.
   *
   * O resumo devolve o valor das compras num bloco só, sem repartir por nome de
   * origem — e dois nomes diferentes podem virar `Purchase` (`purchase_approved`
   * e `checkout.session.completed`, por exemplo). A regra aqui é uma igualdade,
   * não um palpite: existe UM único nome de compra entre os principais e a
   * contagem dele bate com a contagem de compras do período. Fora disso nenhum
   * card mostra dinheiro, e o total continua onde sempre esteve — no destaque de
   * cima, que é quem tem a contabilidade completa.
   */
  const valorDoEventoDeCompra = useMemo(() => {
    if (!resumo || resumo.compras.valor === null) return null;
    const deCompra = resumo.porEvento.filter((e) => eventoDaMeta(e.evento)?.tecnico === 'Purchase');
    if (deCompra.length !== 1 || deCompra[0].total !== resumo.compras.total) return null;
    return {
      evento: deCompra[0].evento,
      texto: dinheiro(resumo.compras.valor, resumo.compras.moeda),
    };
  }, [resumo]);

  const cardsDeAtribuicao = useMemo(() => {
    if (!resumo) return [];
    const a = resumo.atribuicao;
    return [
      {
        chave: 'fbclid',
        titulo: 'Vieram de anúncio da Meta',
        explicacao: 'Chegaram com fbclid, o carimbo do clique no criativo.',
        dado: a.metaFbclid,
        icone: MousePointerClick,
        matiz: 'chart-1' as Matiz,
        filtro: 'fbclid' as const,
      },
      {
        chave: 'fbc',
        titulo: 'Com cookie da Meta',
        explicacao: 'O _fbc estava no navegador na hora da compra.',
        dado: a.metaFbc,
        icone: Sparkles,
        matiz: 'chart-1' as Matiz,
        filtro: 'fbc' as const,
      },
      {
        chave: 'gclid',
        titulo: 'Vieram do Google Ads',
        explicacao: 'Chegaram com gclid, gbraid ou wbraid.',
        dado: a.google,
        icone: Globe,
        matiz: 'chart-3' as Matiz,
        filtro: 'gclid' as const,
      },
      {
        chave: 'ttclid',
        titulo: 'Vieram do TikTok Ads',
        explicacao: 'Chegaram com ttclid.',
        dado: a.tiktok,
        icone: Globe,
        matiz: 'chart-4' as Matiz,
        filtro: 'ttclid' as const,
      },
      {
        chave: 'msclkid',
        titulo: 'Vieram do Microsoft Ads',
        explicacao: 'Chegaram com msclkid.',
        dado: a.microsoft,
        icone: Globe,
        matiz: 'chart-5' as Matiz,
        filtro: 'msclkid' as const,
      },
      {
        chave: 'sem',
        titulo: 'Sem atribuição',
        explicacao: 'Orgânico, direto, ou o clique se perdeu antes da compra.',
        dado: a.semAtribuicao,
        icone: ArrowDownRight,
        matiz: 'neutro' as Matiz,
        filtro: 'sem' as const,
      },
    ];
  }, [resumo]);

  /* ------------------------------ carregando ------------------------------ */
  if (carregando && !resumo) {
    return (
      <div className="flex min-w-0 flex-col gap-4" aria-busy="true" aria-label="Montando o painel">
        {/* O esqueleto imita a forma que vai chegar: o destaque de compras em
            cima, com caixa, e embaixo a grade dos eventos principais sem caixa
            e sem raio de painel — senão a tela pisca de "grade de cartões" para
            "grade de números" no instante em que o dado entra. */}
        <Esqueleto className="h-44 rounded-panel" />
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Esqueleto key={i} className="h-28 rounded-control" />
          ))}
        </div>
      </div>
    );
  }

  /* ------------------------------ erro ------------------------------ */
  if (erro && !resumo) {
    return (
      <Callout tone="danger" title="O painel não carregou">
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
    );
  }

  if (!resumo) return null;

  const { volume, qualidade, porEvento, receitaEnviada, compras } = resumo;
  const vazio = volume.recebidos === 0;
  // Derivado, não estado: o resumo na tela ainda é da janela anterior, logo a
  // resposta da nova ainda não chegou. Dizer isso com todas as letras evita o
  // pior dos dois mundos — número velho com cara de número novo.
  const atualizando = !respostaEhDoPeriodo(resumo.periodo, periodo);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* ---------------- período e recorte da amostra ---------------- */}
      <div className="flex min-w-0 flex-col gap-3">
        {seletorDePeriodo}
        <p className="min-w-0 text-caption text-fg-muted">
          {rotuloDoPeriodo(periodo)}: contagem feita sobre os últimos {resumo.amostra}{' '}
          {resumo.amostra === 1 ? 'evento recebido' : 'eventos recebidos'} desta empresa. Teste da
          equipe fica fora das porcentagens.
          {atualizando && (
            <span className="text-fg-body"> Refazendo a conta para a nova janela…</span>
          )}
        </p>
      </div>

      {erro && (
        <Callout tone="warning" title="Os números podem estar velhos">
          <p className="text-caption text-fg-body">{erro}</p>
        </Callout>
      )}

      {!resumo.amostraCobreJanela && (
        <Callout tone="warning" title="Este período é maior que a leitura">
          <p className="text-caption text-fg-body">
            A conta olha os {resumo.amostra} eventos mais recentes desta empresa, e o mais antigo
            deles já está dentro do período escolhido. Existe evento nesta janela que ficou de fora:
            os números abaixo são um piso, não o total. Escolha um período mais curto para ter a
            contagem fechada.
          </p>
        </Callout>
      )}

      {vazio ? (
        <EstadoVazio
          icone={Inbox}
          titulo="Nenhum evento chegou neste período"
          motivo="Nada desta empresa chegou na janela escolhida. Se o webhook acabou de ser instalado, o primeiro evento aparece aqui assim que a primeira venda entrar."
          acao={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPeriodo({ dias: '90', de: null, ate: null })}
            >
              Olhar os últimos 90 dias
            </Button>
          }
        />
      ) : (
        <>
          {/* ---------------- o destaque: compra ---------------- */}
          {/* Primeiro de tudo, antes de qualquer métrica de funcionamento:
              quem abre o console quer saber se entrou venda. */}
          <DestaqueDeCompras
            compras={compras}
            periodo={rotuloDoPeriodo(periodo)}
            href={
              abaEventos ? `${abaEventos}?vista=compras&${busca}` : `/painel/compras?${busca}`
            }
          />

          {/* ---------------- os eventos principais ---------------- */}
          {/* A segunda e última coisa da primeira dobra. Os nomes vêm do
              resumo já ordenados do maior para o menor e cortados nos oito
              primeiros — "principais" é isso, e o corte é do servidor, não
              daqui, para o card e a lista contarem a mesma coisa. */}
          {porEvento.length > 0 && (
            <Section
              title="Os eventos que mais chegaram"
              description="Clique num evento para ver, logo abaixo, a lista só dele."
              icon={Target}
            >
              <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                {porEvento.map((e) => (
                  <CardDeEvento
                    key={e.evento}
                    evento={e.evento}
                    total={e.total}
                    pct={e.pct}
                    valor={
                      valorDoEventoDeCompra?.evento === e.evento
                        ? valorDoEventoDeCompra.texto
                        : null
                    }
                    aoClicar={() => alternarEvento(e.evento)}
                    ativo={recorte?.evento === e.evento}
                  />
                ))}
              </div>
              <p className="text-caption text-fg-muted">
                A contagem é dos eventos reais do período — teste interno fica de fora.
              </p>
            </Section>
          )}

          {/* ---------------- o funcionamento, fechado ---------------- */}
          {/* Não é "menos informação": é a mesma informação na segunda
              pergunta. Um clique abre, e o que abre é exatamente o que
              existia antes, na mesma ordem. */}
          <div className="flex min-w-0 flex-col gap-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetalhes((v) => !v)}
              aria-expanded={detalhes}
              className="self-start"
            >
              <ChevronDown
                className={cn('size-3.5 transition-transform', detalhes && 'rotate-180')}
                aria-hidden
              />
              {detalhes ? 'Esconder' : 'Ver'} como o console está funcionando
            </Button>

            {detalhes && (
              <>
                {/* ---------------- volume ---------------- */}
                <Section
                  title="O que chegou e o que saiu"
                  description="Cada card abre, aqui embaixo, a lista dos eventos que ele conta."
                  icon={Inbox}
                >
                  <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                    <CardPainel
                      titulo="Recebidos no período"
                      explicacao="Tudo o que chegou, incluindo teste interno."
                      total={volume.recebidos}
                      icone={Inbox}
                      matiz="chart-1"
                      aoClicar={() => abrirRecorte({ ...FILTROS_VAZIOS }, 'tudo o que foi recebido')}
                      ativo={recorte?.rotulo === 'tudo o que foi recebido'}
                    />
                    <CardPainel
                      titulo="Enviados à Meta"
                      explicacao="A API de Conversões aceitou o evento."
                      total={volume.enviados.total}
                      pct={volume.enviados.pct}
                      icone={CheckCircle2}
                      matiz="chart-2"
                      comBarra
                      aoClicar={() =>
                        abrirRecorte({ ...SO_REAIS, status: 'disparado' }, 'enviados à Meta')
                      }
                      ativo={recorte?.rotulo === 'enviados à Meta'}
                      aviso={avisoDeModoTeste(volume.enviadosEmTeste)}
                    />
                    <CardPainel
                      titulo="Na fila"
                      explicacao="Esperando um clique seu ou uma regra automática."
                      total={volume.naFila.total}
                      pct={volume.naFila.pct}
                      icone={Clock}
                      matiz="chart-3"
                      comBarra
                      aoClicar={() => abrirRecorte({ ...SO_REAIS, status: 'novo' }, 'na fila')}
                      ativo={recorte?.rotulo === 'na fila'}
                    />
                    <CardPainel
                      titulo="Ignorados"
                      explicacao="Uma regra ou um motivo mandou não enviar."
                      total={volume.ignorados.total}
                      pct={volume.ignorados.pct}
                      icone={ArrowDownRight}
                      matiz="neutro"
                      comBarra
                      aoClicar={() => abrirRecorte({ ...SO_REAIS, status: 'ignorado' }, 'ignorados')}
                      ativo={recorte?.rotulo === 'ignorados'}
                    />
                    <CardPainel
                      titulo="Testes internos"
                      explicacao="Ficam fora de toda porcentagem, de propósito."
                      total={volume.testesEquipe}
                      icone={FlaskConical}
                      matiz="chart-4"
                      aoClicar={() =>
                        abrirRecorte({ ...FILTROS_VAZIOS, equipe: 'so-testes' }, 'testes internos')
                      }
                      ativo={recorte?.rotulo === 'testes internos'}
                    />
                  </div>
                </Section>

                {/* ---------------- atribuição ---------------- */}
                <Section
                  title="De onde veio o tráfego"
                  description="A porcentagem é sobre os eventos reais do período, sem os testes internos."
                  icon={MousePointerClick}
                >
                  <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    {cardsDeAtribuicao.map((c) => (
                      <CardPainel
                        key={c.chave}
                        titulo={c.titulo}
                        explicacao={c.explicacao}
                        total={c.dado.total}
                        pct={c.dado.pct}
                        icone={c.icone}
                        matiz={c.matiz}
                        comBarra
                        aoClicar={() => abrirRecorte({ ...SO_REAIS, atribuicao: c.filtro }, c.titulo)}
                        ativo={recorte?.rotulo === c.titulo}
                      />
                    ))}
                  </div>
                  <p className="text-caption text-fg-muted">
                    Um mesmo evento pode carregar mais de um sinal — quem clicou no anúncio da Meta e já
                    tinha o cookie conta nos dois cards. Por isso estas porcentagens não somam 100 %.
                  </p>
                </Section>

                {/* ---------------- qualidade ---------------- */}
                <Section
                  title="Qualidade do que saiu"
                  description="O EMQ é a nota que a Meta dá ao pareamento de cada evento enviado."
                  icon={Gauge}
                >
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <CardPainel
                      titulo="EMQ médio dos enviados"
                      explicacao={
                        qualidade.emqMedio === null
                          ? 'Nenhum evento enviado no período trouxe nota.'
                          : `Média de ${qualidade.enviadosComEmq} ${
                              qualidade.enviadosComEmq === 1 ? 'evento com nota' : 'eventos com nota'
                            }.`
                      }
                      total={qualidade.emqMedio ?? 0}
                      icone={Gauge}
                      matiz="chart-2"
                      aoClicar={() =>
                        abrirRecorte({ ...SO_REAIS, status: 'disparado' }, 'enviados à Meta')
                      }
                    />
                    {/* Mesma forma do CardPainel ao lado — filete no topo, sem
                        caixa. Ele não usa o componente porque o valor aqui é
                        dinheiro formatado, não contagem animada. */}
                    {receitaEnviada && (
                      <div className="flex min-w-0 flex-col items-start gap-2 border-t border-line pt-3">
                        <span className="flex w-full min-w-0 items-start justify-between gap-2">
                          <span className="min-w-0 text-label font-medium text-fg-muted">
                            Valor enviado à Meta
                          </span>
                          <span
                            aria-hidden
                            className={cn(
                              'flex size-7 shrink-0 items-center justify-center rounded-control',
                              FUNDO_DO_MATIZ['chart-2']
                            )}
                          >
                            <ShoppingBag className="size-4" />
                          </span>
                        </span>
                        <span className="text-data font-semibold text-fg-strong tabular-nums">
                          {receitaEnviada.total.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: receitaEnviada.moeda,
                          })}
                        </span>
                        <span className="text-caption text-fg-muted">
                          Soma do valor dos eventos que a Meta aceitou no período.
                          {volume.enviadosEmTeste > 0 &&
                            ' Os envios em modo teste ficam fora da soma.'}
                        </span>
                      </div>
                    )}
                  </div>
                </Section>
              </>
            )}
          </div>
        </>
      )}

      {/* ---------------- a lista do recorte ---------------- */}
      {recorte && (
        <Section
          id="recorte-do-painel"
          title={`Eventos: ${recorte.rotulo}`}
          description={`A mesma lista da Fila, no período "${rotuloDoPeriodo(periodo)}", já filtrada pelo card que você clicou.`}
          icon={Inbox}
          action={
            /* Os dois botões empilham no celular em vez de empurrar o
               cabeçalho para fora da tela. */
            <div className="flex flex-wrap items-center justify-end gap-1">
              {/* "Quem mandou este evento" continua tendo tela própria, com
                  URL, para poder ser mandada a alguém — o que uma lista aberta
                  por clique não consegue ser. O período vai junto na query, que
                  é o que faz a lista de lá ter o tamanho do número daqui. */}
              {recorte.evento && (
                <Button
                  variant="ghost"
                  size="sm"
                  render={
                    <Link
                      href={`${abaEventos ?? '/painel/eventos'}?evento=${encodeURIComponent(recorte.evento)}&${busca}`}
                    />
                  }
                >
                  Ver quem mandou
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setRecorte(null)}>
                <X className="size-4" aria-hidden />
                Fechar a lista
              </Button>
            </div>
          }
        >
          {/* A MESMA janela que contou o card. Sem isto o card dizia "3 no
              período" e a lista abria com tudo o que existe na caixa — dois
              números diferentes para a mesma pergunta, na mesma tela. */}
          <InboxList
            key={recorte.chave}
            filtrosIniciais={recorte.filtros}
            janela={resumo.janela}
            acaoJanelaVazia={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPeriodo({ dias: '90', de: null, ate: null })}
              >
                Olhar os últimos 90 dias
              </Button>
            }
            limite={1000}
          />
        </Section>
      )}
    </div>
  );
}
