"use client";

import { useEffect, useState } from "react";
import type { RealtimePresenceState } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { PRESENCE_CHANNEL_NAME, type PageType, type PresenceMeta } from "@/lib/presence/constants";
import { dashboardCardClass } from "./DashboardCharts";

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  PRODUTO: "Produtos",
  NOVIDADES: "Novidades",
  CATEGORIA: "Categorias",
  FAVORITOS: "Minhas Roupas",
  HOME: "Início",
  SELECAO: "Seleção compartilhada",
  OUTROS: "Outras páginas",
};

const DISPLAY_ORDER: PageType[] = ["PRODUTO", "NOVIDADES", "CATEGORIA", "FAVORITOS", "HOME", "SELECAO", "OUTROS"];

type ConnectionState = "connecting" | "ready" | "error";

/**
 * Conta visitantes ÚNICOS (não abas): agrupa a presenceState pelo
 * presenceId (chave do Presence) e só considera "online" quem tiver
 * pelo menos uma aba com `visible: true`. Com várias abas visíveis do
 * mesmo visitante, usa a `updated_at` mais recente para decidir o
 * `page_type` do breakdown.
 */
function computeVisitors(state: RealtimePresenceState<PresenceMeta>) {
  let total = 0;
  const breakdown: Partial<Record<PageType, number>> = {};

  for (const key of Object.keys(state)) {
    const presences = state[key].filter((p) => p.visible === true);
    if (presences.length === 0) continue;

    total++;
    const latest = presences.reduce((a, b) => (a.updated_at > b.updated_at ? a : b));
    breakdown[latest.page_type] = (breakdown[latest.page_type] ?? 0) + 1;
  }

  return { total, breakdown };
}

/**
 * Card isolado do Dashboard — conecta direto ao MESMO canal Presence do
 * SitePresenceTracker, só observando (nunca chama `track()`, nunca
 * grava nada). Não espera getDashboardData: o Admin renderiza este
 * componente de cliente junto com o resto da página server-rendered, e
 * ele resolve sua própria conexão de forma totalmente independente —
 * uma falha aqui nunca derruba o resto do Dashboard.
 */
export function RealtimeVisitorsCard() {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [total, setTotal] = useState(0);
  const [breakdown, setBreakdown] = useState<Partial<Record<PageType, number>>>({});

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const channel = supabase.channel(PRESENCE_CHANNEL_NAME);

    function refresh() {
      if (cancelled) return;
      const raw = channel.presenceState<PresenceMeta>();
      const computed = computeVisitors(raw);
      setTotal(computed.total);
      setBreakdown(computed.breakdown);
    }

    channel
      .on("presence", { event: "sync" }, refresh)
      .on("presence", { event: "join" }, refresh)
      .on("presence", { event: "leave" }, refresh)
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setState("ready");
          refresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setState("error");
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const dot = state === "ready" ? "🟢" : state === "error" ? "🔴" : "⚪";
  const showBreakdown = state === "ready" && total > 0;

  return (
    <div className={dashboardCardClass}>
      <h3 className="flex items-center gap-1.5 font-display text-base text-text">
        <span aria-hidden="true">{dot}</span> Visitantes online agora
      </h3>

      <p className="mt-2 text-3xl font-semibold text-text">{state === "ready" ? total : "—"}</p>

      <p className="mt-0.5 text-xs text-text-muted">
        {state === "error" ? "Tempo real indisponível" : "Atualizado em tempo real"}
      </p>

      {showBreakdown && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-black/[0.04] pt-3 text-sm">
          {DISPLAY_ORDER.filter((pt) => breakdown[pt]).map((pt) => (
            <li key={pt} className="flex items-center justify-between text-text-muted">
              <span>{PAGE_TYPE_LABELS[pt]}</span>
              <span className="font-medium text-text">{breakdown[pt]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
