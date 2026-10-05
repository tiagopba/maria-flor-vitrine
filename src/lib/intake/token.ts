// Token público do link de coleta — PURO (crypto nativo; sem dependência nova).
// Só o HASH é guardado no banco. O token em claro vai apenas na URL.
import { createHash, randomBytes } from "node:crypto";

export const INTAKE_TOKEN_TTL_DAYS = 7;

/** Token opaco de 32 bytes aleatórios (≈ 256 bits), em base64url. */
export function generateIntakeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashIntakeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function intakeExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + INTAKE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function isIntakeTokenExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function intakePath(token: string): string {
  return `/dados-envio/${token}`;
}
