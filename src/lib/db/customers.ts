import "server-only";
import { createClient } from "@/lib/supabase/server";
import { maskCpfCnpj } from "@/lib/fulfillment/text";
import { isCustomerReviewStatus, type CustomerReviewStatus } from "@/lib/fulfillment/customer-review";

// Tudo aqui usa o client da PRÓPRIA sessão (anon key + cookies) — a RLS
// (is_admin(), já criada nas migrations de customers/customer_review_*)
// decide o acesso, nunca a service role. CPF só sai mascarado
// (maskCpfCnpj) — nunca os dígitos completos voltam pra UI por aqui.

export interface CustomerSummary {
  id: string;
  displayName: string;
  cpfMasked: string;
}

export interface CustomerSaleSummary {
  id: string;
  saleDate: string;
  /** Nome gravado NAQUELA venda — pode diferir do nome atual da cliente (nunca reescrito). */
  customerName: string;
  deliveryStatus: string;
  followups: { type: string; status: string }[];
}

export interface CustomerReviewEvent {
  action: string;
  createdAt: string;
  saleId: string | null;
  actorName: string | null;
}

export interface CustomerHistory {
  customer: CustomerSummary;
  totalPurchases: number;
  sales: CustomerSaleSummary[];
  reviewStatus: CustomerReviewStatus;
  reviewEvents: CustomerReviewEvent[];
}

/**
 * Histórico completo de UMA cliente: compras, follow-up de cada venda,
 * situação global de avaliação e o histórico de solicitações/alterações.
 * `null` = cliente não encontrada (id inválido ou RLS recusou).
 */
export async function getCustomerHistory(customerId: string): Promise<CustomerHistory | null> {
  const supabase = await createClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, display_name, cpf_digits")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer) return null;

  const [salesResult, reviewStatusResult, eventsResult] = await Promise.all([
    supabase
      .from("fulfillment_records")
      .select("id, sale_date, customer_name, delivery_status")
      .eq("customer_id", customerId)
      .order("sale_date", { ascending: false }),
    supabase.from("customer_review_status").select("status").eq("customer_id", customerId).maybeSingle(),
    supabase
      .from("customer_review_events")
      .select("action, created_at, sale_id, actor_id")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
  ]);
  if (salesResult.error) throw new Error(salesResult.error.message);
  if (reviewStatusResult.error) throw new Error(reviewStatusResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);

  const sales = salesResult.data ?? [];
  const saleIds = sales.map((s) => s.id);

  const followupsResult =
    saleIds.length > 0
      ? await supabase.from("fulfillment_followups").select("record_id, type, status").in("record_id", saleIds)
      : { data: [] as { record_id: string; type: string; status: string }[], error: null };
  if (followupsResult.error) throw new Error(followupsResult.error.message);

  const followupsByRecord = new Map<string, { type: string; status: string }[]>();
  for (const f of followupsResult.data ?? []) {
    const list = followupsByRecord.get(f.record_id) ?? [];
    list.push({ type: f.type, status: f.status });
    followupsByRecord.set(f.record_id, list);
  }

  const events = eventsResult.data ?? [];
  const actorIds = [...new Set(events.map((e) => e.actor_id).filter((id): id is string => Boolean(id)))];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, name").in("id", actorIds);
    if (profilesError) throw new Error(profilesError.message);
    for (const p of profiles ?? []) actorNames.set(p.id, p.name);
  }

  const reviewStatusRaw = reviewStatusResult.data?.status;

  return {
    customer: {
      id: customer.id,
      displayName: customer.display_name,
      cpfMasked: maskCpfCnpj(customer.cpf_digits),
    },
    totalPurchases: sales.length,
    sales: sales.map((s) => ({
      id: s.id,
      saleDate: s.sale_date,
      customerName: s.customer_name,
      deliveryStatus: s.delivery_status,
      followups: followupsByRecord.get(s.id) ?? [],
    })),
    // NEVER_ASKED por padrão: só deveria faltar se a cliente foi criada fora
    // do backfill/trigger (não deveria acontecer), nunca inventa REVIEWED.
    reviewStatus: isCustomerReviewStatus(reviewStatusRaw) ? reviewStatusRaw : "NEVER_ASKED",
    reviewEvents: events.map((e) => ({
      action: e.action,
      createdAt: e.created_at,
      saleId: e.sale_id,
      actorName: e.actor_id ? (actorNames.get(e.actor_id) ?? null) : null,
    })),
  };
}

/** customer_id de UMA venda, ou null quando a venda não tem CPF confiável vinculado. */
export async function getCustomerIdForRecord(recordId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fulfillment_records").select("customer_id").eq("id", recordId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.customer_id ?? null;
}

export type SetReviewOutcomeResult = { ok: true } | { ok: false; error: string };

/**
 * Marca o RESULTADO de uma avaliação — SEMPRE uma ação humana explícita
 * (Admin/Master confirmando na tela). Nunca chamado automaticamente por
 * nenhum trigger ou fluxo deste módulo — é a ÚNICA forma de uma cliente
 * virar REVIEWED no banco (ver set_customer_review_outcome, migration
 * 20261116120000). `saleId` é opcional: a venda que motivou a marcação,
 * quando fizer sentido guardar (nunca obrigatória).
 */
export async function setCustomerReviewOutcome(input: {
  customerId: string;
  outcome: "REVIEWED" | "DISMISSED" | "DOES_NOT_WANT";
  saleId?: string | null;
}): Promise<SetReviewOutcomeResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_customer_review_outcome", {
    p_customer_id: input.customerId,
    p_outcome: input.outcome,
    p_sale_id: input.saleId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Situação global de avaliação de UM customer_id — null = cliente não encontrada. */
export async function getCustomerReviewStatus(customerId: string): Promise<CustomerReviewStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_review_status")
    .select("status")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return isCustomerReviewStatus(data.status) ? data.status : null;
}
