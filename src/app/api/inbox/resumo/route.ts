import { NextRequest, NextResponse } from 'next/server';

import { listarEntradas } from '@/lib/inbox';
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
 */
export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    const empresaId = await empresaDaRequisicao(request);
    const dias = periodoValido(new URL(request.url).searchParams.get('dias'));
    const itens = await listarEntradas(AMOSTRA, empresaId);
    const resumo = resumirInbox(itens, new Date().toISOString(), dias);
    return NextResponse.json({ resumo });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível montar o painel.');
  }
}
