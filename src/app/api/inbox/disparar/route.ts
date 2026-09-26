import { NextRequest, NextResponse } from 'next/server';
import { acharEntrada } from '@/lib/inbox';
import { parseWebhook } from '@/lib/parser';
import {
  EMPRESA_DEFAULT_ID,
  lerIntegracoes,
  acharRegra,
  listarMarcas,
  empresaDaMarca,
} from '@/lib/config-store';
import { empresaParaEscrita } from '@/lib/empresa-ativa';
import { dispararItem } from '@/lib/auto-dispatch';
import { exigirSessao } from '@/lib/sessao';
import { ehNomePadraoMeta } from '@/lib/meta-events';

export const dynamic = 'force-dynamic';

/**
 * "Disparar agora": manda um item da caixa de entrada para a Meta sem passar
 * pelo formulario. Roda no servidor pelo mesmo caminho do modo automatico, para
 * que as travas (teste interno, heranca de atribuicao, dedup) sejam identicas.
 *
 * POST { id, marcas?: string[], eventoMeta?: string }
 *
 * `marcas` so aceita Pixels da empresa do item (400 se vier um de fora, e nada
 * sai). Ausente: os Pixels da regra; sem nenhum, `default` — so na empresa
 * padrao. Ver a Trava 3.
 */
export async function POST(request: NextRequest) {
  try {
    exigirSessao(request);
    // T6 (C1): aba e navegador em empresas diferentes → 409 antes de ler o
    // corpo, e nada sai. Evento enviado da empresa errada não volta atrás.
    const empresaId = await empresaParaEscrita(request, 'enviar');
    const body = (await request.json()) as { id?: string; marcas?: string[]; eventoMeta?: string };
    const item = await acharEntrada(String(body.id || ''));
    // Defesa em profundidade do disparo em lote: a tela ja so mostra itens da
    // empresa ativa, mas o lote manda um POST por id, e id de outra empresa nao
    // pode virar evento. 404 — e nao 403 — para nao revelar que o item existe.
    if (!item || (item.empresaId ?? EMPRESA_DEFAULT_ID) !== empresaId) {
      return NextResponse.json({ erro: 'Entrada não encontrada.' }, { status: 404 });
    }
    // R2 da C10: o "Testar" da plataforma (ping) não vira evento por clique.
    // A tela já tira o botão (`podeDisparar`, InboxList.tsx); isto fecha a porta
    // para curl e script: sem `marcas`, o recuo em `regra.marcas` levaria a
    // sonda ao Pixel de produção. A sonda automática já foi (ou não) na chegada.
    if (item.testePlataforma || item.classificacao === 'teste-plataforma') {
      return NextResponse.json(
        {
          erro:
            'Este é o teste do botão "Testar" da plataforma: ele não vai para a Meta por aqui. Nada foi enviado.',
        },
        { status: 409 }
      );
    }

    const r = parseWebhook(JSON.stringify(item.payload));
    // As regras — e os Pixels que elas citam — sao as DA EMPRESA DO ITEM, que a
    // linha acima garante ser a da requisicao. Ler as da `default` aqui faria o
    // fallback `regra.marcas` disparar o item de um cliente no Pixel de outro.
    // O resto da rota nao muda: travas, dedupe e `anotarResultado` intactos.
    const cfg = await lerIntegracoes(empresaId);
    const regra = r.eventoOrigem ? acharRegra(cfg, r.eventoOrigem) : undefined;
    // Trava 1: regra em Ignorar nao dispara nem por clique. A tela ja esconde o
    // botao; isto fecha a porta para requisicao repetida, aba velha e curl.
    if (regra?.modo === 'ignorar') {
      return NextResponse.json(
        {
          erro:
            'Esta regra está em Ignorar: o evento não vai para a Meta. Mude o modo na aba Regras se quiser enviá-lo.',
        },
        { status: 409 }
      );
    }

    // `r.eventName` so existe para nome mapeado; NUNCA cair no nome de origem:
    // "ping" viraria um evento personalizado na Meta com HTTP 200 e ninguem veria.
    const eventoMeta = String(body.eventoMeta || regra?.eventoMeta || r.eventName || '');
    if (!eventoMeta) {
      return NextResponse.json(
        { erro: 'Não sei qual evento da Meta usar. Informe eventoMeta.' },
        { status: 400 }
      );
    }

    // Trava 2: so nome padrao da Meta, com a caixa exata. Qualquer outra string
    // e aceita com 200 e vira evento personalizado que nao otimiza campanha.
    if (!ehNomePadraoMeta(eventoMeta)) {
      return NextResponse.json(
        {
          erro: `"${eventoMeta}" não é um evento padrão da Meta. Escolha um evento padrão na aba Regras — nomes fora do padrão viram evento personalizado e não otimizam campanha.`,
        },
        { status: 400 }
      );
    }

    /**
     * 🔴 Trava 3 (F1, auditoria de 23/09/2026): todo Pixel de destino tem de ser
     * da EMPRESA DO ITEM — a mesma autoridade que `dispararItem` usa.
     *
     * Antes a lista entrava como viesse, e a tela de uma empresa nao padrao
     * mandava o Pixel `default` (do Codigo Vencedor) marcado e escondido: a
     * venda de um cliente saia no Pixel do dono. Conversao enviada ao Pixel
     * errado nao volta atras, entao a conferencia e da lista INTEIRA, antes do
     * primeiro envio: um unico Pixel de fora recusa o pedido todo (400) e nada
     * sai para ninguem. Mandar "so os certos" esconderia do operador que a tela
     * dele pediu errado.
     *
     * Mesma regra de dono do PUT de /api/integracoes (`empresaDaMarca`, a que
     * `listarMarcas(empresa)` aplica): id que nao existe mais tambem fica de
     * fora, em vez de cair no Pixel `default` pela queda de `acharMarca`.
     *
     * O recuo para `['default']` so vale para item da empresa padrao, que e a
     * dona dele. Item de outra empresa sem Pixel pedido e sem Pixel na regra e
     * 400, pedindo a escolha.
     */
    const empresaDoItem = item.empresaId ?? EMPRESA_DEFAULT_ID;
    const marcas: string[] = Array.isArray(body.marcas) && body.marcas.length
      ? body.marcas
      : regra?.marcas?.length
        ? regra.marcas
        : empresaDoItem === EMPRESA_DEFAULT_ID
          ? ['default']
          : [];

    if (!marcas.length) {
      return NextResponse.json(
        {
          erro: 'Escolha ao menos um Pixel desta empresa para enviar o evento. Nada foi enviado.',
        },
        { status: 400 }
      );
    }

    const todas = await listarMarcas();
    const daEmpresa = new Set(
      todas.filter((m) => empresaDaMarca(m) === empresaDoItem).map((m) => m.id)
    );
    const deFora = marcas.filter((m) => !daEmpresa.has(m));
    if (deFora.length) {
      const motivo = (id: string) => {
        const m = todas.find((x) => x.id === id);
        return m ? `o Pixel "${m.nome || id}" é de outra empresa` : `o Pixel "${id}" não existe mais`;
      };
      return NextResponse.json(
        {
          erro: `Nada foi enviado: ${deFora.map(motivo).join('; ')}. Este evento só pode ir para os Pixels da empresa que o recebeu — desmarque esse Pixel e escolha um desta empresa.`,
        },
        { status: 400 }
      );
    }

    const resultados = await dispararItem({ item, campos: r.fields, eventoMeta, marcas, origem: 'manual' });
    return NextResponse.json({ resultados });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
