import type { RankingRow } from "@/lib/analytics/dashboard";

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
 * lib de gráfico nenhuma, só CSS/SVG inline).
 *
 * `primaryUnitLabel`/`secondaryUnitLabel`: quando o ranking é por sessões
 * distintas (ver topNBySessions em lib/analytics/dashboard.ts), cada linha
 * mostra as duas contagens — "31 sessões interessadas" (métrica principal,
 * `row.count`) e, discretamente, "43 visualizações" (`row.secondaryCount`,
 * o total bruto de eventos). Omitir os dois props mantém o comportamento
 * antigo (só um número), usado pelos rankings que já eram por sessão
 * (dispositivos, origem do tráfego).
 */
export function RankingList({
  title,
  rows,
  emptyLabel,
  withAvatar = false,
  primaryUnitLabel,
  secondaryUnitLabel,
}: {
  title: string;
  rows: RankingRow[];
  emptyLabel: string;
  withAvatar?: boolean;
  primaryUnitLabel?: string;
  secondaryUnitLabel?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className={CARD_CLASS}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base text-text">{title}</h3>
        <span className="text-xs text-text-muted">
          {rows.length > 0 ? (primaryUnitLabel ? "Sessões" : withAvatar ? "Adições" : "Total") : ""}
        </span>
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
                  <span className="shrink-0 text-right">
                    <span className="font-medium text-text-muted">
                      {row.count}
                      {primaryUnitLabel ? ` ${primaryUnitLabel}` : ""}
                    </span>
                    {secondaryUnitLabel && row.secondaryCount !== undefined && (
                      <span className="block text-[10px] font-normal text-text-muted/70">
                        {row.secondaryCount} {secondaryUnitLabel}
                      </span>
                    )}
                  </span>
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

