export interface ParsedPublicFilters {
  size: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  category: string | null;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function parseStringParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parseNumberParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Lê os filtros a partir do `searchParams` (já resolvido/await) de uma página pública. */
export function parsePublicFilters(searchParams: RawSearchParams): ParsedPublicFilters {
  return {
    size: parseStringParam(searchParams.size),
    minPrice: parseNumberParam(searchParams.minPrice),
    maxPrice: parseNumberParam(searchParams.maxPrice),
    category: parseStringParam(searchParams.category),
  };
}

export function hasActiveFilters(filters: ParsedPublicFilters): boolean {
  return Boolean(filters.size || filters.minPrice != null || filters.maxPrice != null || filters.category);
}

/** Monta a query string de filtros (nunca inclui parâmetros vazios/nulos). */
export function buildFilterQueryString(
  filters: Partial<ParsedPublicFilters>,
  extra?: Record<string, string | undefined>
): string {
  const params = new URLSearchParams();

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }

  if (filters.category) params.set("category", filters.category);
  if (filters.size) params.set("size", filters.size);
  if (filters.minPrice != null) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice != null) params.set("maxPrice", String(filters.maxPrice));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export interface PriceQuickRange {
  label: string;
  min: number;
  max: number | null;
}

export const PRICE_QUICK_RANGES: PriceQuickRange[] = [
  { label: "Até R$ 99", min: 0, max: 99 },
  { label: "R$ 100–149", min: 100, max: 149 },
  { label: "R$ 150–199", min: 150, max: 199 },
  { label: "Acima de R$ 200", min: 200, max: null },
];
