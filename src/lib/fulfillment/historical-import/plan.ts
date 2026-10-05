// Planejamento da importação histórica — PURO: transforma o CSV em linhas
// válidas/rejeitadas. NUNCA grava nada e NUNCA cria vendedora.
import { isBlankRow, parseCsv } from "./csv.ts";
import type { DeliveryStatus } from "../delivery.ts";
import { normalizeForCompare } from "../text.ts";

export const BR_STATE_CODES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export interface SellerRef {
  id: string;
  name: string;
  active: boolean;
}

export type SellerCellKind = "known" | "online" | "x" | "blank" | "unrecognized" | "ambiguous";
export type DeliveryCellKind = "delivered" | "resent" | "refunded" | "unknown" | "unrecognized";

export interface ImportRecord {
  sale_date: string;
  customer_name: string;
  customer_name_search: string;
  tracking_code: string | null;
  city: string | null;
  state: string | null;
  invoice_total: number | null;
  expected_delivery_date: string | null;
  delivered_at: string | null;
  delivery_status: DeliveryStatus;
  seller_id: string | null;
  sales_origin: string | null;
  record_source: "HISTORICAL_IMPORT";
  import_batch: string;
  import_ref: string;
  // Registro histórico NÃO tem PDFs: nunca se inventa caminho.
  danfe_file_path: null;
  label_file_path: null;
}

export interface PlannedRow {
  /** Posição 1-based do registro de dados no arquivo (linhas vazias contam). */
  rowNumber: number;
  status: "valid" | "rejected" | "skipped_blank";
  record?: ImportRecord;
  reasons: string[];
  sellerKind: SellerCellKind;
  /** Texto original da célula de vendedora — usado só no relatório de revisão. */
  sellerCell: string;
  deliveryKind: DeliveryCellKind;
  /** Chave de conteúdo (data|rastreio|cliente|valor): só para AVISAR de possível duplicada, nunca para descartar. */
  fingerprint: string;
}

export interface ImportPlan {
  batchId: string;
  delimiter: string;
  totalRows: number;
  rows: PlannedRow[];
}

export type PlanResult = { ok: true; plan: ImportPlan } | { ok: false; error: string };

// ── colunas da planilha antiga (aliases normalizados) ───────────────────────────────────────
const HEADER_ALIASES: Record<string, string[]> = {
  saleDate: ["data da venda", "data venda", "venda", "data"],
  tracking: ["rastreio", "etiqueta", "codigo", "codigo de rastreio", "rastreio etiqueta", "codigo rastreio"],
  customer: ["cliente", "nome", "nome do cliente"],
  seller: ["vendedora", "vendedor", "vendedora online", "vendedora ou online"],
  city: ["cidade"],
  state: ["uf", "estado"],
  value: ["valor", "valor total", "total"],
  expected: ["previsao", "previsao de entrega", "prev entrega", "prev"],
  delivery: ["entrega", "data da entrega", "situacao", "status", "entrega situacao", "situacao entrega"],
};

const REQUIRED_FIELDS = ["saleDate", "customer"] as const;

function mapHeader(header: readonly string[]): { index: Record<string, number>; missing: string[] } {
  const normalized = header.map(normalizeForCompare);
  const index: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const found = normalized.findIndex((h) => aliases.includes(h));
    if (found >= 0) index[field] = found;
  }
  return { index, missing: REQUIRED_FIELDS.filter((f) => index[f] === undefined) };
}

// ── conversões (sem adivinhar) ────────────────────────────────────────────────────────────────
function isRealDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** dd/mm/aaaa (ou d/m/aaaa) e aaaa-mm-dd. Ano de 2 dígitos NÃO é aceito: seria adivinhar o século. */
export function parseSheetDate(raw: string): string | null {
  const value = raw.trim();
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const [d, m, y] = [Number(br[1]), Number(br[2]), Number(br[3])];
    return isRealDate(y, m, d) ? `${br[3]}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isRealDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? value : null;
  return null;
}

/** "R$ 1.139,99" · "139,99" · "139.99" → número. Vazio → null; texto inválido → NaN. */
export function parseSheetMoney(raw: string): number | null {
  const value = raw.trim().replace(/^R\$\s*/i, "");
  if (value === "") return null;
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

const TRACKING_PATTERN = /^[A-Z0-9-]{4,40}$/;

function classifyDelivery(raw: string): { kind: DeliveryCellKind; deliveredAt: string | null } {
  const value = raw.trim();
  if (value === "") return { kind: "unknown", deliveredAt: null };
  const normalized = normalizeForCompare(value);
  if (normalized === "reenviado" || normalized === "reenviada") return { kind: "resent", deliveredAt: null };
  if (normalized === "estornado" || normalized === "estornada") return { kind: "refunded", deliveredAt: null };
  const date = parseSheetDate(value);
  if (date) return { kind: "delivered", deliveredAt: date };
  return { kind: "unrecognized", deliveredAt: null };
}

const STATUS_BY_DELIVERY: Record<Exclude<DeliveryCellKind, "unrecognized">, DeliveryStatus> = {
  delivered: "DELIVERED",
  resent: "RESENT",
  refunded: "REFUNDED",
  // Planilha sem informação: "Situação não informada" — NUNCA PENDING ("Aguardando envio").
  unknown: "UNKNOWN",
};

/** Casa o nome da planilha com `sellers` pelo nome normalizado. Nunca cria vendedora. */
function classifySeller(
  raw: string,
  sellers: readonly SellerRef[]
): { kind: SellerCellKind; sellerId: string | null; origin: string | null } {
  const value = raw.trim();
  if (value === "") return { kind: "blank", sellerId: null, origin: null };
  const normalized = normalizeForCompare(value);
  // O antigo "X" significa SÓ "vendedora não informada": nunca vira nome nem origem.
  if (normalized === "x") return { kind: "x", sellerId: null, origin: null };
  if (normalized === "online") return { kind: "online", sellerId: null, origin: "ONLINE" };

  const matches = sellers.filter((s) => normalizeForCompare(s.name) === normalized);
  if (matches.length === 1) return { kind: "known", sellerId: matches[0].id, origin: null };
  return { kind: matches.length > 1 ? "ambiguous" : "unrecognized", sellerId: null, origin: null };
}

export function importRefFor(batchId: string, rowNumber: number): string {
  // A POSIÇÃO original da linha faz parte da chave: reimportar o mesmo arquivo gera as
  // mesmas chaves (não duplica) e duas linhas idênticas em posições diferentes continuam distintas.
  return `${batchId}#${rowNumber}`;
}

function fingerprintOf(saleDate: string, tracking: string | null, customer: string, value: number | null): string {
  return [saleDate, tracking ?? "", normalizeForCompare(customer), value === null ? "" : value.toFixed(2)].join("|");
}

export function planImport(csvText: string, options: { batchId: string; sellers: readonly SellerRef[] }): PlanResult {
  const parsed = parseCsv(csvText);
  if (parsed.header.length === 0 || parsed.header.every((h) => h === "")) {
    return { ok: false, error: "Arquivo vazio ou sem cabeçalho." };
  }

  const { index, missing } = mapHeader(parsed.header);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Colunas obrigatórias não encontradas: ${missing.join(", ")}. Cabeçalho lido: ${parsed.header.join(" | ")}`,
    };
  }

  const cell = (row: readonly string[], field: string): string => (index[field] === undefined ? "" : (row[index[field]] ?? ""));

  const rows: PlannedRow[] = parsed.rows.map((row, i): PlannedRow => {
    const rowNumber = i + 1;
    const blankPlan = { sellerKind: "blank" as const, sellerCell: "", deliveryKind: "unknown" as const, fingerprint: "" };
    if (isBlankRow(row)) return { rowNumber, status: "skipped_blank", reasons: [], ...blankPlan };

    const reasons: string[] = [];

    const saleDate = parseSheetDate(cell(row, "saleDate"));
    if (!cell(row, "saleDate")) reasons.push("sem data da venda");
    else if (!saleDate) reasons.push(`data da venda inválida: "${cell(row, "saleDate")}"`);

    const customer = cell(row, "customer").replace(/\s+/g, " ").trim();
    if (!customer) reasons.push("sem cliente");

    const trackingRaw = cell(row, "tracking").replace(/\s+/g, "").toUpperCase();
    let tracking: string | null = null;
    if (trackingRaw) {
      if (TRACKING_PATTERN.test(trackingRaw)) tracking = trackingRaw;
      else reasons.push(`rastreio inválido: "${cell(row, "tracking")}"`);
    }

    const stateRaw = cell(row, "state").trim().toUpperCase();
    let state: string | null = null;
    if (stateRaw) {
      if ((BR_STATE_CODES as readonly string[]).includes(stateRaw)) state = stateRaw;
      else reasons.push(`UF inválida: "${cell(row, "state")}" (revisar; não corrigida por adivinhação)`);
    }

    const city = cell(row, "city").replace(/\s+/g, " ").trim() || null;

    const money = parseSheetMoney(cell(row, "value"));
    if (money !== null && !Number.isFinite(money)) reasons.push(`valor inválido: "${cell(row, "value")}"`);
    const invoiceTotal = money !== null && Number.isFinite(money) ? money : null;

    let expected: string | null = null;
    if (cell(row, "expected")) {
      expected = parseSheetDate(cell(row, "expected"));
      if (!expected) reasons.push(`previsão inválida: "${cell(row, "expected")}"`);
    }

    const seller = classifySeller(cell(row, "seller"), options.sellers);
    if (seller.kind === "unrecognized") reasons.push(`vendedora não reconhecida: "${cell(row, "seller")}"`);
    if (seller.kind === "ambiguous") reasons.push(`vendedora ambígua (mais de uma com esse nome): "${cell(row, "seller")}"`);

    const delivery = classifyDelivery(cell(row, "delivery"));
    if (delivery.kind === "unrecognized") reasons.push(`situação/entrega não reconhecida: "${cell(row, "delivery")}"`);

    const fingerprint = saleDate ? fingerprintOf(saleDate, tracking, customer, invoiceTotal) : "";
    const base = { rowNumber, sellerKind: seller.kind, sellerCell: cell(row, "seller"), deliveryKind: delivery.kind, fingerprint };

    if (reasons.length > 0 || !saleDate || delivery.kind === "unrecognized") {
      return { ...base, status: "rejected", reasons };
    }

    return {
      ...base,
      status: "valid",
      reasons: [],
      record: {
        sale_date: saleDate,
        customer_name: customer,
        customer_name_search: normalizeForCompare(customer),
        tracking_code: tracking,
        city,
        state,
        invoice_total: invoiceTotal,
        expected_delivery_date: expected,
        delivered_at: delivery.deliveredAt,
        delivery_status: STATUS_BY_DELIVERY[delivery.kind],
        seller_id: seller.sellerId,
        sales_origin: seller.origin,
        record_source: "HISTORICAL_IMPORT",
        import_batch: options.batchId,
        import_ref: importRefFor(options.batchId, rowNumber),
        danfe_file_path: null,
        label_file_path: null,
      },
    };
  });

  return { ok: true, plan: { batchId: options.batchId, delimiter: parsed.delimiter, totalRows: rows.length, rows } };
}
