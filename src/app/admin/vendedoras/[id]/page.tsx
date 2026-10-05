import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import { getSellerByIdAdmin } from "@/lib/db/sellers";
import { updateSellerContactAction } from "../actions";
import { SellerForm } from "../SellerForm";

export const metadata: Metadata = { title: "Contato da vendedora" };

export default async function EditSellerContactPage({ params }: PageProps<"/admin/vendedoras/[id]">) {
  await requireAdmin(["admin", "master"]);

  const { id } = await params;
  const seller = await getSellerByIdAdmin(id);

  if (!seller) notFound();

  const boundAction = updateSellerContactAction.bind(null, seller.id);

  return (
    <div className="max-w-md">
      <Link href="/admin/vendedoras" className="text-sm text-text-muted hover:text-text">
        ← Vendedoras
      </Link>
      <h1 className="mb-1 mt-2 font-display text-2xl text-text">Contato — {seller.name}</h1>
      <p className="mb-6 text-sm text-text-muted">
        Só WhatsApp, telefone e rodízio. O nome se corrige em EDITAR NOME e a situação em DESATIVAR/REATIVAR.
      </p>
      <SellerForm
        mode="contact"
        active={seller.active}
        action={boundAction}
        submitLabel="Salvar contato"
        defaultValues={{
          whatsapp_number: seller.whatsapp_number ?? "",
          phone: seller.phone,
          round_robin: seller.round_robin,
        }}
      />
    </div>
  );
}
