// CONFERE GERAL — PURO. Junta os resultados de campo e decide o veredito.
//  🟢 GREEN   : todos os campos críticos conferem e não há avisos.
//  🟡 REVIEW  : há avisos; só libera depois que o funcionário marca TODOS como revisados.
//  🔴 BLOCKED : divergência crítica. NÃO HÁ BYPASS: só uma nova tentativa resolve.
import type { FieldResult, FieldVerdict } from "./address.ts";

export type Verdict = "GREEN" | "REVIEW" | "BLOCKED";

export interface ConfereResult {
  verdict: Verdict;
  blocking: FieldResult[];
  review: FieldResult[];
  /** Campos que exigem revisão humana (usados no bloqueio de aprovação). */
  reviewFields: string[];
}

export function decideVerdict(results: readonly FieldResult[]): ConfereResult {
  const blocking = results.filter((r) => r.verdict === "BLOCKED");
  const review = results.filter((r) => r.verdict === "REVIEW");
  const verdict: Verdict = blocking.length > 0 ? "BLOCKED" : review.length > 0 ? "REVIEW" : "GREEN";
  return { verdict, blocking, review, reviewFields: review.map((r) => r.field) };
}

/** Aprovação só com veredito GREEN, ou REVIEW com TODOS os avisos marcados como revisados. */
export function canApprove(result: ConfereResult, reviewedFields: readonly string[]): { ok: true } | { ok: false; error: string } {
  if (result.verdict === "BLOCKED") {
    return { ok: false, error: "Conferência bloqueada: há divergência crítica. Recomece a conferência com os documentos corretos." };
  }
  if (result.verdict === "REVIEW") {
    const pending = result.reviewFields.filter((f) => !reviewedFields.includes(f));
    if (pending.length > 0) return { ok: false, error: `Marque como revisados os avisos: ${pending.join(", ")}.` };
  }
  return { ok: true };
}

export type { FieldVerdict };
