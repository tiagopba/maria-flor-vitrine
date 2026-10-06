// Saudação das mensagens de WhatsApp — PURO. Só muda a apresentação: o nome gravado
// no banco, na NF-e, na etiqueta e no destinatário continua completo.

/**
 * Primeiro nome para a saudação: "NEUSA CARDIM" → "Neusa", "Maria Aparecida " → "Maria".
 * Pega a primeira palavra que tenha letra (ignora espaços extras e tokens sem letra).
 * Nome vazio ou inválido → null (quem chama usa o fallback "Olá!").
 */
export function customerFirstName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const token = name
    .trim()
    .split(/\s+/)
    .find((word) => /\p{L}/u.test(word));
  if (!token) return null;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** "Olá, Neusa" ou, sem nome válido, "Olá". Quem chama acrescenta a pontuação do template. */
export function greetingHello(name: string | null | undefined): string {
  const first = customerFirstName(name);
  return first ? `Olá, ${first}` : "Olá";
}
