import type { Metadata } from "next";
import Link from "next/link";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { Button } from "@/components/ui/Button";
import { listCategoriesAdmin } from "@/lib/db/categories";
import { cn } from "@/lib/utils";
import { moveCategoryAction, toggleCategoryActiveAction } from "./actions";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriesPage() {
  const categories = await listCategoriesAdmin();

  return (
    <div>
      <SuccessToast />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl text-text">Categorias</h1>
        <Link href="/admin/categorias/nova">
          <Button size="sm">Nova categoria</Button>
        </Link>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          Nenhuma categoria ainda. Crie a primeira para organizar a vitrine.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((category, index) => (
            <li
              key={category.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-text">{category.name}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      category.active
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-text-muted"
                    )}
                  >
                    {category.active ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-text-muted">
                  /{category.slug} · {category.productCount}{" "}
                  {category.productCount === 1 ? "produto" : "produtos"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <form action={moveCategoryAction.bind(null, category.id, "up")}>
                  <button
                    type="submit"
                    disabled={index === 0}
                    aria-label="Mover para cima"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-muted disabled:opacity-30"
                  >
                    ↑
                  </button>
                </form>
                <form action={moveCategoryAction.bind(null, category.id, "down")}>
                  <button
                    type="submit"
                    disabled={index === categories.length - 1}
                    aria-label="Mover para baixo"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-muted disabled:opacity-30"
                  >
                    ↓
                  </button>
                </form>

                <Link
                  href={`/admin/categorias/${category.id}`}
                  className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-muted"
                >
                  Editar
                </Link>

                <form action={toggleCategoryActiveAction.bind(null, category.id, !category.active)}>
                  <button
                    type="submit"
                    className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-muted"
                  >
                    {category.active ? "Desativar" : "Ativar"}
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
