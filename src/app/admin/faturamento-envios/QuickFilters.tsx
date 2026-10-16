import { filtersToSearchParams, type FulfillmentListFilters, type QuickSituation } from "@/lib/fulfillment/filters";

const CHIPS: { situacao: QuickSituation | ""; label: string }[] = [
  { situacao: "", label: "Todas" },
  { situacao: "ATRASADO", label: "Em atraso" },
  { situacao: "EM_TRANSITO", label: "Em trânsito" },
  { situacao: "AGUARDANDO_ENVIO", label: "Aguardando envio" },
  { situacao: "ENTREGUE", label: "Entregues" },
];

function hrefFor(filters: FulfillmentListFilters, patch: Partial<FulfillmentListFilters>): string {
  const next: FulfillmentListFilters = { ...filters, ...patch, page: 1 };
  const qs = filtersToSearchParams(next, 1).toString();
  return qs ? `/admin/faturamento-envios?${qs}` : "/admin/faturamento-envios";
}

/**
 * Chips de situação (grupo calculado, nunca delivery_status bruto) + toggle
 * "Mostrar entregues". Tudo GET/links, igual ao formulário de filtros
 * avançados — nenhum JS extra. Selecionar um chip sempre limpa `status`
 * (dropdown avançado); os dois são mutuamente exclusivos (ver filters.ts).
 */
export function QuickFilters({ filters }: { filters: FulfillmentListFilters }) {
  // Entregues (chip ou status=DELIVERED no avançado) sempre mostra entregues,
  // então o toggle não tem efeito nenhum nessa visão — mostrado desabilitado
  // pra não sugerir uma ação que não muda nada.
  const forcedDelivered = filters.situacao === "ENTREGUE" || filters.status === "DELIVERED";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {CHIPS.map((chip) => {
        const active = filters.situacao === chip.situacao && !filters.status;
        return (
          <a
            key={chip.label}
            href={hrefFor(filters, { situacao: chip.situacao, status: "" })}
            className={
              active
                ? "rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white"
                : "rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-text-muted hover:bg-muted"
            }
          >
            {chip.label}
          </a>
        );
      })}

      <a
        href={forcedDelivered ? hrefFor(filters, {}) : hrefFor(filters, { mostrarEntregues: !filters.mostrarEntregues })}
        aria-disabled={forcedDelivered}
        className={
          "ml-2 flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium " +
          (forcedDelivered
            ? "cursor-not-allowed border-border/60 text-text-muted/50"
            : filters.mostrarEntregues
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-text-muted hover:bg-muted")
        }
      >
        <span
          className={
            "inline-block h-3.5 w-3.5 rounded-full border " +
            (filters.mostrarEntregues && !forcedDelivered ? "border-primary bg-primary" : "border-text-muted/40")
          }
        />
        Mostrar entregues
      </a>
    </div>
  );
}
