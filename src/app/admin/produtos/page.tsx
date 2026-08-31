import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { listCategoriesAdmin } from "@/lib/db/categories";
import { listProductsAdmin, type ListProductsAdminFilters } from "@/lib/db/products";
import { PRODUCT_STATUS_LABELS } from "@/lib/catalog/status";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import { toggleArchiveProductAction } from "./actions";

export const metadata: Metadata = { title: "Produtos" };

const VALID_STATUS_FILTERS = new Set([...Object.keys(PRODUCT_STATUS_LABELS), "ALL"]);

function parseStatusFilter(value: unknown): ListProductsAdminFilters["status"] {
  return typeof value === "string" && VALID_STATUS_FILTERS.has(value)
    ? (value as ListProductsAdminFilters["status"])
    : undefined;
}

export default async function ProductsPage({
  searchParams,
}: PageProps<"/admin/produtos">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;
  const categoryId = typeof params.categoria === "string" ? params.categoria : undefined;
  const status = parseStatusFilter(params.status);

  const [products, categories, paymentSettings] = await Promise.all([
    listProductsAdmin({ search, categoryId, status }),
    listCategoriesAdmin(),
    getPaymentSettings(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl text-text">Produtos</h1>
        <Link href="/admin/produtos/novo">
          <Button size="sm">Novo produto</Button>
        </Link>
      </div>

      <form className="mb-6 flex flex-col gap-2 sm:flex-row" method="get">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Buscar por código ou nome..."
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
        <select
          name="categoria"
          defaultValue={categoryId ?? ""}
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Ativos (exceto arquivados)</option>
          <option value="ALL">Todos os status</option>
          {Object.entries(PRODUCT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          Nenhum produto encontrado com esses filtros.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {products.map((product) => (
            <li
              key={product.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                {product.mainImageUrl ? (
                  <Image
                    src={product.mainImageUrl}
                    alt={product.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-text-muted">
                    Sem foto
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-text">{product.name}</span>
                  <Badge tone={product.status === "ARCHIVED" ? "neutral" : "primary"}>
                    {PRODUCT_STATUS_LABELS[product.status]}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-text-muted">
                  {product.code} · {product.categoryName ?? "Sem categoria"} ·{" "}
                  {new Date(product.created_at).toLocaleDateString("pt-BR")}
                </p>
                <div className="mt-1">
                  <Price product={product} paymentSettings={paymentSettings} />
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  href={`/admin/produtos/${product.id}`}
                  className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-muted"
                >
                  Editar
                </Link>
                <Link
                  href={`/admin/produtos/novo?duplicar=${product.id}`}
                  className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-muted"
                >
                  Duplicar
                </Link>
                <form action={toggleArchiveProductAction.bind(null, product.id, product.status !== "ARCHIVED")}>
                  <button
                    type="submit"
                    className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-muted"
                  >
                    {product.status === "ARCHIVED" ? "Reativar" : "Arquivar"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
