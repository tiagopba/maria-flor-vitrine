import "server-only";
import type { DeliveryState } from "@/lib/fulfillment/delivery-update";
import { isPendingTracking, type DeliveryStatus } from "@/lib/fulfillment/delivery";
import { displayGroupFor, sortRecordsForListing, todayIsoInStoreTimeZone } from "@/lib/fulfillment/delivery-priority";
import { FILTER_NONE, shouldIncludeGroup, type FulfillmentListFilters } from "@/lib/fulfillment/filters";
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
  | "notes"
> & {
  /** Pelo menos 1 follow-up OPEN — decide o grupo DELIVERED × POST_SALE_PENDING (delivery-priority.ts). */
  hasOpenFollowup: boolean;
};

const LIST_COLUMNS =
  "id, customer_name, customer_cpf, nfe_number, invoice_total, carrier, shipping_service, tracking_code, created_at, sale_date, seller_id, sales_origin, expected_delivery_date, delivered_at, delivery_status, record_source, notes";

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

  const searchFilter = filters.query ? buildSearchFilter(filters.query) : null;

  // Pendência de follow-up: calculada numa tabela pequena (3 linhas por registro), não
  // na busca principal — o volume de pedidos não chega lá. Sempre buscado (não só
  // quando o filtro de follow-up está ativo): também decide o grupo de apresentação
  // DELIVERED × POST_SALE_PENDING (ver delivery-priority.ts), então precisa valer
  // pra toda a listagem, não só pro filtro "Com pendência".
  const openFollowupIds = await listRecordIdsWithOpenFollowups();
  let followupIdFilter: string[] | null = null;
  if (filters.followup === "pending") {
    const pendingIds = [...openFollowupIds];
    if (pendingIds.length === 0) return { status: "ok", records: [], hasMore: false };
    followupIdFilter = pendingIds;
  }

  // Busca o conjunto inteiro que bate com os filtros de banco (teto de
  // fetchAllPages: 1000 páginas de 1000 = 1 milhão de linhas, muito além do
  // volume real) — a ordenação por urgência (EM_ATRASO primeiro etc.) e a
  // paginação acontecem em memória logo abaixo, porque dependem de "hoje" e
  // não só de colunas do banco.
  let rows: Omit<FulfillmentListItem, "hasOpenFollowup">[];
  try {
    rows = await fetchAllPages<Omit<FulfillmentListItem, "hasOpenFollowup">>(async (from, to) => {
      let query = supabase.from("fulfillment_records").select(LIST_COLUMNS).order("id").range(from, to);
      if (searchFilter) query = query.or(searchFilter);
      if (filters.saleFrom) query = query.gte("sale_date", filters.saleFrom);
      if (filters.saleTo) query = query.lte("sale_date", filters.saleTo);
      if (filters.carrier) query = query.eq("carrier", filters.carrier);
      if (filters.status) query = query.eq("delivery_status", filters.status);
      if (filters.state) query = query.eq("state", filters.state);
      if (filters.seller === FILTER_NONE) query = query.is("seller_id", null);
      else if (filters.seller) query = query.eq("seller_id", filters.seller);
      if (filters.origin === FILTER_NONE) query = query.is("sales_origin", null);
      else if (filters.origin) query = query.eq("sales_origin", filters.origin);
      if (filters.followup === "pending" && followupIdFilter) query = query.in("id", followupIdFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    });
  } catch (error) {
    if (isMissingTableError(error as { code?: string })) return { status: "unavailable" };
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (filters.followup === "completed") {
    rows = rows.filter((r) => !openFollowupIds.has(r.id));
  }

  // Precedência dos filtros de entregues (shouldIncludeGroup, pura e testada
  // em delivery-filters.test.ts): chip Entregues e status=DELIVERED sempre
  // mostram DELIVERED, nunca uma lista vazia por causa do toggle. O grupo
  // (DELIVERED × POST_SALE_PENDING) depende de follow-up real, nunca só de
  // delivery_status.
  const todayIso = todayIsoInStoreTimeZone();
  const withFollowupFlag = rows.map((r) => ({ ...r, hasOpenFollowup: openFollowupIds.has(r.id) }));
  const filteredRows = withFollowupFlag.filter((r) => shouldIncludeGroup(displayGroupFor(r, todayIso), filters));
  const sorted = sortRecordsForListing(filteredRows, todayIso);

  const from = (page - 1) * FULFILLMENT_PAGE_SIZE;
  return {
    status: "ok",
    records: sorted.slice(from, from + FULFILLMENT_PAGE_SIZE),
    hasMore: sorted.length > from + FULFILLMENT_PAGE_SIZE,
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

export interface PendingTrackingRecord {
  id: string;
  customer_name: string;
  sti3_sale_id: string | null;
  carrier: string | null;
  sale_date: string;
}

const TRACKING_NOT_BLOCKING_SEARCH = "(DELIVERED,REFUNDED,UNKNOWN)";

/**
 * Registros aprovados que ainda precisam de código de rastreio (status ativo +
 * tracking_code vazio — ver `isPendingTracking`). Usado para bloquear Nova Venda:
 * nunca inclui DELIVERED/REFUNDED/UNKNOWN, que não exigem rastreio novo.
 */
export async function listPendingTrackingRecords(): Promise<PendingTrackingRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_records")
    .select("id, customer_name, sti3_sale_id, carrier, tracking_code, delivery_status, sale_date")
    .not("delivery_status", "in", TRACKING_NOT_BLOCKING_SEARCH)
    .order("sale_date", { ascending: true });
  if (isMissingTableError(error)) return [];
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((r) => isPendingTracking(r.tracking_code, r.delivery_status))
    .map(({ id, customer_name, sti3_sale_id, carrier, sale_date }) => ({ id, customer_name, sti3_sale_id, carrier, sale_date }));
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

/**
 * SALVAR RASTREAMENTO: grava `tracking_code` + `carrier` e, só quando
 * `deliveryStatus` vier informado (decisão de `shouldAutoSetInTransit`, em
 * `saveTrackingAction`), também `delivery_status` — tudo na mesma operação.
 * Fora isso, nunca toca em mais nada da venda (preencher o rastreio não
 * significa por padrão que a transportadora já coletou).
 */
export async function saveTrackingInfo(
  id: string,
  input: { trackingCode: string; carrier: string; deliveryStatus?: DeliveryStatus }
): Promise<void> {
  const supabase = await createClient();
  const update: { tracking_code: string; carrier: string; delivery_status?: DeliveryStatus } = {
    tracking_code: input.trackingCode,
    carrier: input.carrier,
  };
  if (input.deliveryStatus) update.delivery_status = input.deliveryStatus;
  const { data, error } = await supabase.from("fulfillment_records").update(update).eq("id", id).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Não foi possível salvar o rastreamento.");
}
