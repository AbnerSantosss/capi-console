import { NextRequest, NextResponse } from 'next/server';

import { lerIntegracoes } from '@/lib/config-store';
import { empresaDaRequisicao } from '@/lib/empresa-ativa';
import { exigirSessao } from '@/lib/sessao';
import { hostDaTag, type DominioTag } from '@/lib/tag-dominios';
import { gerarTodasAsTags } from '@/lib/tag-script';

export const dynamic = 'force-dynamic';

/**
 * Gerador das tags prontas, para a aba "Tag do site" do console.
 *
 *   GET /api/tag/gerar?dominio=<id>   -> { endpoint, dominioId, tags: [...] }
 *
 * Rota COM sessao, ao contrario do coletor: aqui sai a chave publica junto de
 * cada tag, e nao ha motivo para servir isso a quem nao esta logado.
 *
 * A geracao acontece no servidor de proposito. O gerador de tag-script.ts e
 * grande e conhece o nucleo inteiro do coletor; arrasta-lo para o bundle do
 * navegador faria toda visita ao console baixar codigo que so o operador usa
 * uma vez, ao cadastrar um dominio.
 */

/**
 * Caminho do coletor publico. Uma letra errada aqui nao quebra nada no console:
 * quebra semanas depois, no site do cliente, como uma tag instalada que nunca
 * coletou um evento.
 */
const CAMINHO_COLETOR = '/api/tag/coletar';

/** Ultimo recurso quando nao ha PUBLIC_BASE_URL nem origem na requisicao. */
const BASE_FALLBACK = 'http://localhost:3333';

/**
 * Base publica deste console.
 *
 * PUBLIC_BASE_URL manda: dentro da VPS o operador abre o console por localhost,
 * e uma tag gerada apontando para localhost e uma tag que so funciona na
 * maquina de quem gerou.
 */
function baseDaRequisicao(request: NextRequest): string {
  const env = String(process.env.PUBLIC_BASE_URL ?? '').trim();
  if (env) return /^https?:\/\//i.test(env) ? env : `https://${env}`;
  return request.nextUrl.origin || BASE_FALLBACK;
}

/**
 * URL completa do coletor que a tag deste dominio vai chamar.
 *
 * Com subdominio do cliente a tag vira primeira parte e o cookie sobrevive ao
 * ITP; sem ele, cai na nossa base. `hostDaTag` devolve o hostname SEM porta, e
 * por isso a base propria volta como origem inteira: se nao, o console rodando
 * em :3333 geraria tag apontando para a porta 80, que nao responde.
 */
function endpointDoDominio(dominio: DominioTag | undefined, base: string): string {
  let origemBase: URL;
  try {
    origemBase = new URL(base);
  } catch {
    // Base torta no .env nao pode derrubar a tela inteira; a tag sai apontando
    // para o padrao local e o aviso de localhost aparece no console.
    origemBase = new URL(BASE_FALLBACK);
  }
  if (!dominio) return `${origemBase.origin}${CAMINHO_COLETOR}`;
  const host = hostDaTag(dominio, base);
  if (!host || host === origemBase.hostname) {
    return `${origemBase.origin}${CAMINHO_COLETOR}`;
  }
  return `https://${host}${CAMINHO_COLETOR}`;
}

/**
 * Devolve o pacote inteiro de tags de um dominio.
 *
 * Sem `?dominio=` usa o primeiro cadastrado — e o caso comum, um cliente so.
 * Id que nao existe responde 404 em vez de cair no primeiro: o operador
 * copiaria a tag do dominio errado e o coletor recusaria o Origin, sem nenhuma
 * mensagem visivel no site do cliente.
 */
export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);

    // Cada empresa tem chave de tag e lista de dominios proprias: a tag gerada
    // aqui tem de ser a da empresa que o operador esta olhando, ou o cliente
    // instala no site dele uma tag que o coletor recusa por Origin.
    const { tag } = await lerIntegracoes(await empresaDaRequisicao(request));
    const base = baseDaRequisicao(request);
    const pedido = request.nextUrl.searchParams.get('dominio')?.trim() ?? '';
    const dominio = pedido
      ? tag.dominios.find((d) => d.id === pedido)
      : tag.dominios[0];

    if (pedido && !dominio) {
      return NextResponse.json({ erro: 'Domínio não cadastrado.' }, { status: 404 });
    }

    const endpoint = endpointDoDominio(dominio, base);
    // `gerarTodasAsTags` recusa por dentro qualquer evento de dinheiro, entao o
    // catalogo inteiro pode passar: Purchase e Subscribe nunca saem daqui.
    const tags = gerarTodasAsTags(endpoint, tag.chave, undefined, dominio?.host);

    return NextResponse.json({ endpoint, dominioId: dominio?.id ?? null, tags });
  } catch (e) {
    if (e instanceof Response) return e;
    // Chave vazia ou endpoint torto chegam aqui como Error do gerador. A
    // mensagem dele ja diz o que fazer, entao ela vai inteira para a tela.
    const msg = e instanceof Error ? e.message : 'Não foi possível gerar as tags.';
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
