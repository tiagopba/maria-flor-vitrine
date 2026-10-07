import { isDeliveryStatus, type DeliveryStatus } from "./delivery.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Valor do filtro que significa "sem vendedora" / "sem origem" (as origens são sempre em caixa alta, então não colide). */
export const FILTER_NONE = "none";

export interface FulfillmentListFilters {
  query: string;
  /** aaaa-mm-dd, inclusivo */
  saleFrom: string;
  saleTo: string;
  /** "" (todas) · uuid da vendedora · "none" (vendedora não informada) */
  seller: string;
  /** "" (todas) · ORIGEM em caixa alta · "none" (origem não informada) — independente da vendedora */
  origin: string;
  carrier: string;
  status: DeliveryStatus | "";
  state: string;
  /** "" (todas) · "pending" (com pelo menos 1 follow-up em aberto) · "completed" (os 3 enviados) */
  followup: "" | "pending" | "completed";
  page: number;
}

function isIsoDate(value: string): boolean {
  const m = value.match(ISO_DATE_PATTERN);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]);
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Sanitiza os searchParams da listagem: qualquer valor inválido vira "sem filtro". */
export function parseListFilters(params: Record<string, string | string[] | undefined>): FulfillmentListFilters {
  const status = first(params.status);
  const state = first(params.uf).toUpperCase();
  const seller = first(params.vendedora);
  const origin = first(params.origem);
  const pageNumber = Number.parseInt(first(params.pagina), 10);

  return {
    query: first(params.q).slice(0, 100),
    saleFrom: isIsoDate(first(params.de)) ? first(params.de) : "",
    saleTo: isIsoDate(first(params.ate)) ? first(params.ate) : "",
    seller: seller === FILTER_NONE || UUID_PATTERN.test(seller) ? seller : "",
    origin: origin === FILTER_NONE ? origin : origin.toUpperCase().slice(0, 60),
    carrier: first(params.transportadora).slice(0, 80),
    status: isDeliveryStatus(status) ? status : "",
    state: /^[A-Z]{2}$/.test(state) ? state : "",
    followup: first(params.followup) === "pending" || first(params.followup) === "completed" ? (first(params.followup) as "pending" | "completed") : "",
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };
}

/** Querystring da listagem a partir dos filtros (para paginação), omitindo o que está vazio. */
export function filtersToSearchParams(filters: FulfillmentListFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.saleFrom) params.set("de", filters.saleFrom);
  if (filters.saleTo) params.set("ate", filters.saleTo);
  if (filters.seller) params.set("vendedora", filters.seller);
  if (filters.origin) params.set("origem", filters.origin);
  if (filters.carrier) params.set("transportadora", filters.carrier);
  if (filters.status) params.set("status", filters.status);
  if (filters.state) params.set("uf", filters.state);
  if (filters.followup) params.set("followup", filters.followup);
  if (page > 1) params.set("pagina", String(page));
  return params;
}

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
