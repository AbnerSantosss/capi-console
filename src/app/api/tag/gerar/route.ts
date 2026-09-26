import { NextRequest, NextResponse } from 'next/server';

import { lerIntegracoes } from '@/lib/config-store';
import { empresaDaRequisicao } from '@/lib/empresa-ativa';
import {
  BASE_FALLBACK,
  endpointDoDominio,
  enderecoProprioPronto,
} from '@/lib/endereco-da-tag';
import { exigirSessao } from '@/lib/sessao';
import { hostDaTag } from '@/lib/tag-dominios';
import { gerarTodasAsTags } from '@/lib/tag-script';

export const dynamic = 'force-dynamic';

/**
 * Gerador das tags prontas, para a aba "Tag do site" do console.
 *
 *   GET /api/tag/gerar?dominio=<id>
 *     -> { endpoint, dominioId, tags: [...], enderecoProprioPronto }
 *
 * Rota COM sessao, ao contrario do coletor: aqui sai a chave publica junto de
 * cada tag, e nao ha motivo para servir isso a quem nao esta logado.
 *
 * A geracao acontece no servidor de proposito. O gerador de tag-script.ts e
 * grande e conhece o nucleo inteiro do coletor; arrasta-lo para o bundle do
 * navegador faria toda visita ao console baixar codigo que so o operador usa
 * uma vez, ao cadastrar um dominio.
 *
 * V8 do plano v7 (acrescimos de 24/09 05:25 e 08:50): a tag de um dominio com
 * subdominio so chama o endereco do cliente depois de MEDIDO que ele responde
 * por este console (`enderecoProprioPronto`, em `lib/endereco-da-tag.ts`).
 * Antes disso, chama o nosso coletor e continua coletando.
 */

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

    // O endereco proprio so entra na tag depois de MEDIDO: `<sub>.<host>`
    // respondeu por este console, com HTTPS valido. Com subdominio, `hostDaTag`
    // devolve `<sub>.<host>`; sem ele, o host da nossa base — e ai nem se
    // pergunta nada a ninguem.
    const hostProprio = dominio ? hostDaTag(dominio, base) : '';
    const nossoHost = dominio ? hostDaTag({ ...dominio, subdominio: undefined }, base) : '';
    const temSubdominio = Boolean(hostProprio) && hostProprio !== nossoHost;
    const certificadoPronto = temSubdominio ? await enderecoProprioPronto(hostProprio) : false;

    const endpoint = endpointDoDominio(dominio, base, certificadoPronto);
    // `gerarTodasAsTags` recusa por dentro qualquer evento de dinheiro, entao o
    // catalogo inteiro pode passar: Purchase e Subscribe nunca saem daqui.
    const tags = gerarTodasAsTags(endpoint, tag.chave, undefined, dominio?.host);

    return NextResponse.json({
      endpoint,
      dominioId: dominio?.id ?? null,
      tags,
      enderecoProprioPronto: certificadoPronto,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    // Chave vazia ou endpoint torto chegam aqui como Error do gerador. A
    // mensagem dele ja diz o que fazer, entao ela vai inteira para a tela.
    const msg = e instanceof Error ? e.message : 'Não foi possível gerar as tags.';
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
