import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MetricComparison } from "@/lib/analytics/dashboard";

/** Card de métrica com comparação % vs. o período anterior (mesmo tamanho
 * de janela, ver resolvePeriodRanges) — seta pra cima/baixo colorida,
 * "sem período anterior" quando o período anterior não teve nenhum evento
 * (não dá pra calcular %). */
export function DashboardCard({
  label,
  comparison,
  icon: Icon,
  formatValue = (n) => String(Math.round(n)),
  hint,
}: {
  label: string;
  comparison: MetricComparison;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  formatValue?: (value: number) => string;
  hint?: string;
}) {
  const delta = comparison.deltaPct;
  const rounded = delta === null ? null : Math.round(delta);
  const positive = rounded !== null && rounded >= 0;

  return (
    <div className="rounded-2xl border border-black/[0.03] bg-white p-4 shadow-[0_1px_2px_rgba(20,10,20,0.04),0_8px_24px_-16px_rgba(20,10,20,0.12)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} />
      </div>

      <p className="mt-3 text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-text">{formatValue(comparison.current)}</p>

      <div className="mt-1.5 flex items-center gap-1 text-xs">
        {rounded === null ? (
          <span className="text-text-muted">sem período anterior</span>
        ) : (
          <>
            <span className={cn("flex items-center gap-0.5 font-medium", positive ? "text-emerald-600" : "text-red-600")}>
              {positive ? (
                <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {Math.abs(rounded)}%
            </span>
            <span className="text-text-muted">vs. período anterior</span>
          </>
        )}
      </div>
      {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}
