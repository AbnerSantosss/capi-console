import { NextRequest, NextResponse } from 'next/server';
import { lerIntegracoes } from '@/lib/config-store';
import { enviarRelay, listarEntregas } from '@/lib/relay';
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
    return NextResponse.json({ entregas: await listarEntregas(50) });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível ler o histórico de entregas.');
  }
}

/** Testa um destino enviando um ping. */
export async function POST(request: NextRequest) {
  try {
    exigirSessao(request);
    const body = await request.json();
    const cfg = await lerIntegracoes();
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
    return erroDeRota(e, 'Não foi possível testar o destino — nada foi enviado.');
  }
}
