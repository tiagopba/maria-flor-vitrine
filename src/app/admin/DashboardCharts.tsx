import type { DailyPoint, RankingRow } from "@/lib/analytics/dashboard";

/** Lista ranqueada com barra proporcional ao maior valor — sem lib de
 * gráfico nenhuma, só CSS (largura em %); suficiente pro MVP e não pesa o
 * bundle do admin. */
export function RankingList({ title, rows, emptyLabel }: { title: string; rows: RankingRow[]; emptyLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="rounded-2xl border border-border p-4">
      <h3 className="font-display text-base text-text">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-text">{row.label}</span>
                <span className="shrink-0 font-medium text-text-muted">{row.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Barras diárias (visualizações da vitrine x de produto) — mesmo espírito
 * de RankingList: CSS puro, sem lib de gráfico. */
export function DailyEvolutionChart({ points }: { points: DailyPoint[] }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.pageViews, p.productViews)));

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base text-text">Evolução diária</h3>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-primary" /> Vitrine
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-text-muted" /> Produtos
          </span>
        </div>
      </div>

      {points.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Sem visualizações registradas neste período ainda.</p>
      ) : (
        <div className="mt-4 flex h-32 items-end gap-1.5 overflow-x-auto">
          {points.map((point) => (
            <div key={point.date} className="flex min-w-[28px] flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center gap-0.5">
                <div
                  className="w-2 rounded-t bg-primary"
                  style={{ height: `${Math.max(2, (point.pageViews / max) * 100)}%` }}
                  title={`${point.pageViews} visualizações da vitrine`}
                />
                <div
                  className="w-2 rounded-t bg-text-muted/60"
                  style={{ height: `${Math.max(2, (point.productViews / max) * 100)}%` }}
                  title={`${point.productViews} visualizações de produto`}
                />
              </div>
              <span className="text-[10px] text-text-muted">{point.date.slice(8, 10)}/{point.date.slice(5, 7)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
