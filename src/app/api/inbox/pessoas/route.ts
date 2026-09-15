import { NextRequest, NextResponse } from 'next/server';

import { listarEntradas, type ItemInbox } from '@/lib/inbox';
import { ehCompra, janelaDoPeriodo, periodoValido } from '@/lib/inbox-resumo';
import { empresaDaRequisicao } from '@/lib/empresa-ativa';
import { exigirSessao } from '@/lib/sessao';
import { erroDeRota } from '@/lib/erro-api';
import type { MotivoDeTeste } from '@/lib/deteccao-de-teste';

export const dynamic = 'force-dynamic';

/**
 * Quem foram as pessoas por trás de um número do Painel.
 *
 * O painel responde "quantos"; esta rota responde "quem". É ela que faz o
 * clique num card virar uma lista de nomes em vez de outra contagem.
 *
 * 🔴 NUNCA devolve `payload`, e isso é o desenho, não um esquecimento. O
 * payload traz e-mail e telefone em texto claro; o que sai daqui é o mesmo
 * conjunto que a caixa de entrada já mostra na tela — nome completo (o operador
 * precisa dele para achar a pessoa no backoffice) e e-mail MASCARADO, porque
 * e-mail é credencial de acesso ao produto.
 *
 * 🔴 A MESMA amostra e a MESMA janela do resumo. Se esta rota olhasse mais
 * itens, ou contasse o dia de outro jeito, a lista aberta pelo clique teria um
 * tamanho diferente do número clicado — e aí um dos dois está mentindo, sem que
 * dê para saber qual.
 */
const AMOSTRA = 1000;

/** O que a tela mostra de cada pessoa. Espelho enxuto e deliberado de `ItemInbox`. */
export interface PessoaDoEvento {
  id: string;
  recebidoEm: string;
  /** Nome completo, sem máscara: é com ele que o operador acha a pessoa no backoffice. */
  nomeCliente?: string;
  /** Mascarado na origem (`inbox.ts`). O e-mail inteiro nunca sai do servidor. */
  emailMascarado?: string;
  orderId?: string;
  valor?: number;
  moeda?: string;
  /** O nome que a origem usou — o mesmo que o painel agrupa. */
  evento: string;
  eventoMeta?: string;
  status: ItemInbox['status'];
  /** De onde veio o clique. `'nenhuma'` NÃO é defeito: é a venda PIX sem rastro. */
  atribuicao: 'meta' | 'google' | 'tiktok' | 'microsoft' | 'nenhuma';
  emq?: number;
  motivoDeTeste?: MotivoDeTeste;
  explicacaoDeTeste?: string;
  autoBloqueadoPorSuspeita?: boolean;
  testeInterno?: boolean;
  testePlataforma?: boolean;
}

/** Mesma régua do painel e da caixa: origem primeiro, traduzido depois. */
function nomeDoEvento(i: ItemInbox): string {
  return i.eventoOrigem ?? i.evento ?? 'sem nome de evento';
}

/**
 * Uma etiqueta só, a mais forte primeiro.
 *
 * A pessoa pode ter dois sinais (fbclid e gclid). A lista precisa de UMA
 * palavra por linha, e a Meta vem na frente porque é dela que este console
 * trata — os cards de atribuição do painel continuam contando cada sinal
 * separadamente, sem somar 100%.
 */
function atribuicaoDe(i: ItemInbox): PessoaDoEvento['atribuicao'] {
  if (i.temFbclid === true || i.temFbc === true) return 'meta';
  if (i.temGclid === true) return 'google';
  if (i.temTtclid === true) return 'tiktok';
  if (i.temMsclkid === true) return 'microsoft';
  return 'nenhuma';
}

function ehTeste(i: ItemInbox): boolean {
  return i.testeInterno === true || i.testePlataforma === true;
}

export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    const empresaId = await empresaDaRequisicao(request);
    const busca = new URL(request.url).searchParams;

    const periodo = periodoValido(busca.get('dias'), busca.get('de'), busca.get('ate'));
    const { inicio, fim } = janelaDoPeriodo(Date.now(), periodo);

    /**
     * O recorte. Um dos dois, nunca os dois:
     *   `?compras=1`  — todas as compras do período.
     *   `?evento=...` — um nome de evento, exatamente como o painel o agrupou.
     */
    const soCompras = busca.get('compras') === '1';
    const evento = (busca.get('evento') ?? '').trim();

    /**
     * Teste da equipe fica de FORA por padrão — a mesma regra 4 do CLAUDE.md que
     * o painel aplica. `?equipe=todos` traz tudo, para quando o operador quer
     * justamente conferir o que o console classificou como teste.
     */
    const incluirTestes = busca.get('equipe') === 'todos';

    const itens = await listarEntradas(AMOSTRA, empresaId);

    const pessoas = itens
      .filter((i) => {
        const t = Date.parse(i.recebidoEm);
        if (!Number.isFinite(t) || t < inicio || t > fim) return false;
        if (!incluirTestes && ehTeste(i)) return false;
        if (soCompras) return ehCompra(i);
        if (evento) return nomeDoEvento(i) === evento;
        return true;
      })
      .map<PessoaDoEvento>((i) => ({
        id: i.id,
        recebidoEm: i.recebidoEm,
        nomeCliente: i.nomeCliente,
        emailMascarado: i.emailMascarado,
        orderId: i.orderId,
        valor: i.valor,
        moeda: i.moeda,
        evento: nomeDoEvento(i),
        eventoMeta: i.eventoMeta,
        status: i.status,
        atribuicao: atribuicaoDe(i),
        emq: i.emq,
        motivoDeTeste: i.motivoDeTeste,
        explicacaoDeTeste: i.explicacaoDeTeste,
        autoBloqueadoPorSuspeita: i.autoBloqueadoPorSuspeita,
        testeInterno: i.testeInterno,
        testePlataforma: i.testePlataforma,
      }));

    return NextResponse.json({
      pessoas,
      periodo,
      janela: { inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString() },
      // A tela precisa saber se a leitura bateu o teto: 1000 itens lidos com o
      // mais antigo ainda dentro da janela significa que existe gente do período
      // que esta lista não alcançou, e dizer isso é obrigação.
      amostra: itens.length,
      tetoDaAmostra: AMOSTRA,
    });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível montar a lista.');
  }
}
