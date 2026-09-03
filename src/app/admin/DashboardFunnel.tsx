import type { FunnelData, RankingRow } from "@/lib/analytics/dashboard";
import { dashboardCardClass } from "./DashboardCharts";

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

const FUNNEL_STEPS: { key: keyof FunnelData; label: string }[] = [
  { key: "visitSessions", label: "Visitou a vitrine" },
  { key: "productViewSessions", label: "Visualizou um produto" },
  { key: "selectionSessions", label: "Adicionou à Minha Seleção" },
  { key: "whatsappSessions", label: "Iniciou conversa no WhatsApp" },
];

/**
 * Funil da Vitrine — cada etapa conta sessões distintas (não eventos
 * brutos, ver FunnelData/getDashboardData), sem exigir que uma sessão
 * tenha passado pelas etapas em ordem. O percentual mostrado em cada
 * etapa (a partir da 2ª) é sempre relativo à etapa ANTERIOR — taxa de
 * passagem entre elas, não uma fração do total.
 */
export function ConversionFunnel({ funnel }: { funnel: FunnelData }) {
  const values = FUNNEL_STEPS.map((step) => funnel[step.key]);
  const max = Math.max(1, values[0]);

  return (
    <div className={dashboardCardClass}>
      <h3 className="font-display text-base text-text">Funil da Vitrine</h3>
      <p className="mt-1 text-xs text-text-muted">Sessões únicas em cada etapa, no período selecionado.</p>

      <ul className="mt-4 flex flex-col gap-3">
        {FUNNEL_STEPS.map((step, index) => {
          const value = values[index];
          const previousValue = index > 0 ? values[index - 1] : null;
          const stepRate = previousValue !== null ? (previousValue > 0 ? (value / previousValue) * 100 : 0) : null;

          return (
            <li key={step.key}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-text">{step.label}</span>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-text">{value}</span>
                  {stepRate !== null && <span className="text-xs text-text-muted">({formatPercent(stepRate)})</span>}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Resumo de dispositivos — Mobile/Desktop/Outros, sempre as 3 categorias
 * (mesmo quando zeradas), com quantidade E percentual de sessões (não só
 * a barra proporcional que RankingList usa nos outros rankings).
 */
export function DeviceBreakdown({ devices }: { devices: RankingRow[] }) {
  const total = devices.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className={dashboardCardClass}>
      <h3 className="font-display text-base text-text">Dispositivos</h3>

      {total === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Sem sessões registradas neste período.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {devices.map((device) => {
            const pct = (device.count / total) * 100;
            return (
              <li key={device.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-text">{device.label}</span>
                  <span className="text-text-muted">
                    <span className="font-medium text-text">{device.count}</span> ({formatPercent(pct)})
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
