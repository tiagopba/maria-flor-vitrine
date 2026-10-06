import type { Metadata } from "next";
import Link from "next/link";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { Button, buttonClasses } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/auth/permissions";
import { FULFILLMENT_PAGE_SIZE, getFulfillmentFilterOptions, listFulfillmentRecords } from "@/lib/db/fulfillment";
import {
  ALL_DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS,
  UNKNOWN_SELLER_LABEL,
  formatOriginLabel,
} from "@/lib/fulfillment/delivery";
import { BR_STATES, FILTER_NONE, filtersToSearchParams, parseListFilters } from "@/lib/fulfillment/filters";
import { FulfillmentTabs } from "./FulfillmentTabs";
import { RecordsTable } from "./RecordsTable";

export const metadata: Metadata = { title: "Faturamento e Envios" };

const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary";

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-text-muted">
      {label}
      {children}
    </label>
  );
}

export default async function FulfillmentPage({ searchParams }: PageProps<"/admin/faturamento-envios">) {
  await requireAdmin(["admin", "master"]);

  const filters = parseListFilters(await searchParams);
  const [result, options] = await Promise.all([listFulfillmentRecords(filters), getFulfillmentFilterOptions()]);

  const hasFilters = Boolean(
    filters.query ||
      filters.saleFrom ||
      filters.saleTo ||
      filters.seller ||
      filters.origin ||
      filters.carrier ||
      filters.status ||
      filters.state
  );
  const sellerNames = Object.fromEntries(options.sellers.map((s) => [s.id, s.name]));
  // Mantém no select uma transportadora/origem filtrada mesmo que nenhum registro a use mais.
  const carriers = [...new Set([...options.carriers, ...(filters.carrier ? [filters.carrier] : [])])].sort();
  const origins = [
    ...new Set([...options.origins, ...(filters.origin && filters.origin !== FILTER_NONE ? [filters.origin] : [])]),
  ].sort();

  const pageHref = (page: number) => {
    const qs = filtersToSearchParams(filters, page).toString();
    return qs ? `/admin/faturamento-envios?${qs}` : "/admin/faturamento-envios";
  };

  return (
    <div>
      <SuccessToast />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-text">Faturamento e Envios</h1>
        <Link href="/admin/faturamento-envios/pre/nova" className={buttonClasses({ size: "md" })}>
          + NOVA VENDA
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <FulfillmentTabs active="envios" />
        <Link href="/admin/faturamento-envios/novo" className="pb-3 text-xs text-text-muted hover:text-text">
          Cadastro manual
        </Link>
      </div>

      <form method="get" autoComplete="off" className="mb-6 flex flex-col gap-3">
        <input
          type="search"
          name="q"
          defaultValue={filters.query}
          placeholder="Buscar por nome, CPF, número da NF-e ou rastreio..."
          aria-label="Buscar registros"
          className={FIELD_CLASS}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="Venda de">
            <input type="date" name="de" defaultValue={filters.saleFrom} className={FIELD_CLASS} />
          </FilterField>
          <FilterField label="Venda até">
            <input type="date" name="ate" defaultValue={filters.saleTo} className={FIELD_CLASS} />
          </FilterField>
          <FilterField label="Vendedora">
            <select name="vendedora" defaultValue={filters.seller} className={FIELD_CLASS}>
              <option value="">Todas</option>
              {options.sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                  {seller.active ? "" : " (inativa)"}
                </option>
              ))}
              <option value={FILTER_NONE}>{UNKNOWN_SELLER_LABEL}</option>
            </select>
          </FilterField>
          <FilterField label="Origem">
            <select name="origem" defaultValue={filters.origin} className={FIELD_CLASS}>
              <option value="">Todas</option>
              {origins.map((origin) => (
                <option key={origin} value={origin}>
                  {formatOriginLabel(origin)}
                </option>
              ))}
              <option value={FILTER_NONE}>Origem não informada</option>
            </select>
          </FilterField>
          <FilterField label="Transportadora">
            <select name="transportadora" defaultValue={filters.carrier} className={FIELD_CLASS}>
              <option value="">Todas</option>
              {carriers.map((carrier) => (
                <option key={carrier} value={carrier}>
                  {carrier}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Status">
            <select name="status" defaultValue={filters.status} className={FIELD_CLASS}>
              <option value="">Todos</option>
              {ALL_DELIVERY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {DELIVERY_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="UF">
            <select name="uf" defaultValue={filters.state} className={FIELD_CLASS}>
              <option value="">Todas</option>
              {BR_STATES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </FilterField>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" className="h-10">
            Buscar
          </Button>
          {hasFilters && (
            <Link
              href="/admin/faturamento-envios"
              className="flex h-10 items-center justify-center rounded-full px-4 text-sm text-text-muted hover:bg-muted"
            >
              Limpar filtros
            </Link>
          )}
        </div>
      </form>

      {result.status === "unavailable" ? (
        <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-900">
          O módulo ainda não foi ativado neste banco de dados (a migration{" "}
          <code>20261005120000_fulfillment_records</code> ainda não foi aplicada).
        </div>
      ) : result.records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          {hasFilters ? "Nenhum registro encontrado para esta busca." : "Nenhum registro ainda. Comece por + NOVA VENDA."}
        </div>
      ) : (
        <>
          <RecordsTable records={result.records} sellerNames={sellerNames} />

          {(filters.page > 1 || result.hasMore) && (
            <div className="mt-4 flex items-center justify-between text-sm">
              {filters.page > 1 ? (
                <Link href={pageHref(filters.page - 1)} className="text-text-muted hover:text-text">
                  ← Mais recentes
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-muted">
                Página {filters.page} · {FULFILLMENT_PAGE_SIZE} por página
              </span>
              {result.hasMore ? (
                <Link href={pageHref(filters.page + 1)} className="text-text-muted hover:text-text">
                  Mais antigos →
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
