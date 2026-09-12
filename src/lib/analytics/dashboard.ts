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
  /** "product_page" | "favorites_page" nos eventos de WhatsApp. */
  source: string | null;
  /** Vendedora resolvida no momento do clique (ver resolveSeller) — já uma
   * FK própria em analytics_events, nunca duplica nome/telefone aqui; o
   * nome é resolvido depois via `sellers`, só pros ids que aparecerem. */
  seller_id: string | null;
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
  /** Métrica secundária discreta por trás de `count`. Na maioria dos
   * rankings (produto/categoria/tamanho) é a quantidade bruta de eventos
   * por trás de uma contagem principal por sessão (ex.: "31 sessões
   * interessadas" + "43 visualizações"). Em "Cliques em Comprar por
   * vendedora" é o inverso: `count` já é a quantidade bruta de cliques, e
   * `secondaryCount` traz as sessões distintas por trás dela — ver
   * getDashboardData. Ausente onde não faz sentido (dispositivos, origem do
   * tráfego, que já são só sessão). */
  secondaryCount?: number;
}

/**
 * Funil simplificado ao novo fluxo da cliente ("Quero essa peça" manda
 * direto pra /favoritos; conversa com vendedora só acontece lá) — três
 * etapas, cada uma sessões distintas com pelo menos um evento do tipo,
 * nunca quantidade bruta:
 * Visualizou produto (PRODUCT_VIEW) → Adicionou às Minhas Roupas
 * (FAVORITE_ADDED) → Tirar dúvidas no WhatsApp (FAVORITES_WHATSAPP_CLICK,
 * nunca o WHATSAPP_CLICK antigo — ver DOUBT_WHATSAPP_EVENT_TYPES).
 */
export interface FunnelData {
  productViewSessions: number;
  selectionSessions: number;
  whatsappSessions: number;
}

/**
 * Uma etapa do "Raio-X do Funil" (ver RaioXFunnelData) — sempre sessões
 * distintas com pelo menos um evento do tipo daquela etapa no período
 * atual, mesmo espírito de FunnelData (sem exigir ordem entre sessões).
 */
export interface RaioXFunnelStep {
  id: string;
  label: string;
  sessions: number;
  /** % desta etapa em relação à etapa ANTERIOR — null só na primeira
   * etapa (não existe "anterior" pra Visualizou produto). */
  conversionFromPreviousPct: number | null;
  /** 100 - conversionFromPreviousPct — sempre junto (nunca calculado de
   * novo pela UI), null só na primeira etapa. */
  dropoffFromPreviousPct: number | null;
}

/**
 * Raio-X do Funil — 5 etapas, todas com evento já existente antes desta
 * mudança (auditoria: nenhum evento novo foi criado). Cada etapa é
 * sessões distintas no período atual:
 * 1. Visualizou produto — PRODUCT_VIEW.
 * 2. Clicou em Quero essa peça — PRODUCT_FLOW_STARTED (auditado: dispara
 *    só em ProductWhatsAppFlow.handleWantThis, uma vez por clique real no
 *    botão, tanto pra peça de tamanho único quanto pra peça com vários
 *    tamanhos — antes de saber se o tamanho será escolhido).
 * 3. Adicionou às Minhas Roupas — FAVORITE_ADDED, mas SÓ com
 *    `source = "product_page"`. Auditoria encontrou FAVORITE_ADDED com
 *    DUAS origens diferentes: o coração de favoritar (FavoriteButton, em
 *    qualquer card/vitrine — grava `source: "favorites"`, o default de
 *    recordFavoriteEvent) e o fluxo guiado "Quero essa peça"
 *    (ProductWhatsAppFlow.addToSelection — grava `source: "product_page"`
 *    explicitamente). Misturar as duas responderia uma pergunta errada
 *    ("quantas sessões favoritaram algo, de qualquer forma") em vez da
 *    pedida ("de quem clicou em Quero essa peça, quantas conseguiram
 *    adicionar") — por isso o filtro por `source` é obrigatório aqui.
 *    SIZE_SELECTED deliberadamente NÃO é uma etapa própria: audita-se que
 *    ele dispara sempre junto de FAVORITE_ADDED (mesmo bloco de código,
 *    mesmo instante, sempre que existe um tamanho de verdade — inclusive
 *    tamanho único/"Único" auto-selecionado) — nunca captura sozinho um
 *    abandono que o vão 2→3 já não capture.
 * 4. Abriu Minhas Roupas — FAVORITES_VIEW (dispara 1x por visita a
 *    /favoritos, independente de a sessão ter chegado lá pelo fluxo
 *    guiado ou por outro caminho — ex.: link direto, nav "Minhas Roupas".
 *    Por isso este número pode, em tese, ser um pouco maior que a etapa
 *    anterior dentro do MESMO período: uma sessão que adicionou uma peça
 *    num período anterior e só abre /favoritos de novo agora entra aqui
 *    sem um novo FAVORITE_ADDED neste período. Não é erro de cálculo —
 *    é a mesma limitação, já aceita, de todo o funil existente: contagem
 *    por sessão-com-evento-no-período, não um funil sequencial de coorte).
 * 5. Clicou em Comprar — FAVORITES_WHATSAPP_CLICK, sessões distintas
 *    (Set já usado em funnel.whatsappSessions — REUTILIZADO aqui, nunca
 *    recalculado, pra nunca divergir). Deliberadamente NÃO usa a contagem
 *    bruta de cliques do card "Cliques em Comprar" (cards.whatsappStarted)
 *    — as duas métricas medem coisas diferentes e não devem ser
 *    misturadas (instrução explícita).
 */
export interface RaioXFunnelData {
  steps: RaioXFunnelStep[];
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
    /** "Adições às Minhas Roupas" — sessões distintas com pelo menos um
     * FAVORITE_ADDED no período (nunca quantidade bruta de evento: uma
     * sessão que adiciona 3 peças conta 1). O total bruto de eventos vem
     * em `favoritesAddedRawCount`, mostrado discretamente abaixo pela UI. */
    favoritesAdded: MetricComparison;
    /** Quantidade bruta de FAVORITE_ADDED no período atual (sem comparação
     * com o período anterior) — mostrado como texto discreto sob o card de
     * favoritesAdded (ex.: "124 sessões" + "255 adições"), nunca como a
     * métrica principal. */
    favoritesAddedRawCount: number;
    /** "Cliques em Comprar" — quantidade BRUTA de eventos
     * FAVORITES_WHATSAPP_CLICK no período (nunca deduplicado por sessão:
     * duas seleções distintas na mesma sessão contam 2). Auditoria real
     * (2026-09-10, sessão bd0e0dc3-...) mostrou duas seleções genuínas —
     * CALÇA SARJA/G e SAIA RENDA/M, ambas pra Maria Abadia — no mesmo
     * navegador/sessão a poucos minutos de intervalo; contar por sessão
     * escondia o volume real de ações. `funnel.whatsappSessions` continua
     * disponível (e inalterado) pra quem quer a base por sessão — a UI
     * mostra os dois números juntos (cliques brutos como valor principal do
     * card, sessões distintas discretamente abaixo). Deliberadamente NÃO
     * inclui o WHATSAPP_CLICK antigo (fluxo "Tirar dúvidas" da página de
     * produto, removido; hoje só "Quero algo parecido" de SOLD_OUT) — ver
     * DOUBT_WHATSAPP_EVENT_TYPES. O evento em si só marca que o site gerou
     * o link wa.me e redirecionou — não é confirmação de mensagem enviada
     * nem de compra concluída, por isso nem o nome do card nem o hint dizem
     * isso. */
    whatsappStarted: MetricComparison;
    /** Sessões com FAVORITES_WHATSAPP_CLICK ÷ sessões únicas (visita) —
     * deliberadamente continua por SESSÃO distinta (nunca por quantidade
     * bruta de clique, ao contrário de whatsappStarted acima): uma mesma
     * sessão clicando várias vezes não pode inflar nem estourar 100% desta
     * taxa. */
    whatsappClickRate: MetricComparison;
    /** Sessões com PRODUCT_VIEW ÷ sessões únicas (visita). */
    productViewRate: MetricComparison;
    /** Sessões com FAVORITE_ADDED ÷ sessões únicas (visita). */
    selectionRate: MetricComparison;
    offersLeadsConfirmed: MetricComparison;
  };
  /** Funil da Vitrine (Visualizou produto → Adicionou às Minhas Roupas →
   * Tirar dúvidas no WhatsApp) — cada etapa conta sessões distintas que
   * tiveram pelo menos um evento daquele tipo no período atual (não
   * quantidade bruta de eventos, e as etapas não exigem ordem entre si). */
  funnel: FunnelData;
  /** Raio-X do Funil — ver RaioXFunnelData/RaioXFunnelStep. Seção nova e
   * separada do funil de 3 etapas acima (funnel/FunnelData, inalterado);
   * não substitui nem reinterpreta nada dele. */
  raioXFunnel: RaioXFunnelData;
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
  /** "Cliques em Comprar por vendedora" — quantidade BRUTA de eventos
   * FAVORITES_WHATSAPP_CLICK por vendedora (`count`, métrica principal
   * deste ranking — mesmo motivo de whatsappStarted acima), com a
   * quantidade de sessões distintas por trás disso em `secondaryCount`,
   * mostrada discretamente. Só FAVORITES_WHATSAPP_CLICK (nunca o
   * WHATSAPP_CLICK antigo). Nome resolvido via `sellers`, nunca duplicado em
   * analytics_events — só vendedoras que realmente receberam algum clique
   * no período; sem entrada nenhuma quando não há seller_id nulo no período
   * (ver getDashboardData). */
  whatsappBySeller: RankingRow[];
  /** "Vendedora escolhida" / "Qualquer vendedora / round-robin" / "Sem
   * informação" — sempre as 3 categorias (mesmo padrão de devices), ver
   * classifyDirectionMode. Mesma base de whatsappBySeller: só
   * FAVORITES_WHATSAPP_CLICK. */
  whatsappByDirectionMode: RankingRow[];
}

// PRODUCT_FLOW_STARTED voltou pra esta lista com a Raio-X do Funil (ver
// RaioXFunnelData abaixo) — é o evento de "clicou em Quero essa peça"
// (auditado: só dispara em ProductWhatsAppFlow.handleWantThis, uma vez por
// clique, nada mais usa esse tipo). Tinha sido removido daqui numa
// auditoria de performance anterior por não ter consumidor nenhum no
// Dashboard; agora tem. FAVORITES_VIEW ("abriu Minhas Roupas") entra pelo
// mesmo motivo — nenhum dos dois é um evento novo, os dois já eram
// gravados normalmente em analytics_events, só não eram buscados aqui.
const RELEVANT_EVENT_TYPES = [
  "PAGE_VIEW",
  "PRODUCT_VIEW",
  "CATEGORY_VIEW",
  "SIZE_SELECTED",
  "FAVORITE_ADDED",
  "WHATSAPP_CLICK",
  "FAVORITES_WHATSAPP_CLICK",
  "OFFER_LEAD_CONFIRMED",
  "PRODUCT_FLOW_STARTED",
  "FAVORITES_VIEW",
] as const;

/**
 * "Tirar dúvidas no WhatsApp" — o funil/card/taxa/rankings principais do
 * novo fluxo usam só este evento, nunca o WHATSAPP_CLICK antigo (rota
 * "Tirar dúvidas" da página de produto, removida; hoje esse event_type só
 * nasce de "Quero algo parecido" em peça SOLD_OUT, um fluxo à parte que não
 * deve inflar as métricas do fluxo principal — ver instrução de não
 * misturar os dois). WHATSAPP_CLICK continua gravado normalmente em
 * analytics_events (nunca apagado/reclassificado) — só não alimenta mais
 * nenhuma métrica ou ranking do Dashboard.
 */
const DOUBT_WHATSAPP_EVENT_TYPES = ["FAVORITES_WHATSAPP_CLICK"] as const;

const DIRECTION_MODE_BUCKETS = ["Vendedora escolhida", "Qualquer vendedora / round-robin", "Sem informação"] as const;
type DirectionModeBucket = (typeof DIRECTION_MODE_BUCKETS)[number];

/**
 * `metadata.selection_mode` já é gravado por resolveSeller em todo clique
 * de WhatsApp ("manual" = cliente escolheu a vendedora, "round_robin" =
 * "Qualquer vendedora") — "Sem informação" cobre só eventos gravados antes
 * dessa metadata existir (nunca reescritos), não um erro técnico.
 */
function classifyDirectionMode(row: Pick<RawEvent, "metadata">): DirectionModeBucket {
  const mode = row.metadata?.selection_mode;
  if (mode === "manual") return "Vendedora escolhida";
  if (mode === "round_robin") return "Qualquer vendedora / round-robin";
  return "Sem informação";
}

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
  "event_type, session_id, product_id, category_id, size, source, seller_id, utm_source, utm_medium, referrer, device_type, metadata, created_at";

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

/**
 * Quantas páginas buscar ao mesmo tempo (item 1 da auditoria de
 * performance). Nem sequencial (a causa medida de ~13s do Dashboard em
 * períodos longos) nem um `Promise.all` sem limite nenhum (rajada de até
 * 24+ requests simultâneas no mesmo Supabase compartilhado) — um meio
 * termo deliberado.
 */
const PAGE_CONCURRENCY = 6;

/**
 * Busca uma página específica (`.range`) — nunca lança: um erro numa
 * página vira log + página vazia, pras outras páginas do mesmo lote (já
 * em voo em paralelo) continuarem normalmente em vez de derrubar a
 * consulta inteira por causa de uma falha isolada.
 */
async function fetchAnalyticsEventsPage(
  supabase: ReturnType<typeof createAdminClient>,
  startIso: string,
  endIso: string,
  pageIndex: number
): Promise<RawEvent[]> {
  const from = pageIndex * PAGE_SIZE;
  const { data, error } = await supabase
    .from("analytics_events")
    .select(EVENT_COLUMNS)
    .in("event_type", RELEVANT_EVENT_TYPES)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    console.error(`[getDashboardData] falha ao consultar analytics_events (página ${pageIndex}):`, error.message);
    return [];
  }

  return (data ?? []) as RawEvent[];
}

/**
 * Mesmos eventos e mesma lógica de agregação de sempre — só a forma de
 * buscar mudou. Descobre quantas páginas existem de verdade (1 consulta
 * `count`, sem transferir linha nenhuma) e busca em lotes de até
 * PAGE_CONCURRENCY páginas simultâneas, nunca todas de uma vez.
 *
 * Ordem: nenhuma métrica/ranking depende da ordem de chegada das linhas
 * (auditado antes desta mudança — `distinctSessionIds`/`bucketSessionsAndEvents`
 * só usam Set/Map, e o único lugar que precisa do evento MAIS ANTIGO por
 * sessão — `firstPageViewBySession`, usado pra dispositivo/origem de
 * tráfego — já compara `created_at` explicitamente linha a linha, nunca
 * assume que a primeira ocorrência no array é a mais antiga). Mesmo assim,
 * as páginas são remontadas na ordem certa (por índice, não pela ordem de
 * conclusão do Promise.all) antes de devolver — sem custo extra, só mais
 * fácil de raciocinar sobre o resultado.
 */
async function fetchAllAnalyticsEvents(
  supabase: ReturnType<typeof createAdminClient>,
  startIso: string,
  endIso: string
): Promise<RawEvent[]> {
  const { count, error: countError } = await supabase
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .in("event_type", RELEVANT_EVENT_TYPES)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (countError) {
    console.error("[getDashboardData] falha ao contar analytics_events:", countError.message);
    return [];
  }

  const totalRows = Math.min(count ?? 0, MAX_EVENTS);
  if (totalRows === 0) return [];

  const pageCount = Math.ceil(totalRows / PAGE_SIZE);
  const pagesByIndex: RawEvent[][] = new Array(pageCount);

  for (let batchStart = 0; batchStart < pageCount; batchStart += PAGE_CONCURRENCY) {
    const batchEnd = Math.min(batchStart + PAGE_CONCURRENCY, pageCount);
    const batchResults = await Promise.all(
      Array.from({ length: batchEnd - batchStart }, (_, i) =>
        fetchAnalyticsEventsPage(supabase, startIso, endIso, batchStart + i)
      )
    );
    for (let i = 0; i < batchResults.length; i++) {
      pagesByIndex[batchStart + i] = batchResults[i];
    }
  }

  return pagesByIndex.flat();
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
  const currentOffersConfirmed = countByType(currentRows, "OFFER_LEAD_CONFIRMED");
  const previousOffersConfirmed = countByType(previousRows, "OFFER_LEAD_CONFIRMED");
  // "Cliques em Comprar" — quantidade bruta de FAVORITES_WHATSAPP_CLICK,
  // nunca deduplicada por sessão (ver doc de whatsappStarted acima).
  const currentWhatsappClicks = countByType(currentRows, "FAVORITES_WHATSAPP_CLICK");
  const previousWhatsappClicks = countByType(previousRows, "FAVORITES_WHATSAPP_CLICK");

  // Sessões distintas por etapa — base do funil, das taxas e do card de
  // sessões únicas. Sempre COUNT DISTINCT session_id, nunca quantidade
  // bruta de evento.
  const currentVisitSessions = distinctSessionIds(currentRows, ["PAGE_VIEW"]);
  const previousVisitSessions = distinctSessionIds(previousRows, ["PAGE_VIEW"]);
  const currentProductViewSessions = distinctSessionIds(currentRows, ["PRODUCT_VIEW"]);
  const previousProductViewSessions = distinctSessionIds(previousRows, ["PRODUCT_VIEW"]);
  const currentSelectionSessions = distinctSessionIds(currentRows, ["FAVORITE_ADDED"]);
  const previousSelectionSessions = distinctSessionIds(previousRows, ["FAVORITE_ADDED"]);
  // "Cliques em Tirar dúvidas" — só FAVORITES_WHATSAPP_CLICK, nunca o
  // WHATSAPP_CLICK antigo (ver DOUBT_WHATSAPP_EVENT_TYPES). Base do funil
  // principal, do card e da taxa de WhatsApp.
  const currentWhatsappSessions = distinctSessionIds(currentRows, DOUBT_WHATSAPP_EVENT_TYPES);
  const previousWhatsappSessions = distinctSessionIds(previousRows, DOUBT_WHATSAPP_EVENT_TYPES);

  const currentClickRate = ratePct(currentWhatsappSessions.size, currentVisitSessions.size);
  const previousClickRate = ratePct(previousWhatsappSessions.size, previousVisitSessions.size);
  const currentProductViewRate = ratePct(currentProductViewSessions.size, currentVisitSessions.size);
  const previousProductViewRate = ratePct(previousProductViewSessions.size, previousVisitSessions.size);
  const currentSelectionRate = ratePct(currentSelectionSessions.size, currentVisitSessions.size);
  const previousSelectionRate = ratePct(previousSelectionSessions.size, previousVisitSessions.size);

  const funnel: FunnelData = {
    productViewSessions: currentProductViewSessions.size,
    selectionSessions: currentSelectionSessions.size,
    whatsappSessions: currentWhatsappSessions.size,
  };

  // Raio-X do Funil — só as duas sessões novas (ver RaioXFunnelData pro
  // porquê de cada uma); as outras três etapas REUTILIZAM sets já
  // calculados acima (currentProductViewSessions, currentWhatsappSessions),
  // nunca recalculados. Etapa 3 filtra `source === "product_page"` — sem
  // esse filtro, o coração de favoritar (source "favorites", em qualquer
  // card da vitrine) contaminaria a etapa, que é especificamente sobre o
  // fluxo "Quero essa peça".
  const currentFlowStartedSessions = distinctSessionIds(currentRows, ["PRODUCT_FLOW_STARTED"]);
  const currentAddedViaFlowSessions = distinctSessionIds(
    currentRows.filter((r) => r.source === "product_page"),
    ["FAVORITE_ADDED"]
  );
  const currentFavoritesViewSessions = distinctSessionIds(currentRows, ["FAVORITES_VIEW"]);

  const raioXSteps: { id: string; label: string; sessions: number }[] = [
    { id: "product_view", label: "Visualizou produto", sessions: currentProductViewSessions.size },
    { id: "flow_started", label: "Clicou em Quero essa peça", sessions: currentFlowStartedSessions.size },
    { id: "added_to_selection", label: "Adicionou às Minhas Roupas", sessions: currentAddedViaFlowSessions.size },
    { id: "favorites_view", label: "Abriu Minhas Roupas", sessions: currentFavoritesViewSessions.size },
    { id: "whatsapp_click", label: "Clicou em Comprar", sessions: currentWhatsappSessions.size },
  ];

  const raioXFunnel: RaioXFunnelData = {
    steps: raioXSteps.map((step, index) => {
      if (index === 0) {
        return { ...step, conversionFromPreviousPct: null, dropoffFromPreviousPct: null };
      }
      const previousSessions = raioXSteps[index - 1].sessions;
      const conversionFromPreviousPct = ratePct(step.sessions, previousSessions);
      const dropoffFromPreviousPct = previousSessions > 0 ? 100 - conversionFromPreviousPct : null;
      return { ...step, conversionFromPreviousPct, dropoffFromPreviousPct };
    }),
  };

  // "Tirar dúvidas por vendedora" e "Forma de direcionamento" — só
  // FAVORITES_WHATSAPP_CLICK (mesma base de currentWhatsappSessions), nunca
  // o WHATSAPP_CLICK antigo. Uma sessão que clica várias vezes pra MESMA
  // vendedora conta 1 (Set dedup); se clicar pra vendedoras diferentes,
  // conta 1 em cada uma (Sets independentes por seller_id) — exatamente a
  // regra pedida.
  const directionModeBuckets = new Map<string, Set<string>>(DIRECTION_MODE_BUCKETS.map((b) => [b, new Set()]));
  const sellerSessionSets = new Map<string, Set<string>>();
  const noSellerSessions = new Set<string>();
  // Contagem BRUTA de cliques por vendedora (nunca deduplicada por sessão) —
  // base do ranking "Cliques em Comprar por vendedora" (ver whatsappBySeller
  // abaixo); sellerSessionSets continua existindo do jeito que já existia,
  // agora só como métrica SECUNDÁRIA desse ranking.
  const sellerEventCounts = new Map<string, number>();
  let noSellerEventCount = 0;
  for (const row of currentRows) {
    if (!row.session_id || !DOUBT_WHATSAPP_EVENT_TYPES.includes(row.event_type as (typeof DOUBT_WHATSAPP_EVENT_TYPES)[number])) {
      continue;
    }

    const mode = classifyDirectionMode(row);
    directionModeBuckets.get(mode)?.add(row.session_id);

    if (row.seller_id) {
      const set = sellerSessionSets.get(row.seller_id) ?? new Set<string>();
      set.add(row.session_id);
      sellerSessionSets.set(row.seller_id, set);
      sellerEventCounts.set(row.seller_id, (sellerEventCounts.get(row.seller_id) ?? 0) + 1);
    } else {
      noSellerSessions.add(row.session_id);
      noSellerEventCount++;
    }
  }

  const sellerIdsInPeriod = [...sellerSessionSets.keys()];

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

  const productIds = [...new Set([...productViewBuckets.keys(), ...productAddBuckets.keys()])];
  const categoryIds = [...categoryBuckets.keys()];

  // sellers/products/categories são independentes entre si (cada um só
  // depende de ids já calculados acima, em memória, a partir de
  // currentRows) — item 3 da auditoria de performance: antes, sellers era
  // aguardada sozinha e só DEPOIS products+categories entravam num
  // Promise.all separado; agora os três disparam juntos, nenhuma mudança
  // de resultado, só de quando cada request sai.
  const [{ data: sellersInPeriod }, { data: products }, { data: dbCategories }] = await Promise.all([
    sellerIdsInPeriod.length > 0
      ? supabase.from("sellers").select("id, name").in("id", sellerIdsInPeriod)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    categoryIds.length > 0
      ? supabase.from("categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  // Nome só pras vendedoras que realmente aparecem no período — mesmo
  // padrão de productNameById/categoryNameById (join no momento da
  // leitura, nunca duplicado em analytics_events). Uma vendedora inativa
  // (mas não excluída) continua com nome resolvido normalmente; só some se
  // a linha em `sellers` for excluída de verdade (aí a FK já vira null por
  // "on delete set null", e cai em noSellerSessions).
  const sellerNameById = new Map((sellersInPeriod ?? []).map((s) => [s.id, s.name]));
  // Nomes reais só pros produtos/categorias que aparecem no ranking (join
  // no momento da leitura, nunca snapshot no evento — nome/categoria de um
  // produto pode mudar depois de visualizado, e o dashboard deve sempre
  // mostrar o dado atual, não uma foto velha).
  const productNameById = new Map((products ?? []).map((p) => [p.id, p.name]));
  const categoryNameById = new Map((dbCategories ?? []).map((c) => [c.id, c.name]));
  // Tamanho não tem tabela pra buscar nome — o próprio valor já é o label.
  const sizeLabelById = new Map([...sizeBuckets.keys()].map((size) => [size, size]));

  return {
    cards: {
      pageViews: compare(currentPageViews, previousPageViews),
      uniqueSessions: compare(currentVisitSessions.size, previousVisitSessions.size),
      productViews: compare(currentProductViews, previousProductViews),
      favoritesAdded: compare(currentSelectionSessions.size, previousSelectionSessions.size),
      favoritesAddedRawCount: currentFavorites,
      whatsappStarted: compare(currentWhatsappClicks, previousWhatsappClicks),
      whatsappClickRate: compare(currentClickRate, previousClickRate),
      productViewRate: compare(currentProductViewRate, previousProductViewRate),
      selectionRate: compare(currentSelectionRate, previousSelectionRate),
      offersLeadsConfirmed: compare(currentOffersConfirmed, previousOffersConfirmed),
    },
    funnel,
    raioXFunnel,
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
    whatsappBySeller: [
      ...sellerIdsInPeriod.map((sellerId) => ({
        id: sellerId,
        label: sellerNameById.get(sellerId) ?? "Vendedora removida",
        count: sellerEventCounts.get(sellerId) ?? 0,
        secondaryCount: sellerSessionSets.get(sellerId)?.size ?? 0,
      })),
      ...(noSellerSessions.size > 0
        ? [
            {
              id: "sem-vendedora",
              label: "Sem vendedora atribuída",
              count: noSellerEventCount,
              secondaryCount: noSellerSessions.size,
            },
          ]
        : []),
    ].sort((a, b) => b.count - a.count),
    whatsappByDirectionMode: DIRECTION_MODE_BUCKETS.map((bucket) => ({
      id: bucket,
      label: bucket,
      count: directionModeBuckets.get(bucket)?.size ?? 0,
    })),
  };
}
