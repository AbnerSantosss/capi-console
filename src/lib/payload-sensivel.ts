/**
 * O que NÃO se guarda de um webhook (UX-14, 06/10/2026).
 *
 * O console guardava o corpo inteiro de cada entrega e o devolvia inteiro à
 * tela. No payload da Globaltech vinham junto o `user_token` (credencial do
 * jogador na plataforma), o `qrcode` (o código do PIX) e o `user_document`
 * (CPF) — nada disso serve à API de Conversões, e tudo isso passava a morar em
 * `logs/inbox.jsonl`, nos backups e na resposta de `/api/inbox`.
 *
 * Módulo NEUTRO e sem dependência: roda na gravação (`registrarEntrada`) e na
 * leitura do que já estava gravado (`lerTudoDoDisco`). Nunca lança.
 *
 * 🔴 Só tira o que o parser NÃO lê. `taxId` (xWinner) fica: é ele que vira o
 * `external_id` no disparo manual, que relê o payload gravado. E-mail, telefone
 * e nome ficam pelo mesmo motivo — a tela já mascara o e-mail.
 */

export const MARCA_REMOVIDO = '[removido pelo console]';

/** Credencial ou código de pagamento: o valor some, a chave fica para o operador ver que veio. */
const CHAVE_SECRETA =
  /token|password|passwd|senha|secret|segredo|qr_?code|pix_?(code|copia|key)|copia_?e_?cola|authorization|api_?key/i;

/** Documento pessoal: fica só o final, para conferência. */
const CHAVE_DOCUMENTO = /(^|_)(document|documento|cpf|cnpj|rg|passport|passaporte)(_number|_numero)?$/i;

const PROFUNDIDADE_MAXIMA = 8;

function mascararDocumento(valor: unknown): unknown {
  if (valor === null || valor === undefined || valor === '') return valor;
  if (typeof valor !== 'string' && typeof valor !== 'number') return MARCA_REMOVIDO;
  const texto = String(valor);
  if (texto.length <= 2) return '*'.repeat(texto.length);
  return '*'.repeat(texto.length - 2) + texto.slice(-2);
}

/**
 * Cópia do payload sem credencial, sem código de pagamento e com o documento
 * mascarado. O original não é alterado.
 */
export function limparPayload(payload: unknown, nivel = 0): unknown {
  if (payload === null || typeof payload !== 'object') return payload;
  if (nivel >= PROFUNDIDADE_MAXIMA) return payload;
  try {
    if (Array.isArray(payload)) return payload.map((v) => limparPayload(v, nivel + 1));
    const saida: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(payload as Record<string, unknown>)) {
      if (CHAVE_SECRETA.test(chave)) {
        saida[chave] = valor === null || valor === undefined || valor === '' ? valor : MARCA_REMOVIDO;
      } else if (CHAVE_DOCUMENTO.test(chave)) {
        saida[chave] = mascararDocumento(valor);
      } else {
        saida[chave] = limparPayload(valor, nivel + 1);
      }
    }
    return saida;
  } catch {
    return payload;
  }
}
