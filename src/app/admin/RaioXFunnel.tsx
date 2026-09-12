import type { RaioXFunnelData } from "@/lib/analytics/dashboard";
import { dashboardCardClass } from "./DashboardCharts";

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * "Raio-X do Funil" — 5 etapas reais do fluxo público (Visualizou produto
 * → Clicou em Quero essa peça → Adicionou às Minhas Roupas → Abriu Minhas
 * Roupas → Clicou em Comprar), cada uma sessões distintas no período (ver
 * getDashboardData/RaioXFunnelStep). Seção nova e separada do "Funil da
 * Vitrine" (ConversionFunnel, em DashboardFunnel.tsx) — não substitui nem
 * altera aquele, os dois convivem no Dashboard.
 *
 * Entre cada etapa mostra "↓ X% abandonaram" — a etapa com a maior
 * porcentagem aqui é o maior vazamento do funil no período selecionado.
 * Nenhum cálculo de elegibilidade/compra é feito aqui; é só leitura de
 * sessões distintas por evento já existente.
 */
export function RaioXFunnel({ data }: { data: RaioXFunnelData }) {
  const maxSessions = Math.max(1, ...data.steps.map((s) => s.sessions));

  return (
    <div className={dashboardCardClass}>
      <h3 className="font-display text-base text-text">Raio-X do Funil</h3>
      <p className="mt-1 text-xs text-text-muted">
        Sessões distintas em cada etapa do fluxo público, no período selecionado.
      </p>

      <ul className="mt-4 flex flex-col gap-1">
        {data.steps.map((step, index) => (
          <li key={step.id}>
            {index > 0 && step.dropoffFromPreviousPct !== null && (
              <p className="py-1.5 text-xs font-medium text-red-600">
                ↓ {formatPercent(step.dropoffFromPreviousPct)} abandonaram
              </p>
            )}
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-text">{step.label}</span>
              <span className="font-medium text-text">{step.sessions} sessões</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, (step.sessions / maxSessions) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
