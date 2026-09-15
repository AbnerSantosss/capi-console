'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CircleSlash,
  Clock,
  FlaskConical,
  Inbox,
  ShieldAlert,
  Users,
} from 'lucide-react';

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

/* ------------------------------------------------------------------ */
/* A linha                                                             */
/* ------------------------------------------------------------------ */

function LinhaDaPessoa({ p, mostrarEvento }: { p: PessoaDoEvento; mostrarEvento: boolean }) {
  const ehTeste = p.testeInterno === true || p.testePlataforma === true;

  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-control border p-3',
        ehTeste ? 'border-line bg-surface-2/60' : 'border-line bg-surface-2'
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 break-words text-label font-medium text-fg-strong">
          {p.nomeCliente || 'sem nome no evento'}
        </span>
        <span className="shrink-0 text-label font-semibold text-fg-strong tabular-nums">
          {dinheiro(p.valor, p.moeda)}
        </span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-muted">
        {p.emailMascarado && (
          <span className="wrap-token min-w-0 font-mono">{p.emailMascarado}</span>
        )}
        <span className="inline-flex shrink-0 items-center gap-1">
          <Clock className="size-3" strokeWidth={1.75} aria-hidden />
          {quando(p.recebidoEm)}
        </span>
        {p.orderId && <span className="wrap-token min-w-0 font-mono">pedido {p.orderId}</span>}
        {typeof p.emq === 'number' && <span className="shrink-0">EMQ {p.emq}</span>}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {mostrarEvento && (
          <Badge variant="neutro" className="font-mono">
            {p.evento}
          </Badge>
        )}
        <Badge variant={TOM_STATUS[p.status] ?? 'neutro'}>
          {ROTULO_STATUS[p.status] ?? p.status}
        </Badge>
        <Badge variant={TOM_ATRIBUICAO[p.atribuicao]}>{ROTULO_ATRIBUICAO[p.atribuicao]}</Badge>
        {ehTeste && (
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
  const pessoas = useMemo(() => dados?.pessoas ?? [], [dados]);
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
          <Panel className="min-w-0 p-0">
            <ul className="flex min-w-0 list-none flex-col gap-2 p-3">
              {pessoas.map((p) => (
                <LinhaDaPessoa key={p.id} p={p} mostrarEvento={soCompras} />
              ))}
            </ul>
          </Panel>
        )}
      </Section>
    </div>
  );
}
