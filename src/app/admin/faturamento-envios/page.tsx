import type { Metadata } from "next";
import Link from "next/link";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { Button } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/auth/permissions";
import { FULFILLMENT_PAGE_SIZE, listFulfillmentRecords } from "@/lib/db/fulfillment";
import { RecordsTable } from "./RecordsTable";

export const metadata: Metadata = { title: "Faturamento e Envios" };

function pageHref(query: string, date: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (date) params.set("data", date);
  if (page > 1) params.set("pagina", String(page));
  const qs = params.toString();
  return qs ? `/admin/faturamento-envios?${qs}` : "/admin/faturamento-envios";
}

export default async function FulfillmentPage({ searchParams }: PageProps<"/admin/faturamento-envios">) {
  await requireAdmin(["admin", "master"]);

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const date = typeof params.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? params.data : "";
  const pageParam = typeof params.pagina === "string" ? Number.parseInt(params.pagina, 10) : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const result = await listFulfillmentRecords({ query, date, page });
  const hasFilters = Boolean(query || date);

  return (
    <div>
      <SuccessToast />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-text">Faturamento e Envios</h1>
        <Link href="/admin/faturamento-envios/novo">
          <Button size="md">NOVO REGISTRO</Button>
        </Link>
      </div>

      <form method="get" autoComplete="off" className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nome, CPF, número da NF-e ou rastreio..."
          aria-label="Buscar registros"
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
        <input
          type="date"
          name="data"
          defaultValue={date}
          aria-label="Filtrar por data"
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <Button type="submit" size="sm" className="h-10">
          Buscar
        </Button>
        {hasFilters && (
          <Link
            href="/admin/faturamento-envios"
            className="flex h-10 items-center justify-center rounded-full px-4 text-sm text-text-muted hover:bg-muted"
          >
            Limpar
          </Link>
        )}
      </form>

      {result.status === "unavailable" ? (
        <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-900">
          O módulo ainda não foi ativado neste banco de dados (a migration{" "}
          <code>20261005120000_fulfillment_records</code> ainda não foi aplicada).
        </div>
      ) : result.records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          {hasFilters ? "Nenhum registro encontrado para esta busca." : "Nenhum registro ainda. Clique em NOVO REGISTRO."}
        </div>
      ) : (
        <>
          <RecordsTable records={result.records} />

          {(page > 1 || result.hasMore) && (
            <div className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={pageHref(query, date, page - 1)} className="text-text-muted hover:text-text">
                  ← Mais recentes
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-muted">
                Página {page} · {FULFILLMENT_PAGE_SIZE} por página
              </span>
              {result.hasMore ? (
                <Link href={pageHref(query, date, page + 1)} className="text-text-muted hover:text-text">
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
