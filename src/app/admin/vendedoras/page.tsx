import type { Metadata } from "next";
import Link from "next/link";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { listSellersAdmin } from "@/lib/db/sellers";
import { moveSellerAction, toggleSellerActiveAction } from "./actions";

export const metadata: Metadata = { title: "Vendedoras" };

export default async function SellersPage() {
  const sellers = await listSellersAdmin();

  return (
    <div>
      <SuccessToast />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl text-text">Vendedoras</h1>
        <Link href="/admin/vendedoras/nova">
          <Button size="sm">Nova vendedora</Button>
        </Link>
      </div>

      {sellers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          Nenhuma vendedora cadastrada ainda.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sellers.map((seller, index) => (
            <li
              key={seller.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-text">{seller.name}</span>
                  <Badge tone={seller.active ? "primary" : "neutral"}>
                    {seller.active ? "Ativa" : "Inativa"}
                  </Badge>
                  {seller.round_robin && <Badge tone="neutral">Round-robin</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-text-muted">{seller.whatsapp_number}</p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <form action={moveSellerAction.bind(null, seller.id, "up")}>
                  <button
                    type="submit"
                    disabled={index === 0}
                    aria-label="Mover para cima"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-muted disabled:opacity-30"
                  >
                    ↑
                  </button>
                </form>
                <form action={moveSellerAction.bind(null, seller.id, "down")}>
                  <button
                    type="submit"
                    disabled={index === sellers.length - 1}
                    aria-label="Mover para baixo"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-muted disabled:opacity-30"
                  >
                    ↓
                  </button>
                </form>

                <Link
                  href={`/admin/vendedoras/${seller.id}`}
                  className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-muted"
                >
                  Editar
                </Link>

                <form action={toggleSellerActiveAction.bind(null, seller.id, !seller.active)}>
                  <button
                    type="submit"
                    className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-muted"
                  >
                    {seller.active ? "Desativar" : "Ativar"}
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
