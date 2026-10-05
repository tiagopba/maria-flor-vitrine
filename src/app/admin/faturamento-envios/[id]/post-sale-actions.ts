"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { getFulfillmentRecord, isUuid } from "@/lib/db/fulfillment";
import { insertPostSaleAudit, listPostSaleEvents } from "@/lib/db/post-sale";
import {
  derivePostSaleState,
  isPostSaleKind,
  planPostSaleEvent,
  postSaleAvailability,
  type PostSalePhase,
} from "@/lib/fulfillment/post-sale";

export type PostSaleResult = { ok: true } | { ok: false; error: string };

/**
 * Registra UM clique de pós-venda: "opened" (WhatsApp aberto) ou "confirmed"
 * (funcionário confirmou que enviou). Nunca envia mensagem. Só Admin/Master.
 * A regra (liberação, ordem OPENED→CONFIRMED) fica em planPostSaleEvent; aqui só
 * se lê o estado real do banco e se grava o evento.
 */
export async function registerPostSaleEvent(recordId: string, kind: string, phase: PostSalePhase): Promise<PostSaleResult> {
  const admin = await requireAdmin(["admin", "master"]);
  if (!isUuid(recordId) || !isPostSaleKind(kind) || (phase !== "opened" && phase !== "confirmed")) {
    return { ok: false, error: "Ação inválida." };
  }

  // Estado vem sempre do banco, nunca do navegador.
  const record = await getFulfillmentRecord(recordId);
  if (!record) return { ok: false, error: "Registro não encontrado." };

  const events = await listPostSaleEvents(recordId);
  const state = derivePostSaleState(events, kind).state;
  const availability = postSaleAvailability({
    deliveryStatus: record.delivery_status,
    carrier: record.carrier,
    trackingCode: record.tracking_code,
  })[kind];

  const plan = planPostSaleEvent({ kind, phase, availability, state });
  if (!plan.ok) return { ok: false, error: plan.error };

  const written = await insertPostSaleAudit({ recordId, action: plan.action, actorId: admin.id });
  if (!written.ok) return written;

  revalidatePath(`/admin/faturamento-envios/${recordId}`);
  return { ok: true };
}
