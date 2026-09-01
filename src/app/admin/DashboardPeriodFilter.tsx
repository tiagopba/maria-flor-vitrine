import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DashboardPeriod } from "@/lib/analytics/dashboard";

const OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "month", label: "Mês atual" },
];

/**
 * Filtro de período via query param (`?period=`) — mesmo padrão de
 * ProductFilters no site público: navegação normal por link, sem estado
 * client nem JS extra, a própria página do servidor re-renderiza com o
 * período novo.
 */
export function DashboardPeriodFilter({ current }: { current: DashboardPeriod }) {
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((opt) => (
        <Link
          key={opt.value}
          href={`/admin?period=${opt.value}`}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            current === opt.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-text-muted hover:bg-muted"
          )}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}
