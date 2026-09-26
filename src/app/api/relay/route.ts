import { NextRequest, NextResponse } from 'next/server';
import { lerIntegracoes } from '@/lib/config-store';
import { enviarRelay, listarEntregas } from '@/lib/relay';
import { empresaDaRequisicao } from '@/lib/empresa-ativa';
import { exigirSessao } from '@/lib/sessao';
import { erroDeRota, respostaErro } from '@/lib/erro-api';
import { NOME_PRODUTO } from '@/lib/produto';

export const dynamic = 'force-dynamic';

/**
 * B-11 — GET e POST dependiam só do matcher do proxy. O GET expõe o histórico
 * de entregas e o POST ACIONA um destino de relay (uma requisição de saída,
 * para uma URL de terceiro, com os headers cadastrados). `exigirSessao()` é a
 * segunda camada.
 *
 * B-10 — o POST não tinha try/catch nenhum: um destino com URL quebrada devolvia
 * o 500 do Next em HTML, e a tela, que espera JSON, mostrava "erro inesperado"
 * sem causa.
 */

export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    // Entrega gravada antes da FASE E nao tem o campo e conta como `default`.
    const empresaId = await empresaDaRequisicao(request);
    return NextResponse.json({ entregas: await listarEntregas(50, empresaId) });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível ler o histórico de entregas.');
  }
}

/** Testa um destino enviando um ping. */
export async function POST(request: NextRequest) {
  try {
    exigirSessao(request);
    const body = await request.json();
    // Os destinos sao os DA EMPRESA ATIVA — os mesmos que a tela listou. Ler os
    // da `default` aqui faria o botao Testar de um cliente responder 404 (ou,
    // pior, bater na URL de outro cliente que tivesse o mesmo id de destino).
    const cfg = await lerIntegracoes(await empresaDaRequisicao(request));
    const destino = cfg.saida.find((d) => d.id === body.destinoId);

    if (!destino) {
      return respostaErro('Destino não encontrado.', 404);
    }

    const entrega = await enviarRelay(destino, 'teste', {
      teste: true,
      mensagem: `Ping do ${NOME_PRODUTO}.`,
    });

    return NextResponse.json({ entrega });
  } catch (e) {
    // A mensagem do erro não é repassada de propósito: os headers do destino
    // podem carregar `Authorization: Bearer …` e aparecer no texto da falha.
    return erroDeRota(e, 'Não foi possível testar o endereço de repasse — nada foi enviado.');
  }
}
