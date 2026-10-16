/**
 * Formata o identificador interno (bigint vindo do banco) como string de 8
 * dígitos — "580" vira "00000580". Se o valor já tiver 8+ dígitos (uso
 * distante no tempo), `padStart` não trunca nada, só deixa de completar.
 */
export function formatInternalCode(internalCode: number | string): string {
  return String(internalCode).padStart(8, "0");
}

/**
 * Normaliza um termo de busca do Admin pra um possível internal_code: só
 * dígitos (com ou sem zeros à esquerda) vira o inteiro equivalente — "580"
 * e "00000580" devolvem o mesmo 580. Qualquer outro texto (nome, código
 * legado alfanumérico) devolve null, sinalizando "não é uma busca por
 * internal_code".
 */
export function parseInternalCodeSearchTerm(term: string): number | null {
  const trimmed = term.trim();
  if (trimmed === "" || !/^[0-9]+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}
