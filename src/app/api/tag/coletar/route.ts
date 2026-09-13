import { NextRequest, NextResponse } from 'next/server';

import {
  processarTag,
  resolverOrigemTag,
  cabecalhosCorsTag,
} from '@/lib/tag-handler';

export const dynamic = 'force-dynamic';

/**
 * Coletor publico da tag do navegador.
 *
 *   POST /api/tag/coletar   corpo JSON (ou text/plain, vindo de sendBeacon)
 *
 * Rota fina de proposito: toda a decisao esta em src/lib/tag-handler.ts, igual
 * ao par rota/handler do webhook da plataforma.
 *
 * DIFERENCA IMPORTANTE PARA O CORS DO WEBHOOK: la a origem e '*', porque quem
 * protege aquele endpoint e o segredo no caminho, que nenhum navegador conhece.
 * Aqui nao ha segredo — a chave da tag e publica e qualquer visitante a le no
 * HTML —, entao a lista de dominios cadastrados E a tranca, e ela so funciona
 * se a origem for ECOADA uma a uma. Um '*' aqui abriria o coletor para qualquer
 * site da internet mandar evento em nome do cliente.
 *
 * Esta rota precisa estar em LIVRES, no src/proxy.ts: sem isso o proxy responde
 * 401 antes do handler e a tag nunca coleta nada.
 */

/** Aplica o CORS na resposta. Vale para TUDO, inclusive erro — sem os cabecalhos o navegador esconde ate o status. */
function comCors(resposta: NextResponse, origem: string): NextResponse {
  for (const [k, v] of Object.entries(cabecalhosCorsTag(origem))) {
    resposta.headers.set(k, v);
  }
  return resposta;
}

/**
 * Preflight. Origem fora da lista recebe 403 SEM nenhum cabecalho de CORS: o
 * navegador aborta antes do POST e o site nao cadastrado nao descobre nada
 * sobre a configuracao daqui.
 */
export async function OPTIONS(request: NextRequest) {
  const origem = await resolverOrigemTag(request);
  if (!origem) {
    return NextResponse.json({ erro: 'Origem nao autorizada.' }, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: cabecalhosCorsTag(origem) });
}

export async function POST(request: NextRequest) {
  // A origem e resolvida uma vez so e repassada ao handler: assim o hit le a
  // config uma unica vez, e a resposta de erro sai com o mesmo CORS da de
  // sucesso — erro sem CORS chega no navegador como falha de rede, e o operador
  // perde a hora depurando a tag do cliente achando que e bloqueador.
  const origem = await resolverOrigemTag(request);
  const resposta = await processarTag(request, origem);
  return origem ? comCors(resposta, origem) : resposta;
}
