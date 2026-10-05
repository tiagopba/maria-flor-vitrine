import { isDeliveryStatus, type DeliveryStatus } from "./delivery.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface FulfillmentListFilters {
  query: string;
  /** aaaa-mm-dd, inclusivo */
  saleFrom: string;
  saleTo: string;
  /** Valor cru do select "Vendedora/Origem": "", "seller:<uuid>", "origin:<TEXTO>" ou "none". */
  sellerOrigin: string;
  carrier: string;
  status: DeliveryStatus | "";
  state: string;
  page: number;
}

export type SellerOriginFilter =
  | { kind: "seller"; sellerId: string }
  | { kind: "origin"; origin: string }
  | { kind: "none" };

function isIsoDate(value: string): boolean {
  const m = value.match(ISO_DATE_PATTERN);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]);
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Decodifica o valor do select "Vendedora/Origem" (null = sem filtro ou valor inválido). */
export function parseSellerOriginFilter(raw: string): SellerOriginFilter | null {
  if (raw === "none") return { kind: "none" };
  if (raw.startsWith("seller:")) {
    const sellerId = raw.slice("seller:".length);
    return UUID_PATTERN.test(sellerId) ? { kind: "seller", sellerId } : null;
  }
  if (raw.startsWith("origin:")) {
    const origin = raw.slice("origin:".length).trim();
    return origin ? { kind: "origin", origin } : null;
  }
  return null;
}

/** Sanitiza os searchParams da listagem: qualquer valor inválido vira "sem filtro". */
export function parseListFilters(params: Record<string, string | string[] | undefined>): FulfillmentListFilters {
  const status = first(params.status);
  const state = first(params.uf).toUpperCase();
  const sellerOrigin = first(params.vendedora);
  const pageNumber = Number.parseInt(first(params.pagina), 10);

  return {
    query: first(params.q).slice(0, 100),
    saleFrom: isIsoDate(first(params.de)) ? first(params.de) : "",
    saleTo: isIsoDate(first(params.ate)) ? first(params.ate) : "",
    sellerOrigin: parseSellerOriginFilter(sellerOrigin) ? sellerOrigin : "",
    carrier: first(params.transportadora).slice(0, 80),
    status: isDeliveryStatus(status) ? status : "",
    state: /^[A-Z]{2}$/.test(state) ? state : "",
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };
}

/** Querystring da listagem a partir dos filtros (para paginação), omitindo o que está vazio. */
export function filtersToSearchParams(filters: FulfillmentListFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.saleFrom) params.set("de", filters.saleFrom);
  if (filters.saleTo) params.set("ate", filters.saleTo);
  if (filters.sellerOrigin) params.set("vendedora", filters.sellerOrigin);
  if (filters.carrier) params.set("transportadora", filters.carrier);
  if (filters.status) params.set("status", filters.status);
  if (filters.state) params.set("uf", filters.state);
  if (page > 1) params.set("pagina", String(page));
  return params;
}

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
