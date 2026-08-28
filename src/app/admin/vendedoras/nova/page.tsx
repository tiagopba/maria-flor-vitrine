import type { Metadata } from "next";
import Link from "next/link";
import { createSellerAction } from "../actions";
import { SellerForm } from "../SellerForm";

export const metadata: Metadata = { title: "Nova vendedora" };

export default function NewSellerPage() {
  return (
    <div className="max-w-md">
      <Link href="/admin/vendedoras" className="text-sm text-text-muted hover:text-text">
        ← Vendedoras
      </Link>
      <h1 className="mb-6 mt-2 font-display text-2xl text-text">Nova vendedora</h1>
      <SellerForm action={createSellerAction} submitLabel="Salvar vendedora" />
    </div>
  );
}
