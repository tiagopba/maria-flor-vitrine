import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type DashboardPeriod = "today" | "7d" | "30d" | "month";

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * "Período anterior" é sempre uma janela do MESMO tamanho, imediatamente
 * antes do período atual — regra única e previsível pra qualquer um dos 4
 * filtros (ex: 7 dias comparam com os 7 dias anteriores a esses; Hoje
 * compara com as mesmas horas de ontem). Mais simples e mais fácil de
 * explicar pra quem lê o dashboard do que "sempre o mês/dia cheio anterior".
 */
export function resolvePeriodRanges(period: DashboardPeriod, now = new Date()): { current: DateRange; previous: DateRange } {
  let start: Date;

  switch (period) {
    case "today": {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "7d": {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    }
    case "30d": {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    }
    case "month": {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    }
  }

  const current: DateRange = { start, end: now };
  const durationMs = current.end.getTime() - current.start.getTime();
  const previous: DateRange = {
    start: new Date(current.start.getTime() - durationMs),
    end: current.start,
  };

  return { current, previous };
}

interface RawEvent {
  event_type: string;
  product_id: string | null;
  category_id: string | null;
  size: string | null;
  utm_source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MetricComparison {
  current: number;
  previous: number;
  /** null quando não dá pra calcular variação (período anterior zerado). */
  deltaPct: number | null;
}

function compare(current: number, previous: number): MetricComparison {
  const deltaPct = previous > 0 ? ((current - previous) / previous) * 100 : null;
  return { current, previous, deltaPct };
}

export interface RankingRow {
  id: string;
  label: string;
  count: number;
}

export interface DailyPoint {
  date: string;
  pageViews: number;
  productViews: number;
}

export interface DashboardData {
  cards: {
    pageViews: MetricComparison;
    productViews: MetricComparison;
    favoritesAdded: MetricComparison;
    whatsappStarted: MetricComparison;
    /** % de visualizações de produto que viraram conversa no WhatsApp (proxy de conversão). */
    whatsappClickRate: MetricComparison;
    offersLeadsConfirmed: MetricComparison;
  };
  dailyEvolution: DailyPoint[];
  topViewedProducts: RankingRow[];
  topAddedProducts: RankingRow[];
  topCategories: RankingRow[];
  topSizes: RankingRow[];
  trafficSources: RankingRow[];
}

const RELEVANT_EVENT_TYPES = [
  "PAGE_VIEW",
  "PRODUCT_VIEW",
  "CATEGORY_VIEW",
  "FAVORITE_ADDED",
  "WHATSAPP_CLICK",
  "FAVORITES_WHATSAPP_CLICK",
  "OFFER_LEAD_CONFIRMED",
] as const;

// Teto de segurança — generoso pro volume real de uma boutique, evita uma
// consulta sem limite nenhum se o período for muito longo.
const MAX_EVENTS = 50_000;

function bucketCount(rows: RawEvent[], keyFn: (row: RawEvent) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function topN(counts: Map<string, number>, labelById: Map<string, string>, n: number, fallbackLabel = "Outro"): RankingRow[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, count]) => ({ id, label: labelById.get(id) ?? fallbackLabel, count }));
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Tamanho de um evento vem do campo `size` (WHATSAPP_CLICK) ou de
 * `metadata.size` (FAVORITE_ADDED vindo do fluxo guiado — ver
 * ProductWhatsAppFlow.addToSelection). */
function extractSize(row: RawEvent): string | null {
  if (row.size) return row.size;
  const metaSize = row.metadata?.size;
  return typeof metaSize === "string" && metaSize ? metaSize : null;
}

export async function getDashboardData(period: DashboardPeriod): Promise<DashboardData> {
  const { current, previous } = resolvePeriodRanges(period);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("analytics_events")
    .select("event_type, product_id, category_id, size, utm_source, metadata, created_at")
    .in("event_type", RELEVANT_EVENT_TYPES)
    .gte("created_at", previous.start.toISOString())
    .lte("created_at", current.end.toISOString())
    .limit(MAX_EVENTS);

  if (error) {
    console.error("[getDashboardData] falha ao consultar analytics_events:", error.message);
  }

  const rows = (data ?? []) as RawEvent[];
  const currentStartIso = current.start.toISOString();
  const currentRows = rows.filter((r) => r.created_at >= currentStartIso);
  const previousRows = rows.filter((r) => r.created_at < currentStartIso);

  const countByType = (list: RawEvent[], type: string) => list.filter((r) => r.event_type === type).length;
  const countByTypes = (list: RawEvent[], types: string[]) => list.filter((r) => types.includes(r.event_type)).length;

  const currentPageViews = countByType(currentRows, "PAGE_VIEW");
  const previousPageViews = countByType(previousRows, "PAGE_VIEW");
  const currentProductViews = countByType(currentRows, "PRODUCT_VIEW");
  const previousProductViews = countByType(previousRows, "PRODUCT_VIEW");
  const currentFavorites = countByType(currentRows, "FAVORITE_ADDED");
  const previousFavorites = countByType(previousRows, "FAVORITE_ADDED");
  const currentWhatsapp = countByTypes(currentRows, ["WHATSAPP_CLICK", "FAVORITES_WHATSAPP_CLICK"]);
  const previousWhatsapp = countByTypes(previousRows, ["WHATSAPP_CLICK", "FAVORITES_WHATSAPP_CLICK"]);
  const currentOffersConfirmed = countByType(currentRows, "OFFER_LEAD_CONFIRMED");
  const previousOffersConfirmed = countByType(previousRows, "OFFER_LEAD_CONFIRMED");

  const currentClickRate = currentProductViews > 0 ? (currentWhatsapp / currentProductViews) * 100 : 0;
  const previousClickRate = previousProductViews > 0 ? (previousWhatsapp / previousProductViews) * 100 : 0;

  // Evolução diária — só o período atual, um ponto por dia.
  const dailyMap = new Map<string, { pageViews: number; productViews: number }>();
  for (const row of currentRows) {
    if (row.event_type !== "PAGE_VIEW" && row.event_type !== "PRODUCT_VIEW") continue;
    const key = dayKey(row.created_at);
    const entry = dailyMap.get(key) ?? { pageViews: 0, productViews: 0 };
    if (row.event_type === "PAGE_VIEW") entry.pageViews++;
    else entry.productViews++;
    dailyMap.set(key, entry);
  }
  const dailyEvolution: DailyPoint[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  // Rankings — contam só no período atual.
  const productViewCounts = bucketCount(
    currentRows.filter((r) => r.event_type === "PRODUCT_VIEW"),
    (r) => r.product_id
  );
  const productAddCounts = bucketCount(
    currentRows.filter((r) => r.event_type === "FAVORITE_ADDED"),
    (r) => r.product_id
  );
  const categoryCounts = bucketCount(
    currentRows.filter((r) => r.event_type === "CATEGORY_VIEW"),
    (r) => r.category_id
  );
  const sizeCounts = new Map<string, number>();
  for (const row of currentRows) {
    const size = extractSize(row);
    if (size) sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1);
  }
  const trafficCounts = new Map<string, number>();
  for (const row of currentRows) {
    if (row.event_type !== "PAGE_VIEW") continue;
    const source = row.utm_source?.trim() || "direto";
    trafficCounts.set(source, (trafficCounts.get(source) ?? 0) + 1);
  }

  // Nomes reais só pros produtos/categorias que aparecem no ranking (join
  // no momento da leitura, nunca snapshot no evento — nome/categoria de um
  // produto pode mudar depois de visualizado, e o dashboard deve sempre
  // mostrar o dado atual, não uma foto velha).
  const productIds = [...new Set([...productViewCounts.keys(), ...productAddCounts.keys()])];
  const categoryIds = [...categoryCounts.keys()];

  const [{ data: products }, { data: dbCategories }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    categoryIds.length > 0
      ? supabase.from("categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const productNameById = new Map((products ?? []).map((p) => [p.id, p.name]));
  const categoryNameById = new Map((dbCategories ?? []).map((c) => [c.id, c.name]));

  return {
    cards: {
      pageViews: compare(currentPageViews, previousPageViews),
      productViews: compare(currentProductViews, previousProductViews),
      favoritesAdded: compare(currentFavorites, previousFavorites),
      whatsappStarted: compare(currentWhatsapp, previousWhatsapp),
      whatsappClickRate: compare(currentClickRate, previousClickRate),
      offersLeadsConfirmed: compare(currentOffersConfirmed, previousOffersConfirmed),
    },
    dailyEvolution,
    topViewedProducts: topN(productViewCounts, productNameById, 10, "Produto removido"),
    topAddedProducts: topN(productAddCounts, productNameById, 10, "Produto removido"),
    topCategories: topN(categoryCounts, categoryNameById, 10, "Categoria removida"),
    topSizes: [...sizeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([size, count]) => ({ id: size, label: size, count })),
    trafficSources: [...trafficCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([source, count]) => ({ id: source, label: source, count })),
  };
}
