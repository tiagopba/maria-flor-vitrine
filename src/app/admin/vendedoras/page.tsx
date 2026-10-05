import type { Metadata } from "next";
import Link from "next/link";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { Button } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/auth/permissions";
import { listSellersAdmin } from "@/lib/db/sellers";
import {
  moveSellerAction,
  reactivateSellerAction,
  renameSellerAction,
  toggleSellerActiveAction,
} from "./actions";
import { SellersList } from "./SellersList";

export const metadata: Metadata = { title: "Vendedoras" };

export default async function SellersPage({ searchParams }: PageProps<"/admin/vendedoras">) {
  await requireAdmin(["admin", "master"]);
  const [sellers, params] = await Promise.all([listSellersAdmin(), searchParams]);
  const errorMessage = typeof params.erro === "string" ? params.erro : null;

  return (
    <div className="max-w-3xl">
      <SuccessToast />
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-text">Vendedoras</h1>
        <Link href="/admin/vendedoras/nova">
          <Button size="sm">NOVA VENDEDORA</Button>
        </Link>
      </div>
      <p className="mb-6 text-sm text-text-muted">
        Quando alguém sai da loja, use <strong>DESATIVAR</strong>: ela deixa de aparecer para novas vendas e no
        WhatsApp, e os pedidos antigos continuam mostrando o nome dela. Para uma pessoa nova, use{" "}
        <strong>NOVA VENDEDORA</strong> (nunca renomeie uma vendedora para outra pessoa). Vendedoras não são
        excluídas.
      </p>

      {errorMessage && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {sellers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          Nenhuma vendedora cadastrada ainda.
        </div>
      ) : (
        <SellersList
          sellers={sellers}
          actions={{
            rename: (id) => renameSellerAction.bind(null, id),
            reactivate: (id) => reactivateSellerAction.bind(null, id),
            setActive: (id, active) => toggleSellerActiveAction.bind(null, id, active),
            move: (id, direction) => moveSellerAction.bind(null, id, direction),
          }}
        />
      )}
    </div>
  );
}
