"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { SizeOption } from "@/lib/db/sizes";
import { cn } from "@/lib/utils";
import { moveSizeOptionAction, toggleSizeOptionActiveAction } from "./actions";
import { SizeFormDrawer } from "./SizeFormDrawer";

export function SizesPageClient({ sizes }: { sizes: SizeOption[] }) {
  const [drawerSize, setDrawerSize] = useState<SizeOption | null | undefined>(undefined);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl text-text">Tamanhos</h1>
        <Button size="sm" onClick={() => setDrawerSize(null)}>
          Novo tamanho
        </Button>
      </div>

      {sizes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          Nenhum tamanho ainda. Crie o primeiro para usar no cadastro de produtos.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sizes.map((size, index) => (
            <li
              key={size.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-medium text-text">{size.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    size.active ? "bg-primary/10 text-primary" : "bg-muted text-text-muted"
                  )}
                >
                  {size.active ? "Ativo" : "Inativo"}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <form action={moveSizeOptionAction.bind(null, size.id, "up")}>
                  <button
                    type="submit"
                    disabled={index === 0}
                    aria-label="Mover para cima"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-muted disabled:opacity-30"
                  >
                    ↑
                  </button>
                </form>
                <form action={moveSizeOptionAction.bind(null, size.id, "down")}>
                  <button
                    type="submit"
                    disabled={index === sizes.length - 1}
                    aria-label="Mover para baixo"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-muted disabled:opacity-30"
                  >
                    ↓
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => setDrawerSize(size)}
                  className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-muted"
                >
                  Renomear
                </button>

                <form action={toggleSizeOptionActiveAction.bind(null, size.id, !size.active)}>
                  <button
                    type="submit"
                    className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-muted"
                  >
                    {size.active ? "Desativar" : "Ativar"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SizeFormDrawer
        key={drawerSize === undefined ? "closed" : (drawerSize?.id ?? "new")}
        open={drawerSize !== undefined}
        onClose={() => setDrawerSize(undefined)}
        size={drawerSize ?? null}
      />
    </div>
  );
}
