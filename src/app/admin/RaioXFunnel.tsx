import type { RaioXFunnelData } from "@/lib/analytics/dashboard";
import { dashboardCardClass } from "./DashboardCharts";

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * "Raio-X do Funil" — funil SEQUENCIAL real (Visualizou produto → Clicou
 * em EU QUERO → Adicionou às Minhas Roupas → Abriu Minhas Roupas →
 * Completou o funil e clicou em COMPRAR): cada etapa é a coorte de sessões que completou
 * TODAS as anteriores, em ordem temporal, no período (ver
 * getDashboardData/computeSequentialFunnelCounts) — nunca 5 contagens
 * independentes. Por construção, `sessions` nunca cresce de uma etapa pra
 * próxima, `dropoffFromPreviousPct` nunca é negativo. Seção separada do
 * "Funil da Vitrine" (ConversionFunnel, em DashboardFunnel.tsx, que
 * continua contando por evento independente) — não substitui nem altera
 * aquele, os dois convivem no Dashboard.
 *
 * Entre cada etapa mostra "↓ X% abandonaram" — a etapa com a maior
 * porcentagem aqui é o maior vazamento do funil no período selecionado.
 * Nenhum cálculo de elegibilidade/compra é feito aqui; é só leitura de
 * sessões já existentes, reorganizadas em ordem.
 */
export function RaioXFunnel({
  data,
  whatsappSessions,
}: {
  data: RaioXFunnelData;
  /** `funnel.whatsappSessions` (mesma base do card "Cliques no botão
   * COMPRAR", já calculada em getDashboardData) — sessões distintas com
   * FAVORITES_WHATSAPP_CLICK no período, SEM exigir ordem/etapas
   * anteriores. Deliberadamente diferente da última etapa deste funil
   * sequencial (data.steps, última posição) — as duas convivem lado a
   * lado abaixo do funil pra deixar claro que medem coisas diferentes,
   * nunca pra fazer os números baterem. */
  whatsappSessions: number;
}) {
  const maxSessions = Math.max(1, ...data.steps.map((s) => s.sessions));
  const completedFunnelSessions = data.steps[data.steps.length - 1]?.sessions ?? 0;

  return (
    <div className={dashboardCardClass}>
      <h3 className="font-display text-base text-text">Raio-X do Funil</h3>
      <p className="mt-1 text-xs text-text-muted">
        Funil sequencial: sessões que completaram cada etapa e todas as anteriores, no período selecionado.
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

      {/* Discreto de propósito: esclarece a diferença entre "clicou em
          COMPRAR" (qualquer sessão, sem exigir etapas anteriores) e
          "completou este funil sequencial" — nunca para fazer os dois
          números baterem, eles medem coisas diferentes. */}
      <p className="mt-3 border-t border-black/[0.04] pt-3 text-xs text-text-muted">
        {whatsappSessions} sessões clicaram em COMPRAR no período
        <br />
        {completedFunnelSessions} completaram todas as etapas deste funil no período
      </p>
    </div>
  );
}
