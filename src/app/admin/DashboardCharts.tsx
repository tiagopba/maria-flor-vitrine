import type { DailyPoint, RankingRow } from "@/lib/analytics/dashboard";

export const dashboardCardClass =
  "rounded-2xl border border-black/[0.03] bg-white p-4 shadow-[0_1px_2px_rgba(20,10,20,0.04),0_8px_24px_-16px_rgba(20,10,20,0.12)] sm:p-5";
const CARD_CLASS = dashboardCardClass;

/** Iniciais pra um avatar-monograma — usado nos rankings de produto no
 * lugar de uma foto real (o dashboard não busca imagem do produto, só
 * nome/contagem — ver getDashboardData). Nunca uma foto inventada. */
function initialsFor(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("");
}

const AVATAR_PALETTE = ["#d6217d", "#a855c9", "#f2a6ce", "#7c6fd6", "#e07bb0"];
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Lista ranqueada — barra proporcional ao maior valor (produtos ganham um
 * avatar-monograma à esquerda, mais perto da composição de referência; sem
 * lib de gráfico nenhuma, só CSS/SVG inline). */
export function RankingList({
  title,
  rows,
  emptyLabel,
  withAvatar = false,
}: {
  title: string;
  rows: RankingRow[];
  emptyLabel: string;
  withAvatar?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className={CARD_CLASS}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base text-text">{title}</h3>
        <span className="text-xs text-text-muted">{rows.length > 0 ? (withAvatar ? "Adições" : "Total") : ""}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center gap-3">
              {withAvatar ? (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: avatarColor(row.id) }}
                >
                  {initialsFor(row.label)}
                </div>
              ) : (
                <span className="w-4 shrink-0 text-center text-xs font-medium text-text-muted">{index + 1}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-text">{row.label}</span>
                  <span className="shrink-0 font-medium text-text-muted">{row.count}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;
const CHART_PAD_LEFT = 28;
const CHART_PAD_BOTTOM = 20;
const CHART_PAD_TOP = 12;

function buildLinePath(values: number[], max: number): { line: string; area: string } {
  const innerWidth = CHART_WIDTH - CHART_PAD_LEFT;
  const innerHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const n = values.length;

  const coords = values.map((v, i) => {
    const x = CHART_PAD_LEFT + (n === 1 ? innerWidth / 2 : (i / (n - 1)) * innerWidth);
    const y = CHART_PAD_TOP + innerHeight - (v / max) * innerHeight;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const floorY = CHART_PAD_TOP + innerHeight;
  const area =
    coords.length > 0
      ? `M${coords[0][0].toFixed(1)},${floorY} ` +
        coords.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") +
        ` L${coords[coords.length - 1][0].toFixed(1)},${floorY} Z`
      : "";

  return { line, area };
}

/**
 * Evolução diária — visualizações da vitrine (linha cheia + área) x
 * visualizações de produto (linha tracejada). Mesmos dois números de
 * sempre (dailyEvolution já vem pronto de getDashboardData, sem mudança
 * nenhuma na consulta) — só o desenho vira um gráfico de linha/área de
 * verdade em vez de barras, mais perto da referência.
 */
export function DailyEvolutionChart({ points }: { points: DailyPoint[] }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.pageViews, p.productViews)));
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  const pageViewsPath = buildLinePath(
    points.map((p) => p.pageViews),
    max
  );
  const productViewsPath = buildLinePath(
    points.map((p) => p.productViews),
    max
  );

  // Rótulos do eixo X: todos se couberem, senão só uma amostra pra não
  // amontoar (mesma ideia de qualquer lib de gráfico "real").
  const labelStep = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div className={CARD_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base text-text">Evolução diária</h3>
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" /> Vitrine
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-text-muted" /> Produtos
          </span>
        </div>
      </div>

      {points.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Sem visualizações registradas neste período ainda.</p>
      ) : (
        <div className="mt-4">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-48 w-full sm:h-56"
            preserveAspectRatio="none"
            role="img"
            aria-label="Evolução diária de visualizações da vitrine e de produtos"
          >
            <defs>
              <linearGradient id="dashboardAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {gridLines.map((g) => {
              const y = CHART_PAD_TOP + (CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM) * (1 - g);
              return (
                <g key={g}>
                  <line
                    x1={CHART_PAD_LEFT}
                    x2={CHART_WIDTH}
                    y1={y}
                    y2={y}
                    stroke="var(--color-border)"
                    strokeWidth={1}
                  />
                  <text x={0} y={y + 3} fontSize={9} fill="var(--color-text-muted)">
                    {Math.round(max * g)}
                  </text>
                </g>
              );
            })}

            <path d={pageViewsPath.area} fill="url(#dashboardAreaFill)" />
            <path d={pageViewsPath.line} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            <path
              d={productViewsPath.line}
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth={1.75}
              strokeDasharray="4 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <div className="mt-1 flex text-[10px] text-text-muted">
            {points.map((p, i) => (
              <span key={p.date} className="flex-1 text-center" style={{ visibility: i % labelStep === 0 ? "visible" : "hidden" }}>
                {p.date.slice(8, 10)}/{p.date.slice(5, 7)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
