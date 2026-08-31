import type { Metadata } from "next";
import Link from "next/link";
import { getActiveCategoriesPublic } from "@/lib/db/categories";
import { listActiveColorsAdmin } from "@/lib/db/colors";
import { listActiveSizeOptionsAdmin } from "@/lib/db/sizes";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import { ProductForm } from "../ProductForm";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const [categories, colors, sizeOptions, paymentSettings] = await Promise.all([
    getActiveCategoriesPublic(),
    listActiveColorsAdmin(),
    listActiveSizeOptionsAdmin(),
    getPaymentSettings(),
  ]);

  return (
    <div className="max-w-2xl">
      <Link href="/admin/produtos" className="text-sm text-text-muted hover:text-text">
        ← Produtos
      </Link>
      <h1 className="mb-6 mt-2 font-display text-2xl text-text">Novo produto</h1>
      <ProductForm
        categories={categories}
        colors={colors}
        sizeOptions={sizeOptions}
        paymentSettings={paymentSettings}
        rootProductId={null}
        submitLabel="Publicar produto"
      />
    </div>
  );
}
