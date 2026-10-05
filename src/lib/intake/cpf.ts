// CPF — validação com dígitos verificadores (sem adivinhar; sem API externa).

export function isValidCpf(raw: string | null | undefined): boolean {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

/** Só dígitos, ou null quando vazio. Não valida dígitos aqui — use isValidCpf. */
export function cpfDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits === "" ? null : digits;
}
