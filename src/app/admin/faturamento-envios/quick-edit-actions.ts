"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import { applyDeliveryUpdate, type ApplyDeliveryUpdateResult } from "./delivery-update-shared";

export type QuickUpdateDeliveryResult = { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Edição rápida da listagem: mesma regra de negócio de `updateDeliveryAction`
 * ([id]/actions.ts), via `applyDeliveryUpdate` — só muda o redirect, que
 * volta pra própria listagem (com os filtros/página atuais) em vez do
 * detalhe. `returnTo` vem curried (igual `saveTrackingAction`).
 */
export async function quickUpdateDeliveryAction(returnTo: string, id: string, formData: FormData): Promise<QuickUpdateDeliveryResult> {
  const admin = await requireAdmin(["admin", "master"]);
  const result: ApplyDeliveryUpdateResult = await applyDeliveryUpdate(id, formData, admin);
  if (!result.ok) return result;
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}sucesso=${encodeURIComponent("Situação atualizada.")}`);
}
