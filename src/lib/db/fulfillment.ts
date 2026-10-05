import "server-only";
import { buildDateFilter, buildSearchFilter } from "@/lib/fulfillment/search";
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
>;

const LIST_COLUMNS =
  "id, customer_name, customer_cpf, nfe_number, invoice_total, carrier, shipping_service, tracking_code, created_at";

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

export interface ListFulfillmentFilters {
  query?: string;
  /** aaaa-mm-dd */
  date?: string;
  /** Começa em 1. */
  page?: number;
}

export type ListFulfillmentResult =
  | { status: "ok"; records: FulfillmentListItem[]; hasMore: boolean }
  | { status: "unavailable" };

export async function listFulfillmentRecords(filters: ListFulfillmentFilters): Promise<ListFulfillmentResult> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * FULFILLMENT_PAGE_SIZE;

  let query = supabase
    .from("fulfillment_records")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    // +1 só para saber se existe próxima página, sem count exato.
    .range(from, from + FULFILLMENT_PAGE_SIZE);

  const searchFilter = filters.query ? buildSearchFilter(filters.query) : null;
  if (searchFilter) query = query.or(searchFilter);

  const dateFilter = filters.date ? buildDateFilter(filters.date) : null;
  if (dateFilter) query = query.or(dateFilter);

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
  details?: Record<string, string | number | boolean>;
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
