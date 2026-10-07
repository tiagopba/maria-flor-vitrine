"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { getFulfillmentRecord, isUuid } from "@/lib/db/fulfillment";
import { confirmFollowupSent, insertPostSaleAudit, listFollowups, listPostSaleEvents } from "@/lib/db/post-sale";
import {
  FOLLOWUP_TYPE_BY_KIND,
  POST_SALE_ACTIONS,
  buildDeliveryConfirmationMessage,
  buildGoogleReviewMessage,
  buildShippingNoticeMessage,
  derivePostSaleState,
  isPostSaleKind,
  planPostSaleEvent,
  postSaleAvailability,
  type PostSaleKind,
  type PostSalePhase,
} from "@/lib/fulfillment/post-sale";

export type PostSaleResult = { ok: true } | { ok: false; error: string };

function buildMessage(kind: PostSaleKind, record: Awaited<ReturnType<typeof getFulfillmentRecord>>): string | null {
  if (!record) return null;
  if (kind === "tracking") {
    return buildShippingNoticeMessage({
      customerName: record.customer_name,
      carrier: record.carrier,
      service: record.shipping_service,
      trackingCode: record.tracking_code,
    });
  }
  if (kind === "delivery") return buildDeliveryConfirmationMessage(record.customer_name);
  return buildGoogleReviewMessage(record.customer_name);
}

/**
 * Registra UM clique de pós-venda.
 *  - "opened": só audita que o WhatsApp foi aberto (nunca muda o status do follow-up).
 *  - "confirmed": grava o follow-up como ENVIADO — status, data, quem confirmou e o
 *    texto EXATO confirmado nesse momento (message_snapshot). Nunca automático.
 * A regra (liberação, exigir abertura antes de confirmar) fica em planPostSaleEvent;
 * aqui só se lê o estado real do banco e se grava.
 */
export async function registerPostSaleEvent(recordId: string, kind: string, phase: PostSalePhase): Promise<PostSaleResult> {
  const admin = await requireAdmin(["admin", "master"]);
  if (!isUuid(recordId) || !isPostSaleKind(kind) || (phase !== "opened" && phase !== "confirmed")) {
    return { ok: false, error: "Ação inválida." };
  }

  // Estado vem sempre do banco, nunca do navegador.
  const record = await getFulfillmentRecord(recordId);
  if (!record) return { ok: false, error: "Registro não encontrado." };

  const [events, followups] = await Promise.all([listPostSaleEvents(recordId), listFollowups(recordId)]);
  const type = FOLLOWUP_TYPE_BY_KIND[kind];
  const followup = followups.find((f) => f.type === type) ?? { type, status: "OPEN" as const, sent_at: null, sent_by_name: null, message_snapshot: null };
  const openedEvents = events.filter((e) => e.action === POST_SALE_ACTIONS[kind].opened);
  const state = derivePostSaleState(followup, openedEvents);

  const availability = postSaleAvailability({
    deliveryStatus: record.delivery_status,
    carrier: record.carrier,
    trackingCode: record.tracking_code,
  })[kind];

  const plan = planPostSaleEvent({ kind, phase, availability, state });
  if (!plan.ok) return { ok: false, error: plan.error };

  if (phase === "confirmed") {
    const message = buildMessage(kind, record);
    if (!message) return { ok: false, error: "Não foi possível montar a mensagem para confirmar." };
    const result = await confirmFollowupSent({ recordId, kind, actorId: admin.id, messageSnapshot: message });
    if (!result.ok) return result;
    // Clique duplicado (já estava SENT): não duplica a linha de auditoria.
    if (!result.written) return { ok: true };
  }

  // Sempre audita a ação (opened OU a primeira confirmed): histórico de quem abriu/confirmou e quando.
  const written = await insertPostSaleAudit({ recordId, action: plan.action, actorId: admin.id });
  if (!written.ok) return written;

  revalidatePath(`/admin/faturamento-envios/${recordId}`);
  revalidatePath("/admin/faturamento-envios");
  return { ok: true };
}
