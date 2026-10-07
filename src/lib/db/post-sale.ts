import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  FOLLOWUP_TYPE_BY_KIND,
  POST_SALE_AUDIT_ACTIONS,
  type FollowupRow,
  type FollowupType,
  type OpenedEvent,
  type PostSaleAction,
  type PostSaleKind,
} from "@/lib/fulfillment/post-sale";

/** Eventos "abri o WhatsApp" de UM registro, com o nome de quem registrou. Só metadados: ação, data e ator. */
export async function listPostSaleEvents(recordId: string): Promise<(OpenedEvent & { action: string })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_audit_logs")
    .select("action, created_at, actor_id")
    .eq("record_id", recordId)
    .in("action", [...POST_SALE_AUDIT_ACTIONS])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const actorIds = [...new Set((data ?? []).map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, name").in("id", actorIds);
    if (profilesError) throw new Error(profilesError.message);
    for (const p of profiles ?? []) names.set(p.id, p.name);
  }

  return (data ?? []).map((row) => ({
    action: row.action,
    created_at: row.created_at,
    actor_name: row.actor_id ? (names.get(row.actor_id) ?? null) : null,
  }));
}

/**
 * Grava UM evento "abri o WhatsApp". `details` fica vazio de propósito: nada de telefone,
 * CPF, endereço ou texto da mensagem. Devolve erro (sem lançar) para a UI não abrir
 * o WhatsApp quando o registro falhou.
 */
export async function insertPostSaleAudit(input: {
  recordId: string;
  action: PostSaleAction;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("fulfillment_audit_logs").insert({
    record_id: input.recordId,
    action: input.action,
    actor_id: input.actorId,
    details: {},
  });
  if (error) return { ok: false, error: "Não foi possível registrar a ação. O WhatsApp não foi aberto." };
  return { ok: true };
}

const FOLLOWUP_SELECT = "type, status, sent_at, sent_by, message_snapshot";

/** Os até 3 follow-ups de UM registro, com o nome de quem confirmou cada um. */
export async function listFollowups(recordId: string): Promise<FollowupRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fulfillment_followups").select(FOLLOWUP_SELECT).eq("record_id", recordId);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const senderIds = [...new Set(rows.map((r) => r.sent_by).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, name").in("id", senderIds);
    if (profilesError) throw new Error(profilesError.message);
    for (const p of profiles ?? []) names.set(p.id, p.name);
  }

  return rows.map((r) => ({
    type: r.type,
    status: r.status,
    sent_at: r.sent_at,
    sent_by_name: r.sent_by ? (names.get(r.sent_by) ?? null) : null,
    message_snapshot: r.message_snapshot,
  }));
}

export type ConfirmFollowupResult = { ok: true; written: boolean } | { ok: false; error: string };

/**
 * CONFIRMAR QUE ENVIEI: só grava se o follow-up ainda estiver OPEN — a condição
 * `.eq("status", "OPEN")` no UPDATE garante que um duplo clique nunca duplica nem
 * sobrescreve uma confirmação já feita. `written: false` diz a quem chamou que
 * esta chamada não gravou nada (já estava SENT) — assim a auditoria não duplica a linha.
 */
export async function confirmFollowupSent(input: {
  recordId: string;
  kind: PostSaleKind;
  actorId: string;
  messageSnapshot: string;
}): Promise<ConfirmFollowupResult> {
  const supabase = await createClient();
  const type: FollowupType = FOLLOWUP_TYPE_BY_KIND[input.kind];

  const { data: updated, error } = await supabase
    .from("fulfillment_followups")
    .update({ status: "SENT", sent_at: new Date().toISOString(), sent_by: input.actorId, message_snapshot: input.messageSnapshot })
    .eq("record_id", input.recordId)
    .eq("type", type)
    .eq("status", "OPEN")
    .select("id");
  if (error) return { ok: false, error: "Não foi possível confirmar o envio." };
  if ((updated ?? []).length === 1) return { ok: true, written: true };

  // Nenhuma linha afetada: ou já estava SENT (clique duplicado — sucesso idempotente),
  // ou a linha não existe (registro sem follow-ups, o que não deveria acontecer).
  const { data: current, error: readError } = await supabase
    .from("fulfillment_followups")
    .select("status")
    .eq("record_id", input.recordId)
    .eq("type", type)
    .maybeSingle();
  if (readError) return { ok: false, error: "Não foi possível confirmar o envio." };
  if (current?.status === "SENT") return { ok: true, written: false };
  return { ok: false, error: "Follow-up não encontrado para este registro." };
}
