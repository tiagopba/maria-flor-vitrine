import "server-only";
import { createClient } from "@/lib/supabase/server";
import { POST_SALE_AUDIT_ACTIONS, type PostSaleAction, type PostSaleEvent } from "@/lib/fulfillment/post-sale";

/** Eventos de pós-venda de UM registro, com o nome de quem registrou. Só metadados: ação, data e ator. */
export async function listPostSaleEvents(recordId: string): Promise<PostSaleEvent[]> {
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
 * Grava UM evento de pós-venda. `details` fica vazio de propósito: nada de telefone,
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
