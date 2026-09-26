'use client';

/**
 * A Visão geral da empresa (`/e/<slug>`, V5 do plano v7), bloco a bloco como a
 * spec descreve (`INSTRUCOES-PARA-IA.md` :20-27):
 *
 *  1. cabeçalho: "Visão geral", o período (Hoje · Ontem · Últimos 7 dias...) e
 *     o botão Exportar; abaixo do seletor, o intervalo EFETIVO que o servidor
 *     usou (`resumo.janela`), por extenso e em horário de Brasília, o único fuso
 *     que existe no console;
 *  2. a faixa Site → Pixel → CAPI → Meta;
 *  3. os 5 KPIs (com a linha de amostra incompleta acima deles, R5);
 *  4. funil (60%) + receita por dia (40%);
 *  5. últimas conversões + qualidade do rastreamento;
 *  6. a faixa "Configuração x de 6" no rodapé.
 *
 * Os quatro estados da página inteira (spec :107):
 *  - carregando: um esqueleto no lugar de cada bloco;
 *  - desconectado: "Sem resposta do servidor. Tente de novo." com o botão;
 *  - sem permissão (401): "Sessão expirada", com o link para entrar de novo
 *    (o `pedir` já leva ao login sozinho; o texto fica enquanto isso);
 *  - vazio (`base = 0`): cada bloco mostra o seu "—" e a tela diz o próximo passo.
 *
 * Só dado real. Resposta de outra empresa (T2) ou de outro período é
 * descartada: a tela nunca mostra número de uma janela com o rótulo de outra.
 *
 * O checklist, o envio automático e os sinais do fluxo vêm prontos do servidor
 * (`checklist-do-servidor.ts`): nenhum segredo desce para cá.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import consoleStyles from '@/components/layout/console.module.css';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import { Esqueleto, RegiaoDeEspera } from '@/components/common/Esqueleto';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import {
  PERIODO_PADRAO,
  SeletorDePeriodo,
  buscaDoPeriodo,
  respostaEhDoPeriodo,
  rotuloDoPeriodo,
  type PeriodoEscolhido,
} from '@/components/common/SeletorDePeriodo';
import { Button, buttonVariants } from '@/components/ui/button';
import { Gauge } from '@/components/ui/icones';
import { ErroApi, SessaoExpirada, pedir } from '@/lib/cliente-api';
import type { ChecklistDaEmpresa, EnvioAutomatico, EstadoDaEmpresa } from '@/lib/checklist-empresa';
import type { ResumoInbox } from '@/lib/inbox-resumo';
import { cn } from '@/lib/utils';
import { enderecoDaAba } from '@/lib/abas-empresa';
import {
  AVISO_DE_AMOSTRA,
  SEM_DADO,
  dataHoraDeBrasilia,
  intervaloPorExtenso,
  numerosDaVisaoGeral,
  ultimasConversoes,
  type ItemDaAtividade,
  type LinhaDeConversao,
} from '@/lib/visao-geral-calculos';

import { AtividadeRecente } from './AtividadeRecente';
import { ChecklistEmpresa } from './ChecklistEmpresa';
import { ExportarCsv } from './ExportarCsv';
import { FluxoDoEvento } from './FluxoDoEvento';
import { Funil } from './Funil';
import { Kpis } from './Kpis';
import { Qualidade } from './Qualidade';
import { Receita } from './Receita';
import { publicarEstadoNoCabecalho } from './estado-no-cabecalho';

/** O mesmo teto da amostra do resumo (`AMOSTRA` da rota): a mesma memória. */
const LIMITE_DAS_CONVERSOES = 1000;

type Falha =
  | { tipo: 'sessao' }
  | { tipo: 'rede' }
  | { tipo: 'servidor'; mensagem: string }
  | { tipo: 'outra-empresa' };

/** Uma leitura do servidor, presa à escolha (período + tentativa) que a pediu. */
interface Leitura {
  chave: string;
  resumo: ResumoInbox | null;
  falha: Falha | null;
  /** `null` quando a lista das últimas conversões não veio. */
  linhas: LinhaDeConversao[] | null;
}

function falhaDe(e: unknown): Falha {
  if (e instanceof SessaoExpirada) return { tipo: 'sessao' };
  if (e instanceof ErroApi) return { tipo: 'servidor', mensagem: e.message };
  // `fetch` que nem chegou ao servidor (rede caída, servidor parado).
  return { tipo: 'rede' };
}

export function VisaoGeral({
  empresaId,
  slug,
  nome,
  checklist,
  estado,
  envio,
}: {
  empresaId: string;
  slug: string;
  nome: string;
  checklist: ChecklistDaEmpresa;
  estado: EstadoDaEmpresa;
  /** `null` quando os Pixels não puderam ser lidos. */
  envio: EnvioAutomatico | null;
}) {
  const [periodo, setPeriodo] = useState<PeriodoEscolhido>(PERIODO_PADRAO);
  const [tentativa, setTentativa] = useState(0);
  const [leitura, setLeitura] = useState<Leitura | null>(null);

  // String, e não o objeto: dependência de efeito comparada por identidade
  // refaria a busca a cada render.
  const busca = buscaDoPeriodo(periodo);
  const chave = `${busca}#${tentativa}`;

  // O cabeçalho do console mostra o estado desta empresa e o verbo do próximo
  // passo. Ele mora no layout; quem mede é esta tela.
  const proximo = checklist.proximo;
  useEffect(() => {
    publicarEstadoNoCabecalho({ slug, estado, proximo });
  }, [slug, estado, proximo]);

  /**
   * O resumo do período e a lista das últimas conversões, lidos JUNTOS: os dois
   * saem da mesma memória, e lidos no mesmo instante a lista não mostra uma
   * venda que o KPI ainda não contou (nem o contrário).
   *
   * Todo `setState` vem depois do `await` (a regra `set-state-in-effect`), e
   * `vivo` descarta a resposta de uma escolha que já foi trocada.
   * `X-Empresa-Id` explícito: a empresa é a do ENDEREÇO, não a do store.
   */
  useEffect(() => {
    let vivo = true;
    const cabecalhos = { 'X-Empresa-Id': empresaId };
    void (async () => {
      const [resumo, atividade] = await Promise.allSettled([
        pedir<{ resumo: ResumoInbox; empresaId?: string }>(`/api/inbox/resumo?${busca}&comparar=1`, {
          cache: 'no-store',
          headers: cabecalhos,
        }),
        pedir<{ itens: ItemDaAtividade[] }>(`/api/inbox?limite=${LIMITE_DAS_CONVERSOES}`, {
          cache: 'no-store',
          headers: cabecalhos,
        }),
      ]);
      if (!vivo) return;

      if (resumo.status === 'rejected') {
        setLeitura({ chave, resumo: null, falha: falhaDe(resumo.reason), linhas: null });
        return;
      }
      // T2: a resposta é de outra empresa? Então não é desta tela.
      if (resumo.value.empresaId !== empresaId) {
        setLeitura({ chave, resumo: null, falha: { tipo: 'outra-empresa' }, linhas: null });
        return;
      }
      const doPeriodo = resumo.value.resumo;
      const linhas =
        atividade.status === 'fulfilled' && Array.isArray(atividade.value.itens)
          ? ultimasConversoes(atividade.value.itens, doPeriodo.janela, empresaId)
          : null;
      setLeitura({ chave, resumo: doPeriodo, falha: null, linhas });
    })();
    return () => {
      vivo = false;
    };
  }, [busca, chave, empresaId]);

  // A leitura só vale para a escolha que está na tela (período + tentativa) e
  // para o período que o servidor diz ter respondido.
  const atual = leitura?.chave === chave ? leitura : null;
  const carregando = atual === null;
  const resumo = atual?.resumo && respostaEhDoPeriodo(atual.resumo.periodo, periodo) ? atual.resumo : null;
  const falha = atual?.falha ?? null;
  const linhas = resumo ? (atual?.linhas ?? null) : null;
  const numeros = useMemo(() => (resumo ? numerosDaVisaoGeral(resumo) : null), [resumo]);
  const tentarDeNovo = () => setTentativa((t) => t + 1);

  return (
    <main className={consoleStyles.page} data-area="painel">
      <ConsolePageHeader
        title="Visão geral"
        description={`${nome}: o que chegou, o que a Meta aceitou e o que falta configurar.`}
        icon={Gauge}
        action={
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <div className="flex flex-wrap items-start gap-2 sm:justify-end">
              <SeletorDePeriodo valor={periodo} aoMudar={setPeriodo} rotuloDoGrupo="Período da Visão geral" />
              <ExportarCsv empresa={{ nome, slug }} resumo={resumo} linhas={linhas} carregando={carregando} />
            </div>
            {/* O intervalo que o servidor usou de fato (`resumo.janela`), e não o
                rótulo do botão: "Últimos 7 dias" começa na hora de agora. */}
            <p className="text-caption text-fg-muted tabular-nums">
              {resumo ? intervaloPorExtenso(resumo.janela) : rotuloDoPeriodo(periodo)} · horário de Brasília
            </p>
          </div>
        }
      />

      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        <FluxoDoEvento
          sinais={checklist.sinais}
          envio={envio}
          aceitosNoPeriodo={resumo ? resumo.qualidade.aceitos : null}
          className={cn(consoleStyles.painel, 'px-4 py-2.5')}
        />

        {falha ? (
          <FalhaDaPagina falha={falha} slug={slug} aoTentarDeNovo={tentarDeNovo} />
        ) : carregando || !resumo || !numeros ? (
          <EsqueletoDaPagina />
        ) : (
          <>
            {resumo.amostraCobreJanela === false ? (
              <p role="note" className="text-caption text-fg-muted">
                {AVISO_DE_AMOSTRA}
              </p>
            ) : null}

            {resumo.base === 0 ? (
              <PeriodoVazio
                rotulo={rotuloDoPeriodo(periodo)}
                inicio={resumo.janela.inicio}
                terminaAgora={periodo.dias !== 'ontem' && periodo.dias !== 'livre'}
                verSeteDias={periodo.dias === 'hoje' || periodo.dias === 'ontem'}
                aoVerSeteDias={() => setPeriodo({ dias: '7', de: null, ate: null })}
                proximo={proximo}
                slug={slug}
              />
            ) : null}

            <Kpis numeros={numeros} />

            {/* `3fr 2fr` a partir de `lg`, uma coluna embaixo (`.gradeTresDois`, V9). */}
            <div className={consoleStyles.gradeTresDois}>
              <Funil numeros={numeros} />
              <Receita resumo={resumo} />
            </div>

            <div className={consoleStyles.gradeTresDois}>
              <AtividadeRecente
                slug={slug}
                busca={busca}
                linhas={linhas}
                carregando={false}
                erro={linhas === null}
                aoTentarDeNovo={tentarDeNovo}
              />
              <Qualidade numeros={numeros} envio={envio} />
            </div>
          </>
        )}

        <ChecklistEmpresa checklist={checklist} />
      </div>
    </main>
  );
}

/** Carregando: um esqueleto no lugar de cada bloco, na mesma grade. */
function EsqueletoDaPagina() {
  return (
    <RegiaoDeEspera rotulo="Carregando os números do período" className="flex min-w-0 flex-col gap-4 sm:gap-5">
      {/* As mesmas grades dos blocos de verdade, para nada pular quando os números chegam. */}
      <div className="@container">
        <div className={consoleStyles.gradeKpis}>
          {Array.from({ length: 5 }, (_, i) => (
            <Esqueleto key={i} className={cn('h-28', i === 4 && consoleStyles.kpiValor)} />
          ))}
        </div>
      </div>
      <div className={consoleStyles.gradeTresDois}>
        <Esqueleto className="h-72" />
        <Esqueleto className="h-72" />
      </div>
      <div className={consoleStyles.gradeTresDois}>
        <Esqueleto className="h-64" />
        <Esqueleto className="h-64" />
      </div>
    </RegiaoDeEspera>
  );
}

/** Desconectado, erro do servidor, resposta alheia ou sessão expirada: sempre com a saída. */
function FalhaDaPagina({
  falha,
  slug,
  aoTentarDeNovo,
}: {
  falha: Falha;
  slug: string;
  aoTentarDeNovo: () => void;
}) {
  if (falha.tipo === 'sessao') {
    return (
      <EstadoVazio
        cenario="erro"
        titulo="Sessão expirada"
        motivo="Entre de novo para ver os números desta empresa."
        acao={
          <Link
            href={`/login?destino=${encodeURIComponent(`/e/${slug}`)}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Entrar de novo
          </Link>
        }
      />
    );
  }
  const motivo =
    falha.tipo === 'servidor'
      ? `${falha.mensagem} Tente de novo.`
      : falha.tipo === 'outra-empresa'
        ? 'A resposta veio de outra empresa e foi descartada. Tente de novo.'
        : 'Sem resposta do servidor. Tente de novo.';
  return (
    <EstadoVazio
      cenario="erro"
      titulo="Os números do período não vieram"
      motivo={motivo}
      acao={
        <Button variant="outline" size="sm" onClick={aoTentarDeNovo}>
          Tentar de novo
        </Button>
      }
    />
  );
}

/**
 * Vazio (`base = 0`): os blocos continuam na tela, cada um com o seu "—", e
 * este aviso diz desde quando nada chega e o que fazer (V9, com o
 * `EstadoVazio` de sempre). Em Hoje/Ontem, o clique mais útil é abrir os
 * últimos 7 dias; senão, o próximo passo da configuração; e, com tudo
 * configurado, a aba Fontes, onde está a tag que manda os eventos.
 *
 * "Desde" só quando o período termina agora (Hoje e os últimos 7, 30 e 90
 * dias): em Ontem e no intervalo livre, "desde" mentiria sobre o que veio
 * depois do fim da janela.
 */
function PeriodoVazio({
  rotulo,
  inicio,
  terminaAgora,
  verSeteDias,
  aoVerSeteDias,
  proximo,
  slug,
}: {
  rotulo: string;
  /** Início da janela que o servidor usou (`resumo.janela.inicio`). */
  inicio: string;
  terminaAgora: boolean;
  verSeteDias: boolean;
  aoVerSeteDias: () => void;
  proximo: ChecklistDaEmpresa['proximo'];
  slug: string;
}) {
  const desde = dataHoraDeBrasilia(inicio);
  const titulo =
    terminaAgora && desde !== SEM_DADO
      ? `Nenhum evento chegou desde ${desde}`
      : `Nenhum evento chegou neste período (${rotulo.toLowerCase()})`;
  const oQueFazer =
    !verSeteDias && proximo
      ? `Próximo passo: ${proximo.verbo.toLowerCase()}.`
      : 'Os números abaixo ficam em "—" até chegar o primeiro.';

  return (
    <div role="status">
      <EstadoVazio
        titulo={titulo}
        motivo={`${oQueFazer} Nada é enviado à Meta para testar: a tela só conta evento real.`}
        className="px-4 py-5"
        acao={
          verSeteDias ? (
            <Button variant="outline" size="sm" onClick={aoVerSeteDias}>
              Ver os últimos 7 dias
            </Button>
          ) : proximo ? (
            <Link href={proximo.href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {proximo.verbo}
            </Link>
          ) : (
            <Link
              href={enderecoDaAba(slug, 'fontes')}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Abrir a aba Fontes
            </Link>
          )
        }
      />
    </div>
  );
}
