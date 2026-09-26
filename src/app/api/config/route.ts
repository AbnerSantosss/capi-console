import { NextRequest, NextResponse } from 'next/server';

import { exigirSessao } from '@/lib/sessao';
import { erroDeRota } from '@/lib/erro-api';

/**
 * B-11 — o conteudo aqui e o `process.env` ja filtrado (o token vira so um
 * booleano), entao o risco de abrir era baixo. Entra na lista mesmo assim: a
 * regra e "nenhuma rota fora de LIVRES sem `exigirSessao()`", e uma excecao
 * "porque essa e inofensiva" e exatamente o tipo de julgamento que envelhece
 * mal quando alguem acrescenta um campo novo aqui.
 */
export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    return NextResponse.json({
      pixelId: process.env.PIXEL_ID || '',
      temToken: Boolean(process.env.ACCESS_TOKEN),
      apiVersion: process.env.API_VERSION || 'v26.0',
    });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível ler a configuração do servidor.');
  }
}
