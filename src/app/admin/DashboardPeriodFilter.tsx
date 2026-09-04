import Link from "next/link";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolvePeriodRanges, type DashboardPeriod } from "@/lib/analytics/dashboard";

const OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "month", label: "Mês atual" },
];

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Filtro de período via query param (`?period=`) — mesmo mecanismo de
 * antes (navegação normal por link, sem estado client), só reskinado como
 * um controle segmentado único + os dois intervalos de data reais
 * (calculados por `resolvePeriodRanges`, já existente e inalterado — só
 * consumido aqui pra exibição).
 */
export function DashboardPeriodFilter({ current }: { current: DashboardPeriod }) {
  const { current: currentRange, previous: previousRange } = resolvePeriodRanges(current);

  // "Ontem" tem fim exclusivo (meia-noite de hoje) só pra consulta — pra
  // exibição, mostra o último instante do próprio dia anterior, senão a
  // data mostrada pareceria "hoje" em vez de "ontem".
  const displayEnd = current === "yesterday" ? new Date(currentRange.end.getTime() - 1) : currentRange.end;
  const displayPreviousEnd = current === "yesterday" ? new Date(previousRange.end.getTime() - 1) : previousRange.end;

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex items-center gap-1 rounded-full border border-black/[0.04] bg-white p-1 shadow-[0_1px_2px_rgba(20,10,20,0.04),0_8px_24px_-16px_rgba(20,10,20,0.12)]">
        {OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={`/admin?period=${opt.value}`}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              current === opt.value ? "bg-primary text-primary-foreground" : "text-text-muted hover:bg-muted"
            )}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-col items-start gap-1 text-xs text-text-muted sm:items-end">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} />
          {formatDate(currentRange.start)} – {formatDate(displayEnd)}
        </span>
        <span>
          Comparando com {formatDate(previousRange.start)} – {formatDate(displayPreviousEnd)}
        </span>
      </div>
    </div>
  );
}
