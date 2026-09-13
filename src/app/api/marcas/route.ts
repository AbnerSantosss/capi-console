import { NextRequest, NextResponse } from 'next/server';
import {
  listarMarcas,
  publicarMarca,
  salvarMarca,
  removerMarca,
  acharMarca,
} from '@/lib/config-store';
import { exigirSessao } from '@/lib/sessao';
import { erroDeRota } from '@/lib/erro-api';

/**
 * Lista as marcas SEM o token de acesso.
 *
 * B-11 — este GET era o unico handler do arquivo sem guarda: o PUT e o DELETE
 * ja chamavam `exigirSessao()`. `MarcaPublica` nao leva o token, mas leva o
 * `pixelId` de todas as marcas, e a assinatura mudou para receber `request`.
 */
export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    const marcas = await listarMarcas();
    return NextResponse.json({ marcas: marcas.map(publicarMarca) });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível listar os Pixels.');
  }
}

/** Cria ou atualiza uma marca. O token so trafega nesta direcao. */
export async function PUT(request: NextRequest) {
  try {
    exigirSessao(request);
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ erro: 'Informe o id da marca.' }, { status: 400 });
    }
    if (!String(body.nome || '').trim()) {
      return NextResponse.json({ erro: 'Informe o nome da marca.' }, { status: 400 });
    }
    if (!String(body.pixelId || '').trim()) {
      return NextResponse.json({ erro: 'Informe o Pixel ID.' }, { status: 400 });
    }

    /**
     * 🔴 `autoDisparo` so entra no objeto quando o corpo manda um BOOLEANO.
     *
     * `salvarMarca` mescla (`...base, ...entrada`), entao uma chave ausente
     * preserva o valor gravado e uma chave presente sobrescreve. Isso separa
     * as duas intencoes que chegam por este mesmo PUT:
     *
     *   - o formulario de edicao (nome, pixel, token) NAO manda o campo, e
     *     salvar o formulario nunca desliga o automatico por acidente;
     *   - o Switch do card manda `true`/`false` de proposito.
     *
     * Qualquer outro valor (string "true", 1, null) e IGNORADO, nao coagido:
     * este campo autoriza envio de conversao real sem revisao humana, e
     * coercao e exatamente como se liga o que ninguem pediu (9.5.1).
     */
    const mudaAuto = typeof body.autoDisparo === 'boolean';
    const ligando = mudaAuto && body.autoDisparo === true;

    /**
     * B3-e: LIGAR exige Pixel ID e token. DESLIGAR nunca e recusado.
     *
     * A tela ja impede antes (o Switch nasce desabilitado num Pixel sem
     * token), mas a tela nao e a garantia: este PUT e publico para qualquer
     * sessao autenticada, e quem liga aqui autoriza envio de conversao real
     * sem revisao humana. O Pixel ID ja e obrigatorio em todo PUT, acima.
     *
     * O token conferido e o que a marca VAI ter depois desta gravacao, com a
     * mesma regra de mesclagem de `salvarMarca`: string vazia = "nao mexer",
     * `null` = limpar. Ligar e limpar o token no MESMO pedido e recusado —
     * fila e sempre a direcao segura quando a resposta nao e obvia.
     */
    if (ligando) {
      const limpandoToken = body.accessToken === null;
      const tokenEnviado = limpandoToken ? '' : String(body.accessToken ?? '').trim();
      const atual = (await listarMarcas()).find((m) => m.id === id);
      const tokenDepois = limpandoToken ? '' : tokenEnviado || (atual?.accessToken ?? '').trim();

      if (!tokenDepois) {
        return NextResponse.json(
          {
            erro:
              'Este Pixel não tem token de acesso. Sem token nada sai para a Meta, ' +
              'então o disparo automático não pode ser ligado. Salve o token primeiro.',
          },
          { status: 400 }
        );
      }
    }

    await salvarMarca({
      id,
      nome: String(body.nome).trim(),
      pixelId: String(body.pixelId).trim(),
      accessToken: body.accessToken === null ? null : String(body.accessToken ?? ''),
      testCode: String(body.testCode ?? '').trim(),
      adAccountId: String(body.adAccountId ?? '').trim() || undefined,
      ...(mudaAuto ? { autoDisparo: body.autoDisparo as boolean } : {}),
    } as Parameters<typeof salvarMarca>[0]);

    // Devolve a visao mesclada (config + .env), nao o registro cru: uma marca
    // sem token proprio herda o do .env e precisa aparecer como temToken: true.
    const mesclada = await acharMarca(id);
    return NextResponse.json({
      marca: mesclada ? publicarMarca(mesclada) : null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    exigirSessao(request);
    const id = new URL(request.url).searchParams.get('id') ?? '';
    await removerMarca(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
