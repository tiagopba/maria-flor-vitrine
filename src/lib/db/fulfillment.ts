import "server-only";
import type { DeliveryState } from "@/lib/fulfillment/delivery-update";
import { isPendingTracking, type DeliveryStatus } from "@/lib/fulfillment/delivery";
import { displayGroupFor, sortRecordsForListing, todayIsoInStoreTimeZone } from "@/lib/fulfillment/delivery-priority";
import { FILTER_NONE, shouldIncludeGroup, type FulfillmentListFilters } from "@/lib/fulfillment/filters";
import { buildSearchFilter } from "@/lib/fulfillment/search";
import { collectFilterOptions, fetchAllPages } from "@/lib/fulfillment/paginate";
import { listSellersAdmin } from "@/lib/db/sellers";
import type { FulfillmentRecordFields } from "@/lib/fulfillment/schema";
import { isCustomerReviewStatus, reviewRowState, type CustomerReviewStatus, type ReviewRowState } from "@/lib/fulfillment/customer-review";
import { computeFulfillmentIndicators, type FulfillmentIndicators } from "@/lib/fulfillment/listing-indicators";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// Tudo aqui usa o client da PRÓPRIA sessão (anon key + cookies): quem decide
// o que passa é a RLS (is_admin()), nunca a service role. Dados pessoais —
// nada deste arquivo pode ir para analytics, Pixel/CAPI ou logs.

export type FulfillmentRecord = Database["public"]["Tables"]["fulfillment_records"]["Row"];
export type FulfillmentAuditAction = Database["public"]["Tables"]["fulfillment_audit_logs"]["Row"]["action"];

export const FULFILLMENT_BUCKET = "fulfillment-documents";
export const FULFILLMENT_PAGE_SIZE = 25;

/** Situação de avaliação de UMA venda — segue o follow-up GOOGLE_REVIEW desta venda
 * JUNTO do estado GLOBAL da cliente (ver reviewRowState, lib/fulfillment/customer-review.ts). */
export interface ReviewColumnData {
  followupStatus: "OPEN" | "SENT";
  globalStatus: CustomerReviewStatus | null;
  rowState: ReviewRowState;
}

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
  | "customer_id"
> & {
  /** Pelo menos 1 follow-up OPEN que conta como pendência real — decide o grupo
   * DELIVERED × POST_SALE_PENDING (delivery-priority.ts). Inclui SHIPPING_NOTICE/
   * DELIVERY_CONFIRMATION sempre, e GOOGLE_REVIEW só quando `reviewColumn.rowState`
   * for "AVAILABLE" (nunca um GOOGLE_REVIEW OPEN já bloqueado pelo estado global). */
  hasOpenFollowup: boolean;
  /** null = migration da Fase 3 (customers/avaliação) ainda não aplicada neste banco. */
  reviewColumn: ReviewColumnData | null;
};

const LIST_COLUMNS =
  "id, customer_name, customer_cpf, nfe_number, invoice_total, carrier, shipping_service, tracking_code, created_at, sale_date, seller_id, sales_origin, expected_delivery_date, delivered_at, delivery_status, record_source, notes, customer_id";

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
  | { status: "ok"; records: FulfillmentListItem[]; hasMore: boolean; indicators: FulfillmentIndicators }
  | { status: "unavailable" };

const SHIPPING_DELIVERY_TYPES = ["SHIPPING_NOTICE", "DELIVERY_CONFIRMATION"] as const;

export async function listFulfillmentRecords(filters: FulfillmentListFilters): Promise<ListFulfillmentResult> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page);

  const searchFilter = filters.query ? buildSearchFilter(filters.query) : null;

  // Busca o conjunto inteiro que bate com os filtros de banco (teto de
  // fetchAllPages: 1000 páginas de 1000 = 1 milhão de linhas, muito além do
  // volume real) — a ordenação por urgência (EM_ATRASO primeiro etc.), o
  // filtro de follow-up e a paginação acontecem em memória logo abaixo,
  // porque dependem de "hoje" e de dados de outras tabelas pequenas
  // (follow-ups, avaliação), não só de colunas do banco.
  let rows: Omit<FulfillmentListItem, "hasOpenFollowup" | "reviewColumn">[];
  try {
    rows = await fetchAllPages<Omit<FulfillmentListItem, "hasOpenFollowup" | "reviewColumn">>(async (from, to) => {
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
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    });
  } catch (error) {
    if (isMissingTableError(error as { code?: string })) return { status: "unavailable" };
    throw error instanceof Error ? error : new Error(String(error));
  }

  // Pendência de follow-up — tabelas pequenas (poucas linhas por registro), não na
  // busca principal: o volume de pedidos não chega lá. Escopado às linhas já
  // filtradas acima (nunca a tabela inteira). SHIPPING_NOTICE/DELIVERY_CONFIRMATION
  // sempre contam; GOOGLE_REVIEW só conta como pendência real quando `rowState` for
  // "AVAILABLE" — nunca um GOOGLE_REVIEW OPEN já bloqueado pelo estado GLOBAL da
  // cliente (pedido explícito da Fase 4: não apresentar avaliação bloqueada como
  // pendência aberta).
  const recordIds = rows.map((r) => r.id);
  const [shippingDeliveryOpenIds, reviewColumnByRecord] = await Promise.all([
    getShippingDeliveryOpenRecordIds(recordIds),
    getReviewColumnData(rows),
  ]);

  const todayIso = todayIsoInStoreTimeZone();
  const withFlags: FulfillmentListItem[] = rows.map((r) => {
    const reviewColumn = reviewColumnByRecord?.[r.id] ?? null;
    const hasOpenFollowup = Boolean(shippingDeliveryOpenIds?.has(r.id)) || reviewColumn?.rowState === "AVAILABLE";
    return { ...r, hasOpenFollowup, reviewColumn };
  });

  let withFollowupFilter = withFlags;
  if (filters.followup === "pending") withFollowupFilter = withFlags.filter((r) => r.hasOpenFollowup);
  if (filters.followup === "completed") withFollowupFilter = withFlags.filter((r) => !r.hasOpenFollowup);

  // Indicadores do topo da listagem (Fase 4): sobre o conjunto já filtrado pelos
  // filtros avançados (busca, datas, vendedora, origem, transportadora, status, UF,
  // follow-up) — ANTES do filtro de grupo (chip de situação / mostrarEntregues), pra
  // funcionar como visão geral estável que não some ao trocar de aba.
  const indicators = computeFulfillmentIndicators(
    withFollowupFilter.map((r) => ({
      customerId: r.customer_id,
      group: displayGroupFor(r, todayIso),
      reviewState: r.reviewColumn?.rowState ?? null,
    }))
  );

  // Precedência dos filtros de entregues (shouldIncludeGroup, pura e testada
  // em delivery-filters.test.ts): chip Entregues e status=DELIVERED sempre
  // mostram DELIVERED, nunca uma lista vazia por causa do toggle. O grupo
  // (DELIVERED × POST_SALE_PENDING) depende de follow-up real, nunca só de
  // delivery_status.
  const filteredRows = withFollowupFilter.filter((r) => shouldIncludeGroup(displayGroupFor(r, todayIso), filters));
  const sorted = sortRecordsForListing(filteredRows, todayIso);

  const from = (page - 1) * FULFILLMENT_PAGE_SIZE;
  return {
    status: "ok",
    records: sorted.slice(from, from + FULFILLMENT_PAGE_SIZE),
    hasMore: sorted.length > from + FULFILLMENT_PAGE_SIZE,
    indicators,
  };
}

/**
 * IDs (dentre `recordIds`) com SHIPPING_NOTICE ou DELIVERY_CONFIRMATION ainda OPEN —
 * GOOGLE_REVIEW nunca entra aqui (ver getReviewColumnData, que decide a pendência de
 * avaliação junto do estado global da cliente). `null` = tabela ainda não existe
 * neste banco (migration não aplicada).
 */
async function getShippingDeliveryOpenRecordIds(recordIds: readonly string[]): Promise<Set<string> | null> {
  if (recordIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_followups")
    .select("record_id")
    .eq("status", "OPEN")
    .in("type", SHIPPING_DELIVERY_TYPES)
    .in("record_id", recordIds as string[]);
  if (isMissingTableError(error)) return null;
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.record_id));
}

/**
 * Situação de avaliação (GOOGLE_REVIEW) de cada registro em `rows` — follow-up DESTA
 * venda + estado GLOBAL da cliente (reviewRowState, lib/fulfillment/customer-review.ts).
 * `rows` já traz `customer_id` (da query principal), então não busca
 * fulfillment_records de novo. `null` = fulfillment_followups ainda não existe neste
 * banco. Se só customer_review_status/customers ainda não existir (Fase 2/3 não
 * aplicada), degrada sozinho: globalStatus fica null para todo mundo e
 * reviewRowState cai no comportamento de antes (só o follow-up decide) — nunca quebra.
 */
async function getReviewColumnData(
  rows: readonly { id: string; customer_id: string | null }[]
): Promise<Record<string, ReviewColumnData> | null> {
  if (rows.length === 0) return {};
  const supabase = await createClient();
  const recordIds = rows.map((r) => r.id);

  const { data: followupRows, error: followupError } = await supabase
    .from("fulfillment_followups")
    .select("record_id, status")
    .eq("type", "GOOGLE_REVIEW")
    .in("record_id", recordIds);
  if (isMissingTableError(followupError)) return null;
  if (followupError) throw new Error(followupError.message);

  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter((id): id is string => Boolean(id)))];
  const globalByCustomer = new Map<string, CustomerReviewStatus>();
  if (customerIds.length > 0) {
    const { data: statusRows, error: statusError } = await supabase
      .from("customer_review_status")
      .select("customer_id, status")
      .in("customer_id", customerIds);
    if (statusError && !isMissingTableError(statusError)) throw new Error(statusError.message);
    for (const row of statusRows ?? []) {
      if (isCustomerReviewStatus(row.status)) globalByCustomer.set(row.customer_id, row.status);
    }
  }

  const customerByRecord = new Map(rows.map((r) => [r.id, r.customer_id]));
  const result: Record<string, ReviewColumnData> = {};
  for (const fr of followupRows ?? []) {
    const customerId = customerByRecord.get(fr.record_id) ?? null;
    const globalStatus = customerId ? globalByCustomer.get(customerId) ?? null : null;
    const followupStatus = fr.status as "OPEN" | "SENT";
    result[fr.record_id] = { followupStatus, globalStatus, rowState: reviewRowState(followupStatus, globalStatus) };
  }
  return result;
}

/**
 * Quantos follow-ups de ENVIO/RECEBIMENTO (nunca avaliação, que tem coluna própria —
 * ver ReviewColumnData) ainda estão OPEN, por registro — para o badge "N em aberto" na
 * listagem. `null` quando a migration ainda não foi aplicada (tabela não existe): a UI
 * deve mostrar "—", nunca "Concluídos" por falta de dado.
 */
export async function getShippingDeliveryOpenCounts(recordIds: readonly string[]): Promise<Record<string, number> | null> {
  if (recordIds.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_followups")
    .select("record_id")
    .eq("status", "OPEN")
    .in("type", SHIPPING_DELIVERY_TYPES)
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

/**
 * A vendedora existe (ativa OU inativa)? Usada em EDITAR DADOS DA VENDA: um registro
 * já aprovado pode ser corrigido para uma vendedora inativa, do mesmo jeito que um
 * registro histórico já mostra o nome de uma vendedora inativa normalmente.
 */
export async function sellerExists(sellerId: string): Promise<boolean> {
  if (!isUuid(sellerId)) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("sellers").select("id").eq("id", sellerId).maybeSingle();
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
 * EDITAR DADOS DA VENDA (pós-aprovação): só vendedora, data e origem — nunca
 * `sale_total`, que não existe nem no tipo de entrada (sale-details.ts).
 */
export async function updateFulfillmentSaleDetails(
  id: string,
  update: { sale_date?: string; seller_id?: string | null; sales_origin?: string | null }
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fulfillment_records").update(update).eq("id", id).select("id").maybeSingle();
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
