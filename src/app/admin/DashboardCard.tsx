import { cn } from "@/lib/utils";
import type { MetricComparison } from "@/lib/analytics/dashboard";

/** Card de métrica com comparação % vs. o período anterior (mesmo tamanho
 * de janela, ver resolvePeriodRanges) — seta pra cima/baixo colorida,
 * "—" quando o período anterior não teve nenhum evento (não dá pra calcular %). */
export function DashboardCard({
  label,
  comparison,
  formatValue = (n) => String(Math.round(n)),
  hint,
}: {
  label: string;
  comparison: MetricComparison;
  formatValue?: (value: number) => string;
  hint?: string;
}) {
  const delta = comparison.deltaPct;
  const rounded = delta === null ? null : Math.round(delta);

  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-text">{formatValue(comparison.current)}</p>
      <div className="mt-1 flex items-center gap-1 text-xs">
        {rounded === null ? (
          <span className="text-text-muted">sem período anterior</span>
        ) : (
          <span className={cn("font-medium", rounded >= 0 ? "text-emerald-600" : "text-red-600")}>
            {rounded >= 0 ? "▲" : "▼"} {Math.abs(rounded)}%
          </span>
        )}
        <span className="text-text-muted">vs. período anterior</span>
      </div>
      {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}
