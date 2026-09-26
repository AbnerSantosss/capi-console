import { NextRequest, NextResponse } from 'next/server';

import { inicioDaMemoriaNoTeto, listarEntradas } from '@/lib/inbox';
import { periodoValido, resumirInbox } from '@/lib/inbox-resumo';
import { empresaDaRequisicao } from '@/lib/empresa-ativa';
import { exigirSessao } from '@/lib/sessao';
import { erroDeRota } from '@/lib/erro-api';

export const dynamic = 'force-dynamic';

/**
 * Quantos itens o resumo olha. É o mesmo teto de `LIMITE_MEMORIA` em `inbox.ts`:
 * o painel precisa contar a partir da MESMA janela que a lista mostra, senão o
 * número do card não bate com a lista que o clique abre. A tela diz, com todas
 * as letras, que está olhando "os últimos N recebidos".
 */
const AMOSTRA = 1000;

/**
 * Resumo da caixa de entrada para o Painel de eventos.
 *
 * Só leitura, só da empresa da requisição, e NUNCA devolve `payload`: o resumo é
 * contagem, não carrega dado de cliente. Nada aqui dispara evento para a Meta.
 *
 * `?comparar=1` acrescenta `resumo.anterior` (a janela anterior, do mesmo
 * tamanho). A resposta traz o `empresaId` que ESTA rota resolveu: a tela
 * descarta a resposta que chegar atrasada de outra empresa, do mesmo jeito que
 * descarta a de outro período.
 */
export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    const empresaId = await empresaDaRequisicao(request);
    const busca = new URL(request.url).searchParams;
    const periodo = periodoValido(busca.get('dias'), busca.get('de'), busca.get('ate'));
    const comparar = busca.get('comparar') === '1';
    const itens = await listarEntradas(AMOSTRA, empresaId);
    // A memória é de TODAS as empresas: no teto, a lista desta pode ser curta
    // e ainda assim ter perdido os itens antigos (R2 da V4).
    const memoriaComecaEm = await inicioDaMemoriaNoTeto();
    // `AMOSTRA` entra de novo aqui, agora como teto declarado: é assim que o
    // resumo sabe dizer se a leitura alcançou o começo da janela ou parou antes.
    const resumo = resumirInbox(itens, new Date().toISOString(), periodo, AMOSTRA, {
      comparar,
      memoriaComecaEm,
    });
    return NextResponse.json({ resumo, empresaId });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível montar o painel.');
  }
}
