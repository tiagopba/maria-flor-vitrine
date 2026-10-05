import "server-only";
import type { DeliveryState } from "@/lib/fulfillment/delivery-update";
import { FILTER_NONE, type FulfillmentListFilters } from "@/lib/fulfillment/filters";
import { buildSearchFilter } from "@/lib/fulfillment/search";
import { listSellersAdmin } from "@/lib/db/sellers";
import type { FulfillmentRecordFields } from "@/lib/fulfillment/schema";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// Tudo aqui usa o client da PRÓPRIA sessão (anon key + cookies): quem decide
// o que passa é a RLS (is_admin()), nunca a service role. Dados pessoais —
// nada deste arquivo pode ir para analytics, Pixel/CAPI ou logs.

export type FulfillmentRecord = Database["public"]["Tables"]["fulfillment_records"]["Row"];
export type FulfillmentAuditAction = Database["public"]["Tables"]["fulfillment_audit_logs"]["Row"]["action"];

export const FULFILLMENT_BUCKET = "fulfillment-documents";
export const FULFILLMENT_PAGE_SIZE = 25;

export type FulfillmentListItem = Pick<
  FulfillmentRecord,
  | "id"
  | "customer_name"
  | "customer_cpf"
  | "nfe_number"
  | "invoice_total"
  | "carrier"
  | "shipping_service"
  | "tracking_code"
  | "created_at"
  | "sale_date"
  | "seller_id"
  | "sales_origin"
  | "expected_delivery_date"
  | "delivered_at"
  | "delivery_status"
>;

const LIST_COLUMNS =
  "id, customer_name, customer_cpf, nfe_number, invoice_total, carrier, shipping_service, tracking_code, created_at, sale_date, seller_id, sales_origin, expected_delivery_date, delivered_at, delivery_status";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function documentPath(recordId: string, kind: "danfe" | "label"): string {
  return `${recordId}/${kind}.pdf`;
}

/** Erro "tabela não existe" do PostgREST (migration ainda não aplicada neste banco). */
export function isMissingTableError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

export type ListFulfillmentResult =
  | { status: "ok"; records: FulfillmentListItem[]; hasMore: boolean }
  | { status: "unavailable" };

export async function listFulfillmentRecords(filters: FulfillmentListFilters): Promise<ListFulfillmentResult> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page);
  const from = (page - 1) * FULFILLMENT_PAGE_SIZE;

  let query = supabase
    .from("fulfillment_records")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    // +1 só para saber se existe próxima página, sem count exato.
    .range(from, from + FULFILLMENT_PAGE_SIZE);

  const searchFilter = filters.query ? buildSearchFilter(filters.query) : null;
  if (searchFilter) query = query.or(searchFilter);

  // Os valores abaixo já vêm sanitizados por parseListFilters; o builder do
  // supabase-js codifica cada um na URL, então não há injeção de filtro.
  if (filters.saleFrom) query = query.gte("sale_date", filters.saleFrom);
  if (filters.saleTo) query = query.lte("sale_date", filters.saleTo);
  if (filters.carrier) query = query.eq("carrier", filters.carrier);
  if (filters.status) query = query.eq("delivery_status", filters.status);
  if (filters.state) query = query.eq("state", filters.state);

  // Vendedora e origem são filtros independentes.
  if (filters.seller === FILTER_NONE) query = query.is("seller_id", null);
  else if (filters.seller) query = query.eq("seller_id", filters.seller);

  if (filters.origin === FILTER_NONE) query = query.is("sales_origin", null);
  else if (filters.origin) query = query.eq("sales_origin", filters.origin);

  const { data, error } = await query;
  if (isMissingTableError(error)) return { status: "unavailable" };
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  return {
    status: "ok",
    records: rows.slice(0, FULFILLMENT_PAGE_SIZE),
    hasMore: rows.length > FULFILLMENT_PAGE_SIZE,
  };
}

export async function getFulfillmentRecord(id: string): Promise<FulfillmentRecord | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("fulfillment_records").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Registros já salvos com a mesma NF-e (chave, ou número + série) — aviso de duplicidade na revisão. */
export async function findDuplicateRecords(input: {
  nfeKey: string | null;
  nfeNumber: string | null;
  nfeSeries: string | null;
}): Promise<{ id: string; created_at: string }[]> {
  const supabase = await createClient();

  let query = supabase.from("fulfillment_records").select("id, created_at").limit(5);
  if (input.nfeKey) {
    query = query.eq("nfe_key", input.nfeKey);
  } else if (input.nfeNumber && input.nfeSeries) {
    query = query.eq("nfe_number", input.nfeNumber).eq("nfe_series", input.nfeSeries);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (isMissingTableError(error)) return [];
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Sobe os dois PDFs e grava o registro. Se qualquer passo falhar, remove o
 * que já tinha sido enviado — nunca deixa arquivo órfão de um registro que
 * não existe.
 */
export async function createFulfillmentRecord(input: {
  id: string;
  fields: FulfillmentRecordFields;
  danfe: Uint8Array;
  label: Uint8Array;
  actorId: string;
}): Promise<void> {
  const supabase = await createClient();
  const danfePath = documentPath(input.id, "danfe");
  const labelPath = documentPath(input.id, "label");
  const uploaded: string[] = [];

  const cleanup = async () => {
    if (uploaded.length > 0) await supabase.storage.from(FULFILLMENT_BUCKET).remove(uploaded);
  };

  for (const [path, bytes] of [
    [danfePath, input.danfe],
    [labelPath, input.label],
  ] as const) {
    const { error } = await supabase.storage
      .from(FULFILLMENT_BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (error) {
      await cleanup();
      throw new Error(`Não foi possível enviar o PDF: ${error.message}`);
    }
    uploaded.push(path);
  }

  const { error } = await supabase.from("fulfillment_records").insert({
    id: input.id,
    ...input.fields,
    danfe_file_path: danfePath,
    label_file_path: labelPath,
    created_by: input.actorId,
  });
  if (error) {
    await cleanup();
    throw new Error(error.message);
  }
}

export async function downloadFulfillmentDocument(path: string): Promise<ArrayBuffer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(FULFILLMENT_BUCKET).download(path);
  if (error || !data) return null;
  return data.arrayBuffer();
}

/** Registra um evento na trilha de auditoria. `details` só aceita metadados — nunca CPF/nome/endereço. */
export async function logFulfillmentAudit(input: {
  recordId: string;
  action: FulfillmentAuditAction;
  actorId: string;
  details?: Record<string, string | number | boolean | string[]>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fulfillment_audit_logs").insert({
    record_id: input.recordId,
    action: input.action,
    actor_id: input.actorId,
    details: input.details ?? {},
  });
  // Auditoria não pode derrubar a operação principal já concluída; só sinaliza.
  if (error) console.error("[fulfillment] falha ao registrar auditoria:", error.code);
}

export interface FulfillmentFilterOptions {
  sellers: { id: string; name: string; active: boolean }[];
  origins: string[];
  carriers: string[];
}

/** Opções dos selects de filtro: vendedoras cadastradas + origens/transportadoras já usadas nos registros. */
export async function getFulfillmentFilterOptions(): Promise<FulfillmentFilterOptions> {
  const supabase = await createClient();
  const [sellers, used] = await Promise.all([
    listSellersAdmin(),
    supabase.from("fulfillment_records").select("sales_origin, carrier").limit(1000),
  ]);

  const origins = new Set<string>();
  const carriers = new Set<string>();
  for (const row of used.data ?? []) {
    if (row.sales_origin) origins.add(row.sales_origin);
    if (row.carrier) carriers.add(row.carrier);
  }

  return {
    sellers: sellers.map((s) => ({ id: s.id, name: s.name, active: s.active })),
    origins: [...origins].sort(),
    carriers: [...carriers].sort(),
  };
}

/** A vendedora existe e está ATIVA? (regra de uma NOVA venda; histórico não passa por aqui.) */
export async function isActiveSeller(sellerId: string): Promise<boolean> {
  if (!isUuid(sellerId)) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("sellers").select("id").eq("id", sellerId).eq("active", true).maybeSingle();
  return Boolean(data);
}

export async function getSellerName(sellerId: string | null): Promise<string | null> {
  if (!sellerId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("sellers").select("name").eq("id", sellerId).maybeSingle();
  return data?.name ?? null;
}

/** Aplica a atualização operacional. Falha (em vez de passar em silêncio) se a RLS/ID não afetar nenhuma linha. */
export async function updateFulfillmentDelivery(id: string, update: DeliveryState): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_records")
    .update(update)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Não foi possível atualizar o registro.");
}
