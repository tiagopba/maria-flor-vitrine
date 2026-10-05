import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/permissions";
import { createSellerAction } from "../actions";
import { SellerForm } from "../SellerForm";

export const metadata: Metadata = { title: "Nova vendedora" };

export default async function NewSellerPage() {
  await requireAdmin(["admin", "master"]);

  return (
    <div className="max-w-md">
      <Link href="/admin/vendedoras" className="text-sm text-text-muted hover:text-text">
        ← Vendedoras
      </Link>
      <h1 className="mb-1 mt-2 font-display text-2xl text-text">Nova vendedora</h1>
      <p className="mb-6 text-sm text-text-muted">
        Cria um cadastro novo, para uma pessoa nova. Para quem já trabalhou aqui, use REATIVAR na lista.
      </p>
      <SellerForm mode="create" action={createSellerAction} submitLabel="Salvar vendedora" />
    </div>
  );
}
