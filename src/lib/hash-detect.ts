// Um SHA-256 em hexadecimal tem exatamente 64 caracteres de [0-9a-f].
// A Meta documenta esse formato, em minusculas, sem prefixo.
const RE_SHA256 = /^[a-f0-9]{64}$/;

/** true quando o valor JA e um SHA-256 hexadecimal e nao deve ser hasheado de novo. */
export function jaEhSha256(valor: string): boolean {
  return RE_SHA256.test(valor.trim().toLowerCase());
}
