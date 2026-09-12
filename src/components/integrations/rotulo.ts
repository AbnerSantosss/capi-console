/**
 * Apelido da URL de recebimento, do lado do navegador.
 *
 * Espelho das regras de `src/lib/config-store.ts`, que é `server-only` e não
 * pode ser importado por um componente de cliente. A autoridade continua sendo
 * o servidor: o PUT de /api/integracoes normaliza e valida de novo antes de
 * gravar. Aqui é só para o campo reclamar na hora de digitar.
 */

export const ROTULO_MIN = 3;
export const ROTULO_MAX = 40;
export const ROTULO_PADRAO = 'xwinner-codigo-vencedor';

const RE_ROTULO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aceita o que o operador digitou e devolve o slug. Não valida, normaliza. */
export function normalizarRotulo(v: string): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ROTULO_MAX)
    .replace(/-+$/g, '');
}

/** Erro legível, ou null se o slug serve. */
export function erroDoRotulo(v: string): string | null {
  if (v.length < ROTULO_MIN) return `Use ao menos ${ROTULO_MIN} caracteres.`;
  if (v.length > ROTULO_MAX) return `Máximo de ${ROTULO_MAX} caracteres.`;
  if (!RE_ROTULO.test(v)) return 'Só minúsculas, dígitos e hífen entre palavras.';
  if (RE_UUID.test(v)) return 'Isso tem cara de segredo. O rótulo é público — use um apelido.';
  return null;
}
