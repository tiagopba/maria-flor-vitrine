"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import { applyDeliveryUpdate } from "../delivery-update-shared";

export type UpdateDeliveryResult = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
};

/**
 * "Atualizar situação": só campos operacionais (status, previsão, entrega,
 * observações, transportadora/serviço/rastreio). Dados do cliente e os PDFs
 * nunca passam por aqui. A regra de negócio em si (validação, auto
 * IN_TRANSIT, auditoria) é só uma, em `applyDeliveryUpdate` — esta action só
 * decide o redirect de sucesso (pro próprio detalhe).
 */
export async function updateDeliveryAction(id: string, formData: FormData): Promise<UpdateDeliveryResult> {
  const admin = await requireAdmin(["admin", "master"]);
  const result = await applyDeliveryUpdate(id, formData, admin);
  if (!result.ok) return result;
  redirect(`/admin/faturamento-envios/${result.recordId}?sucesso=${encodeURIComponent("Situação atualizada.")}`);
}
