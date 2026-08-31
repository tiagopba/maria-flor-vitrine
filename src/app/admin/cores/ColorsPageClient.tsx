"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Color } from "@/lib/db/colors";
import { cn } from "@/lib/utils";
import { toggleColorActiveAction } from "./actions";
import { ColorFormDrawer } from "./ColorFormDrawer";

export function ColorsPageClient({ colors }: { colors: Color[] }) {
  const [drawerColor, setDrawerColor] = useState<Color | null | undefined>(undefined);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl text-text">Cores</h1>
        <Button size="sm" onClick={() => setDrawerColor(null)}>
          Nova cor
        </Button>
      </div>

      {colors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          Nenhuma cor ainda. Crie a primeira para usar no cadastro de produtos.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {colors.map((color) => (
            <li
              key={color.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {color.hex_color && (
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-border/60"
                    style={{ backgroundColor: color.hex_color }}
                  />
                )}
                <span className="truncate font-medium text-text">{color.name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    color.active ? "bg-primary/10 text-primary" : "bg-muted text-text-muted"
                  )}
                >
                  {color.active ? "Ativa" : "Inativa"}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDrawerColor(color)}
                  className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-muted"
                >
                  Editar
                </button>
                <form action={toggleColorActiveAction.bind(null, color.id, !color.active)}>
                  <button
                    type="submit"
                    className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-muted"
                  >
                    {color.active ? "Desativar" : "Ativar"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ColorFormDrawer
        key={drawerColor === undefined ? "closed" : (drawerColor?.id ?? "new")}
        open={drawerColor !== undefined}
        onClose={() => setDrawerColor(undefined)}
        color={drawerColor ?? null}
      />
    </div>
  );
}
