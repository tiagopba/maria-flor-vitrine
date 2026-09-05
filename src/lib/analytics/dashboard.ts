import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type DashboardPeriod = "today" | "yesterday" | "7d" | "30d" | "month";

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Fuso de negócio da Maria Flor (Paranaíba/MS) — "Hoje"/"Ontem"/"Mês atual"
 * têm que virar à meia-noite AQUI, nunca à meia-noite do fuso de onde o
 * processo Node roda (na Vercel isso é UTC por padrão; localmente pode ser
 * outro fuso qualquer, ex. o do sistema operacional do dev). Ver auditoria:
 * `setHours(0,0,0,0)`/`getFullYear()+getMonth()` sem fuso explícito é
 * exatamente o bug que fazia o dashboard "zerar"/trocar de dia às ~20h em
 * Paranaíba (meia-noite UTC = 20h em Campo Grande, fuso fixo UTC-4, sem
 * horário de verão desde 2019).
 */
export const BUSINESS_TIMEZONE = "America/Campo_Grande";

/**
 * Ano/mês/dia/hora/min/seg que `date` representa quando visto no fuso
 * `timeZone` — só leitura, via `Intl.DateTimeFormat` (nativo, sem lib nova).
 * `hour: "2-digit"` do `Intl` pode devolver `"24"` pra meia-noite em alguns
 * ambientes; normaliza pra `0` pra nunca virar um `Date.UTC` inválido.
 */
function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const hour = get("hour");

  return {
    year: get("year"),
    month: get("month"), // 1-indexed
    day: get("day"),
    hour: hour === 24 ? 0 : hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Converte um horário de parede (ano/mês/dia/hora/min/seg) EM `timeZone`
 * pro instante UTC correspondente — o inverso de `getZonedDateParts`.
 * Sem lib de fuso: monta um palpite tratando os números como se já fossem
 * UTC, descobre o desvio real formatando esse palpite de volta em
 * `timeZone`, e corrige por esse desvio. `America/Campo_Grande` é fuso fixo
 * (sem DST), então esse desvio nunca muda e uma passada já é exata — não
 * precisa de iteração (necessária em fusos com horário de verão).
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const zonedAsIfUtc = getZonedDateParts(new Date(guessUtcMs), timeZone);
  const zonedAsIfUtcMs = Date.UTC(
    zonedAsIfUtc.year,
    zonedAsIfUtc.month - 1,
    zonedAsIfUtc.day,
    zonedAsIfUtc.hour,
    zonedAsIfUtc.minute,
    zonedAsIfUtc.second
  );
  const offsetMs = zonedAsIfUtcMs - guessUtcMs;
  return new Date(guessUtcMs - offsetMs);
}

/**
 * Meia-noite (00:00:00.000) em `America/Campo_Grande` do dia-calendário de
 * `now` nesse mesmo fuso, deslocado por `dayOffset` dias-calendário
 * (0 = hoje, -1 = ontem, -2 = anteontem). `Date.UTC` normaliza nativamente
 * qualquer estouro de dia/mês/ano (ex.: dia 0 vira o último dia do mês
 * anterior), então virada de mês/ano não precisa de tratamento especial.
 */
function zonedStartOfDayUtc(now: Date, dayOffset = 0): Date {
  const { year, month, day } = getZonedDateParts(now, BUSINESS_TIMEZONE);
  const normalized = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return zonedTimeToUtc(
    normalized.getUTCFullYear(),
    normalized.getUTCMonth() + 1,
    normalized.getUTCDate(),
    0,
    0,
    0,
    BUSINESS_TIMEZONE
  );
}

/** Meia-noite do dia 1 do mês-calendário de `now` em `America/Campo_Grande`. */
function zonedStartOfMonthUtc(now: Date): Date {
  const { year, month } = getZonedDateParts(now, BUSINESS_TIMEZONE);
  return zonedTimeToUtc(year, month, 1, 0, 0, 0, BUSINESS_TIMEZONE);
}

/**
 * "Período anterior" é sempre uma janela do MESMO tamanho, imediatamente
 * antes do período atual — regra única e previsível pra qualquer um dos
 * filtros (ex: 7 dias comparam com os 7 dias anteriores a esses; Hoje
 * compara com as mesmas horas de ontem). Mais simples e mais fácil de
 * explicar pra quem lê o dashboard do que "sempre o mês/dia cheio anterior".
 *
 * "Ontem" é o único período com fim fixo (não `now`): dia anterior completo,
 * 00:00 até 00:00 do dia seguinte (intervalo meio-aberto, mesmo padrão dos
 * outros — "Hoje" também vai de 00:00 até `now`), ambos os limites em
 * `America/Campo_Grande` via `zonedStartOfDayUtc`. O período anterior de
 * "Ontem" é o dia anterior a ele, também completo.
 */
export function resolvePeriodRanges(period: DashboardPeriod, now = new Date()): { current: DateRange; previous: DateRange } {
  if (period === "yesterday") {
    const start = zonedStartOfDayUtc(now, -1);
    const end = zonedStartOfDayUtc(now, 0);

    return {
      current: { start, end },
      previous: { start: zonedStartOfDayUtc(now, -2), end: start },
    };
  }

  let start: Date;

  switch (period) {
    case "today": {
      start = zonedStartOfDayUtc(now);
      break;
    }
    case "7d": {
      // Janela móvel pelo instante exato — sem alinhamento a dia-calendário
      // nenhum, então nunca dependeu (e continua não dependendo) de fuso.
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    }
    case "30d": {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    }
    case "month": {
      start = zonedStartOfMonthUtc(now);
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
  session_id: string | null;
  product_id: string | null;
  category_id: string | null;
  size: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  referrer: string | null;
  device_type: string | null;
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
  /** Métrica principal do ranking — sessões distintas quando aplicável
   * (ver topNBySessions), contagem simples nos que já eram por sessão
   * (dispositivos, origem do tráfego). */
  count: number;
  /** Quantidade bruta de eventos por trás de `count`, mostrada de forma
   * discreta (ex.: "31 sessões interessadas" + "43 visualizações"). Só
   * presente nos rankings de produto/categoria/tamanho — ausente onde não
   * faz sentido (dispositivos, origem do tráfego, que já são só sessão). */
  secondaryCount?: number;
}

export interface FunnelData {
  visitSessions: number;
  productViewSessions: number;
  selectionSessions: number;
  whatsappSessions: number;
}

export interface DashboardData {
  cards: {
    pageViews: MetricComparison;
    /** Sessões únicas (COUNT DISTINCT session_id) que tiveram PAGE_VIEW —
     * mesma base de "visita" usada no funil. Deliberadamente rotulada
     * "Sessões únicas", nunca "visitantes únicos": `session_id` expira
     * depois de ~30min de inatividade (ver lib/session/visitor-id.ts),
     * então uma sessão aqui já é uma sessão real, não um navegador
     * distinto genérico. Eventos gravados antes dessa mudança foram
     * produzidos sob a semântica antiga (session_id sem expiração) — a
     * contagem em períodos que misturam dado antigo e novo reflete essa
     * diferença, não é reescrita. */
    uniqueSessions: MetricComparison;
    productViews: MetricComparison;
    favoritesAdded: MetricComparison;
    /** "Cliques para WhatsApp" — sessões distintas com pelo menos um
     * WHATSAPP_CLICK/FAVORITES_WHATSAPP_CLICK no período (nunca quantidade
     * bruta de evento: uma sessão que clica 3x conta 1). O evento em si só
     * marca que o site gerou o link wa.me e redirecionou — não é
     * confirmação de mensagem enviada de verdade, por isso o nome do card
     * não diz "conversas iniciadas". */
    whatsappStarted: MetricComparison;
    /** Sessões com evento de WhatsApp ÷ sessões únicas (visita) — nunca
     * dividido pela quantidade bruta de PRODUCT_VIEW. */
    whatsappClickRate: MetricComparison;
    /** Sessões com PRODUCT_VIEW ÷ sessões únicas (visita). */
    productViewRate: MetricComparison;
    /** Sessões com FAVORITE_ADDED ÷ sessões únicas (visita). */
    selectionRate: MetricComparison;
    offersLeadsConfirmed: MetricComparison;
  };
  /** Funil da Vitrine — cada etapa conta sessões distintas que tiveram pelo
   * menos um evento daquele tipo no período atual (não quantidade bruta de
   * eventos, e as etapas não exigem ordem entre si). */
  funnel: FunnelData;
  /** Mobile / Desktop / Outros (tablet + desconhecido) — sessões distintas,
   * classificadas pelo `device_type` do primeiro PAGE_VIEW de cada sessão
   * no período. */
  devices: RankingRow[];
  /** Sessões distintas interessadas em cada produto (não visualizações
   * brutas) — ver topNBySessions. `secondaryCount` traz o total bruto de
   * eventos discretamente. */
  topViewedProducts: RankingRow[];
  topAddedProducts: RankingRow[];
  topCategories: RankingRow[];
  topSizes: RankingRow[];
  /** Meta Ads / Instagram / Google / WhatsApp / Direto / Outros — sessões
   * distintas (não eventos), classificadas por utm_source/utm_medium/
   * referrer do primeiro PAGE_VIEW de cada sessão no período (ver
   * classifyTrafficSource). */
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

/** Mesmo par de eventos que já define "Cliques para WhatsApp" —
 * reaproveitado por qualquer métrica que precise de "sessão com
 * WhatsApp" (funil, taxa, card), nunca uma lista divergente. */
const WHATSAPP_EVENT_TYPES = ["WHATSAPP_CLICK", "FAVORITES_WHATSAPP_CLICK"] as const;

// Teto de segurança — generoso pro volume real de uma boutique, evita uma
// consulta sem limite nenhum se o período for muito longo.
const MAX_EVENTS = 50_000;

/** Sessões distintas (session_id) que tiveram pelo menos um evento de
 * algum dos `types` — base de todo o funil/taxas novos, sempre contagem
 * de sessão, nunca de evento bruto. */
function distinctSessionIds(rows: RawEvent[], types: readonly string[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.session_id && types.includes(row.event_type)) ids.add(row.session_id);
  }
  return ids;
}

function ratePct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

const DEVICE_BUCKETS = ["Mobile", "Desktop", "Outros"] as const;

/** Mobile/Desktop exatos; tablet e qualquer valor ausente/desconhecido
 * (eventos antigos de antes da coluna existir) caem em "Outros" — nunca
 * inventa um valor que o evento não registrou. */
function classifyDevice(deviceType: string | null): (typeof DEVICE_BUCKETS)[number] {
  if (deviceType === "mobile") return "Mobile";
  if (deviceType === "desktop") return "Desktop";
  return "Outros";
}

const TRAFFIC_BUCKETS = ["Meta Ads", "Instagram", "Google", "WhatsApp", "Direto", "Outros"] as const;
type TrafficBucket = (typeof TRAFFIC_BUCKETS)[number];

/**
 * Classificação de origem por sessão — regra fixa e documentada, só com
 * dados reais já capturados (utm_source/utm_medium/referrer, ver
 * lib/utm/persist.ts). Nunca inventa origem: sem nenhum sinal (utm E
 * referrer ausentes) é "Direto"; com sinal mas que não bate em nenhuma
 * regra abaixo é "Outros".
 *
 * Ordem importa: paga (Meta Ads) é checada antes de orgânico Instagram,
 * porque um clique em anúncio no Instagram tem utm_source=instagram +
 * utm_medium pago — sem essa ordem cairia em "Instagram" (errado, é Meta
 * Ads pago).
 *
 * `referrer` é gravado no primeiro toque de cada sessão mesmo sem UTM na
 * URL (ver captureAndPersistUtm) — cobre visita orgânica sem nenhuma
 * marcação (ex.: link direto do Instagram sem utm). Só cai em "Direto"
 * quando não existe nenhum sinal mesmo (nem utm, nem `document.referrer`
 * — ex.: digitou a URL, abriu um favorito salvo).
 */
function classifyTrafficSource(row: Pick<RawEvent, "utm_source" | "utm_medium" | "referrer">): TrafficBucket {
  const source = row.utm_source?.toLowerCase() ?? "";
  const medium = row.utm_medium?.toLowerCase() ?? "";
  const referrer = row.referrer?.toLowerCase() ?? "";

  const isPaidMedium = /cpc|ppc|paid|ads?\b/.test(medium);
  const isMetaSource = /facebook|instagram|meta|\bfb\b|\big\b/.test(source);
  if (isPaidMedium && isMetaSource) return "Meta Ads";

  if (source.includes("instagram") || referrer.includes("instagram.com")) return "Instagram";
  if (source.includes("google") || referrer.includes("google.")) return "Google";
  if (source.includes("whatsapp") || referrer.includes("whatsapp.com") || referrer.includes("wa.me")) {
    return "WhatsApp";
  }

  if (!source && !referrer) return "Direto";
  return "Outros";
}

/** Por chave (produto/categoria/tamanho), acumula sessões distintas E
 * quantidade bruta de evento — base dos rankings "sessões interessadas",
 * nunca só evento bruto. */
function bucketSessionsAndEvents(
  rows: RawEvent[],
  keyFn: (row: RawEvent) => string | null
): Map<string, { sessions: Set<string>; events: number }> {
  const buckets = new Map<string, { sessions: Set<string>; events: number }>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const entry = buckets.get(key) ?? { sessions: new Set<string>(), events: 0 };
    entry.events++;
    if (row.session_id) entry.sessions.add(row.session_id);
    buckets.set(key, entry);
  }
  return buckets;
}

/** Ranking pelas sessões distintas interessadas (não pela quantidade
 * bruta de evento) — a mesma sessão repetindo a mesma ação no mesmo item
 * conta 1 vez. `secondaryCount` carrega o total bruto de eventos, exibido
 * de forma discreta pela UI. */
function topNBySessions(
  buckets: Map<string, { sessions: Set<string>; events: number }>,
  labelById: Map<string, string>,
  n: number,
  fallbackLabel = "Outro"
): RankingRow[] {
  return [...buckets.entries()]
    .sort((a, b) => b[1].sessions.size - a[1].sessions.size)
    .slice(0, n)
    .map(([id, { sessions, events }]) => ({
      id,
      label: labelById.get(id) ?? fallbackLabel,
      count: sessions.size,
      secondaryCount: events,
    }));
}

/** Tamanho de um evento vem do campo `size` (WHATSAPP_CLICK) ou de
 * `metadata.size` (FAVORITE_ADDED vindo do fluxo guiado — ver
 * ProductWhatsAppFlow.addToSelection). */
function extractSize(row: RawEvent): string | null {
  if (row.size) return row.size;
  const metaSize = row.metadata?.size;
  return typeof metaSize === "string" && metaSize ? metaSize : null;
}

const EVENT_COLUMNS =
  "event_type, session_id, product_id, category_id, size, utm_source, utm_medium, referrer, device_type, metadata, created_at";

/**
 * `.limit(MAX_EVENTS)` sozinho não bastava: o PostgREST do projeto tem um
 * teto de resposta de 1000 linhas por request, então qualquer período com
 * mais de 1000 eventos vinha silenciosamente truncado (sem erro nenhum —
 * só faltavam linhas). Paginação real em blocos de PAGE_SIZE (o próprio
 * teto do servidor) resolve isso sem depender de mudar configuração
 * nenhuma do Supabase; `MAX_EVENTS` continua como teto de segurança total
 * (generoso pro volume real de uma boutique), agora contra a soma de
 * todas as páginas, não uma única chamada.
 */
const PAGE_SIZE = 1000;

async function fetchAllAnalyticsEvents(
  supabase: ReturnType<typeof createAdminClient>,
  startIso: string,
  endIso: string
): Promise<RawEvent[]> {
  const allRows: RawEvent[] = [];
  let from = 0;

  while (allRows.length < MAX_EVENTS) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select(EVENT_COLUMNS)
      .in("event_type", RELEVANT_EVENT_TYPES)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[getDashboardData] falha ao consultar analytics_events:", error.message);
      break;
    }

    const page = (data ?? []) as RawEvent[];
    allRows.push(...page);

    if (page.length < PAGE_SIZE) break; // última página
    from += PAGE_SIZE;
  }

  return allRows;
}

export async function getDashboardData(period: DashboardPeriod): Promise<DashboardData> {
  const { current, previous } = resolvePeriodRanges(period);
  const supabase = createAdminClient();

  const rows = await fetchAllAnalyticsEvents(supabase, previous.start.toISOString(), current.end.toISOString());
  const currentStartIso = current.start.toISOString();
  const currentRows = rows.filter((r) => r.created_at >= currentStartIso);
  const previousRows = rows.filter((r) => r.created_at < currentStartIso);

  const countByType = (list: RawEvent[], type: string) => list.filter((r) => r.event_type === type).length;

  const currentPageViews = countByType(currentRows, "PAGE_VIEW");
  const previousPageViews = countByType(previousRows, "PAGE_VIEW");
  const currentProductViews = countByType(currentRows, "PRODUCT_VIEW");
  const previousProductViews = countByType(previousRows, "PRODUCT_VIEW");
  const currentFavorites = countByType(currentRows, "FAVORITE_ADDED");
  const previousFavorites = countByType(previousRows, "FAVORITE_ADDED");
  const currentOffersConfirmed = countByType(currentRows, "OFFER_LEAD_CONFIRMED");
  const previousOffersConfirmed = countByType(previousRows, "OFFER_LEAD_CONFIRMED");

  // Sessões distintas por etapa — base do funil, das taxas e do card de
  // sessões únicas. Sempre COUNT DISTINCT session_id, nunca quantidade
  // bruta de evento.
  const currentVisitSessions = distinctSessionIds(currentRows, ["PAGE_VIEW"]);
  const previousVisitSessions = distinctSessionIds(previousRows, ["PAGE_VIEW"]);
  const currentProductViewSessions = distinctSessionIds(currentRows, ["PRODUCT_VIEW"]);
  const previousProductViewSessions = distinctSessionIds(previousRows, ["PRODUCT_VIEW"]);
  const currentSelectionSessions = distinctSessionIds(currentRows, ["FAVORITE_ADDED"]);
  const previousSelectionSessions = distinctSessionIds(previousRows, ["FAVORITE_ADDED"]);
  const currentWhatsappSessions = distinctSessionIds(currentRows, WHATSAPP_EVENT_TYPES);
  const previousWhatsappSessions = distinctSessionIds(previousRows, WHATSAPP_EVENT_TYPES);

  const currentClickRate = ratePct(currentWhatsappSessions.size, currentVisitSessions.size);
  const previousClickRate = ratePct(previousWhatsappSessions.size, previousVisitSessions.size);
  const currentProductViewRate = ratePct(currentProductViewSessions.size, currentVisitSessions.size);
  const previousProductViewRate = ratePct(previousProductViewSessions.size, previousVisitSessions.size);
  const currentSelectionRate = ratePct(currentSelectionSessions.size, currentVisitSessions.size);
  const previousSelectionRate = ratePct(previousSelectionSessions.size, previousVisitSessions.size);

  const funnel: FunnelData = {
    visitSessions: currentVisitSessions.size,
    productViewSessions: currentProductViewSessions.size,
    selectionSessions: currentSelectionSessions.size,
    whatsappSessions: currentWhatsappSessions.size,
  };

  // Dispositivo e origem de tráfego são atribuídos por SESSÃO, não por
  // evento — usa o PAGE_VIEW mais antigo de cada sessão no período atual
  // (primeiro toque), já que captureAndPersistUtm mantém o mesmo
  // utm/referrer/device em todos os PAGE_VIEW de uma sessão.
  const firstPageViewBySession = new Map<string, RawEvent>();
  for (const row of currentRows) {
    if (row.event_type !== "PAGE_VIEW" || !row.session_id) continue;
    const existing = firstPageViewBySession.get(row.session_id);
    if (!existing || row.created_at < existing.created_at) {
      firstPageViewBySession.set(row.session_id, row);
    }
  }

  const deviceCounts = new Map<string, number>(DEVICE_BUCKETS.map((b) => [b, 0]));
  const trafficCounts = new Map<string, number>(TRAFFIC_BUCKETS.map((b) => [b, 0]));
  for (const row of firstPageViewBySession.values()) {
    const device = classifyDevice(row.device_type);
    deviceCounts.set(device, (deviceCounts.get(device) ?? 0) + 1);
    const traffic = classifyTrafficSource(row);
    trafficCounts.set(traffic, (trafficCounts.get(traffic) ?? 0) + 1);
  }

  // Rankings — contam só no período atual, por sessão distinta (não
  // evento bruto): a mesma sessão repetindo a mesma ação no mesmo item
  // conta 1 vez. Cada bucket guarda também o total bruto de eventos
  // (secondaryCount), exibido de forma discreta pela UI.
  const productViewBuckets = bucketSessionsAndEvents(
    currentRows.filter((r) => r.event_type === "PRODUCT_VIEW"),
    (r) => r.product_id
  );
  const productAddBuckets = bucketSessionsAndEvents(
    currentRows.filter((r) => r.event_type === "FAVORITE_ADDED"),
    (r) => r.product_id
  );
  const categoryBuckets = bucketSessionsAndEvents(
    currentRows.filter((r) => r.event_type === "CATEGORY_VIEW"),
    (r) => r.category_id
  );
  const sizeBuckets = bucketSessionsAndEvents(currentRows, extractSize);

  // Nomes reais só pros produtos/categorias que aparecem no ranking (join
  // no momento da leitura, nunca snapshot no evento — nome/categoria de um
  // produto pode mudar depois de visualizado, e o dashboard deve sempre
  // mostrar o dado atual, não uma foto velha).
  const productIds = [...new Set([...productViewBuckets.keys(), ...productAddBuckets.keys()])];
  const categoryIds = [...categoryBuckets.keys()];

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
  // Tamanho não tem tabela pra buscar nome — o próprio valor já é o label.
  const sizeLabelById = new Map([...sizeBuckets.keys()].map((size) => [size, size]));

  return {
    cards: {
      pageViews: compare(currentPageViews, previousPageViews),
      uniqueSessions: compare(currentVisitSessions.size, previousVisitSessions.size),
      productViews: compare(currentProductViews, previousProductViews),
      favoritesAdded: compare(currentFavorites, previousFavorites),
      whatsappStarted: compare(currentWhatsappSessions.size, previousWhatsappSessions.size),
      whatsappClickRate: compare(currentClickRate, previousClickRate),
      productViewRate: compare(currentProductViewRate, previousProductViewRate),
      selectionRate: compare(currentSelectionRate, previousSelectionRate),
      offersLeadsConfirmed: compare(currentOffersConfirmed, previousOffersConfirmed),
    },
    funnel,
    devices: DEVICE_BUCKETS.map((bucket) => ({ id: bucket, label: bucket, count: deviceCounts.get(bucket) ?? 0 })),
    topViewedProducts: topNBySessions(productViewBuckets, productNameById, 10, "Produto removido"),
    topAddedProducts: topNBySessions(productAddBuckets, productNameById, 10, "Produto removido"),
    topCategories: topNBySessions(categoryBuckets, categoryNameById, 10, "Categoria removida"),
    topSizes: topNBySessions(sizeBuckets, sizeLabelById, 10),
    trafficSources: TRAFFIC_BUCKETS.map((bucket) => ({
      id: bucket,
      label: bucket,
      count: trafficCounts.get(bucket) ?? 0,
    })).sort((a, b) => b.count - a.count),
  };
}
