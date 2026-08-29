import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Token público de uma seleção compartilhável — 24 bytes aleatórios
 * (192 bits) em base64url, bem além do necessário pra não ser adivinhável
 * nem enumerável (nunca um id sequencial).
 */
export function generateSelectionToken(): string {
  return randomBytes(24).toString("base64url");
}
