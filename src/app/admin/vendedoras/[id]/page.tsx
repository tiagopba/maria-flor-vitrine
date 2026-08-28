import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSellerByIdAdmin } from "@/lib/db/sellers";
import { updateSellerAction } from "../actions";
import { SellerForm } from "../SellerForm";

export const metadata: Metadata = { title: "Editar vendedora" };

export default async function EditSellerPage({ params }: PageProps<"/admin/vendedoras/[id]">) {
  const { id } = await params;
  const seller = await getSellerByIdAdmin(id);

  if (!seller) notFound();

  const boundAction = updateSellerAction.bind(null, seller.id);

  return (
    <div className="max-w-md">
      <Link href="/admin/vendedoras" className="text-sm text-text-muted hover:text-text">
        ← Vendedoras
      </Link>
      <h1 className="mb-6 mt-2 font-display text-2xl text-text">Editar vendedora</h1>
      <SellerForm
        action={boundAction}
        submitLabel="Salvar alterações"
        defaultValues={{
          name: seller.name,
          whatsapp_number: seller.whatsapp_number,
          phone: seller.phone,
          active: seller.active,
          round_robin: seller.round_robin,
        }}
      />
    </div>
  );
}
