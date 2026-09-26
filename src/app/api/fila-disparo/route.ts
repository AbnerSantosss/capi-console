import { NextRequest, NextResponse } from 'next/server';
import { exigirSessao } from '@/lib/sessao';

/**
 * Disparo em lote — APOSENTADO em 23/09/2026 (D14, D15, T5; tarefa C11 do
 * plano de correções do pacote 16).
 *
 * Esta rota recebia entregas de webhook coladas no corpo, montava uma fila e
 * mandava tudo para a Meta pelo processador de lote de `src/lib/` (apagado
 * junto; está no histórico do git). No
 * caminho ela inventava compra: o evento que não era reconhecido caía em
 * `Lead`, e a marca pedida nunca dava 404 (caía no Pixel padrão). Nenhuma tela
 * a chamava.
 *
 * Agora ela só responde 410 (Gone): não lê o corpo e não importa nada que
 * envie, grave disparo ou consulte o dedup. Venda que precisa sair vai pela
 * caixa de entrada do console. A sessão continua sendo exigida primeiro, como
 * nas outras rotas: quem não entrou recebe 401 e não descobre nada.
 */
const MENSAGEM = 'O disparo em lote foi aposentado. Use a caixa de entrada do console.';

export async function POST(request: NextRequest) {
  try {
    exigirSessao(request);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ erro: 'Falha ao conferir a sessão: ' + msg }, { status: 500 });
  }
  return NextResponse.json(
    { erro: MENSAGEM },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
