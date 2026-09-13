import { NextRequest, NextResponse } from 'next/server';
import {
  listarEntradas,
  acharEntrada,
  marcarStatus,
  limparEntradas,
  type StatusEntrada,
} from '@/lib/inbox';
import { exigirSessao } from '@/lib/sessao';
import { erroDeRota, respostaErro } from '@/lib/erro-api';

export const dynamic = 'force-dynamic';

/**
 * B-11 (§14.8.2) — os três handlers deste arquivo dependiam SÓ do matcher do
 * proxy (`proxy.ts:90`). Hoje o matcher cobre, mas é uma linha de defesa só: se
 * alguém acrescentar uma exclusão a ele, o DELETE abaixo — que apaga
 * `inbox.jsonl` e `inbox-resultados.jsonl` inteiros — fica aberto na internet,
 * e o GET/PATCH passam a expor `payload` cru, que é PII de compradores.
 *
 * `exigirSessao()` aqui é defesa em profundidade: soma uma camada, não
 * substitui o proxy. Custa uma linha por handler.
 */

export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      const item = await acharEntrada(id);
      if (!item) {
        return respostaErro('Entrada não encontrada.', 404);
      }
      return NextResponse.json({ item });
    }
    return NextResponse.json({ itens: await listarEntradas(50) });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível ler a caixa de entrada.');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    exigirSessao(request);
    const body = await request.json();
    const status = String(body.status) as StatusEntrada;
    const item = await marcarStatus(String(body.id), status);
    return NextResponse.json({ item });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível atualizar a entrada — nada foi alterado.');
  }
}

/**
 * Apaga a caixa de entrada INTEIRA: `logs/inbox.jsonl` e
 * `logs/inbox-resultados.jsonl` (`inbox.ts:217-226`). É destrutivo e
 * irreversível — não há backup desses dois arquivos.
 *
 * ⚠️ A assinatura mudou: antes era `DELETE()`, sem o parâmetro `request`, e por
 * isso não tinha como checar sessão nenhuma (§1.7.2).
 *
 * B11-b — confirmação NO SERVIDOR: o corpo precisa trazer `{ "confirmar": true }`.
 * Um DELETE que apaga tudo não pode ser acionável por um clique perdido, por
 * uma aba velha repetindo a requisição, nem por um `curl` de teste.
 */
export async function DELETE(request: NextRequest) {
  try {
    exigirSessao(request);

    // Corpo ausente ou ilegível NÃO é erro de JSON aqui: é falta de confirmação.
    const corpo: unknown = await request.json().catch(() => null);
    const confirmado =
      typeof corpo === 'object' && corpo !== null && (corpo as { confirmar?: unknown }).confirmar === true;

    if (!confirmado) {
      return respostaErro(
        'Apagar a caixa de entrada é irreversível. Confirme a operação para continuar — nada foi apagado.',
        400
      );
    }

    await limparEntradas();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível limpar a caixa de entrada — nada foi apagado.');
  }
}
