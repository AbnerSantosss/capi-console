import { NextResponse } from 'next/server';

import { ErroConfiguracaoIndisponivel } from './arquivo-atomico';

/**
 * B-10 — um formato de erro só, para TODAS as rotas.
 *
 * Antes conviviam quatro: `{ erros: string[] }` (api/enviar), `{ erro: string }`
 * (maioria), `{ erro, erros[] }` (api/integracoes) e rotas sem tratamento
 * nenhum (api/relay POST, api/inbox PATCH e DELETE). Uma rota sem try/catch
 * devolve o 500 cru do Next, que é HTML: o `fetch` da tela quebra no `.json()`
 * e o operador vê "erro inesperado" sem causa nenhuma.
 *
 * | campo   | quem lê        | conteúdo                                    |
 * |---------|----------------|---------------------------------------------|
 * | `erro`  | o operador     | uma frase de CONSEQUÊNCIA, não um código    |
 * | `erros` | a tela, campo a campo | detalhes por campo, quando houver     |
 *
 * B10-c: "Não foi possível salvar as regras — nada foi alterado", nunca
 * "PUT failed". B10-d: nenhuma mensagem carrega token, segredo ou PII.
 */
export interface CorpoErro {
  erro: string;
  erros?: string[];
}

export function respostaErro(erro: string, status: number, erros?: string[]): NextResponse<CorpoErro> {
  const corpo: CorpoErro = erros?.length ? { erro, erros } : { erro };
  return NextResponse.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Frase única do modo degradado (B1-e). O xWinner precisa ver **503** aqui, não
 * 401: 401 ele lê como "segredo errado" e para de tentar; 503 é "tente de novo
 * mais tarde" e a entrega volta sozinha quando a configuração voltar.
 */
export function respostaConfigIndisponivel(e: ErroConfiguracaoIndisponivel): NextResponse<CorpoErro> {
  return NextResponse.json(
    {
      erro:
        `Configuração indisponível: o servidor não conseguiu ler ${e.arquivo} nem a cópia ` +
        `${e.arquivo}.bak. Nada foi alterado e nenhum segredo foi trocado. Restaure o arquivo ` +
        `no volume e tente de novo.`,
    },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } }
  );
}

/**
 * Converte o que quer que tenha sido lançado numa resposta JSON com o formato
 * único. Usar no `catch` de TODA rota (B10-b).
 *
 * Ordem de decisão, e o motivo de cada uma:
 *  1. `Response` — foi `exigirSessao()` lançando 401. Devolve como veio.
 *     **401 é falta de sessão; nunca é indisponibilidade** (portão D33).
 *  2. `ErroConfiguracaoIndisponivel` — 503. **Nunca 401** (portão D33).
 *  3. `SyntaxError` — `request.json()` num corpo que não é JSON. 400.
 *  4. Qualquer outra coisa — `mensagem`, a frase que o autor da rota escreveu.
 *     A mensagem técnica do erro NÃO é repassada: ela pode carregar caminho,
 *     corpo de requisição ou trecho de credencial (B10-d).
 */
export function erroDeRota(
  e: unknown,
  mensagem: string,
  status = 500,
  erros?: string[]
): NextResponse<CorpoErro> | Response {
  if (e instanceof Response) return e;
  if (e instanceof ErroConfiguracaoIndisponivel) return respostaConfigIndisponivel(e);
  if (e instanceof SyntaxError) {
    return respostaErro('O corpo enviado não é um JSON válido — nada foi alterado.', 400);
  }
  return respostaErro(mensagem, status, erros);
}
