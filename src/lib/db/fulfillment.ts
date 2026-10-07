import "server-only";
import type { DeliveryState } from "@/lib/fulfillment/delivery-update";
import { FILTER_NONE, type FulfillmentListFilters } from "@/lib/fulfillment/filters";
import { buildSearchFilter } from "@/lib/fulfillment/search";
import { collectFilterOptions, fetchAllPages } from "@/lib/fulfillment/paginate";
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
  | "record_source"
>;

const LIST_COLUMNS =
  "id, customer_name, customer_cpf, nfe_number, invoice_total, carrier, shipping_service, tracking_code, created_at, sale_date, seller_id, sales_origin, expected_delivery_date, delivered_at, delivery_status, record_source";

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
    // Mais recente VENDA primeiro (importar hoje uma venda antiga não a joga para o topo);
    // `id` desempata para a paginação nunca repetir nem pular linha.
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
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

  // Pendência de follow-up: calculada numa tabela pequena (3 linhas por registro), não
  // nos filtros já paginados em blocos de 1000 — o volume de pedidos não chega lá.
  if (filters.followup === "pending" || filters.followup === "completed") {
    const pendingIds = [...(await listRecordIdsWithOpenFollowups())];
    if (filters.followup === "pending") {
      if (pendingIds.length === 0) return { status: "ok", records: [], hasMore: false };
      query = query.in("id", pendingIds);
    } else if (pendingIds.length > 0) {
      query = query.not("id", "in", `(${pendingIds.join(",")})`);
    }
  }

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

/**
 * IDs de registros com pelo menos 1 follow-up OPEN. Usado para o filtro "Com
 * pendência" e para a contagem na listagem — não para decidir nada automático.
 */
export async function listRecordIdsWithOpenFollowups(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fulfillment_followups").select("record_id").eq("status", "OPEN");
  if (isMissingTableError(error)) return new Set();
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.record_id));
}

/**
 * Quantos follow-ups ainda estão OPEN, por registro — para o badge "N em aberto" na
 * listagem. `null` quando a migration ainda não foi aplicada (tabela não existe): a UI
 * deve mostrar "—", nunca "Concluídos" por falta de dado.
 */
export async function getFollowupOpenCounts(recordIds: readonly string[]): Promise<Record<string, number> | null> {
  if (recordIds.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_followups")
    .select("record_id")
    .eq("status", "OPEN")
    .in("record_id", recordIds as string[]);
  if (isMissingTableError(error)) return null;
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.record_id] = (counts[row.record_id] ?? 0) + 1;
  return counts;
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
  // Só as colunas origem/transportadora (nenhum dado pessoal), lidas em páginas de 1000 por
  // PK: com mais de 1000 registros nenhuma opção de filtro some.
  const [sellers, usedRows] = await Promise.all([
    listSellersAdmin(),
    fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("fulfillment_records")
        .select("sales_origin, carrier")
        .or("sales_origin.not.is.null,carrier.not.is.null")
        .order("id")
        .range(from, to);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
  ]);

  const { origins, carriers } = collectFilterOptions(usedRows);

  return {
    sellers: sellers.map((s) => ({ id: s.id, name: s.name, active: s.active })),
    origins,
    carriers,
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
