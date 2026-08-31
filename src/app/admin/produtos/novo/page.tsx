import type { Metadata } from "next";
import Link from "next/link";
import { getActiveCategoriesPublic } from "@/lib/db/categories";
import { listActiveColorsAdmin } from "@/lib/db/colors";
import { getProductByIdAdmin } from "@/lib/db/products";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import { createProductAction } from "../actions";
import { ProductForm, type ProductFormDefaults } from "../ProductForm";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage({
  searchParams,
}: PageProps<"/admin/produtos/novo">) {
  const params = await searchParams;
  const duplicateId = typeof params.duplicar === "string" ? params.duplicar : undefined;
  // Só presente quando vem do fluxo "cadastrar nova peça em outra cor"
  // (ProductColorGroupSection) — o grupo já foi garantido/criado antes de
  // navegar pra cá (ver ensureProductGroupAction).
  const groupId = typeof params.group === "string" ? params.group : undefined;

  const [categories, colors, source, paymentSettings] = await Promise.all([
    getActiveCategoriesPublic(),
    listActiveColorsAdmin(),
    duplicateId ? getProductByIdAdmin(duplicateId) : Promise.resolve(null),
    getPaymentSettings(),
  ]);

  const defaultValues: Partial<ProductFormDefaults> | undefined = source
    ? {
        name: source.name,
        description: source.description,
        price: source.price,
        promotional_price: source.promotional_price,
        cash_price: source.cash_price,
        max_installments_override: source.max_installments_override,
        category_id: source.category_id,
        status: source.status,
        featured: source.featured,
        sizes: source.sizes,
        product_group_id: groupId ?? null,
        // code, slug, color_id e fotos ficam em branco de propósito —
        // são exatamente os dados que precisam ser informados de novo
        // pra cada cor (item 10 da especificação).
      }
    : undefined;

  return (
    <div className="max-w-md">
      <Link href="/admin/produtos" className="text-sm text-text-muted hover:text-text">
        ← Produtos
      </Link>
      <h1 className="mb-1 mt-2 font-display text-2xl text-text">Novo produto</h1>
      {source && groupId && (
        <p className="mb-4 text-sm text-text-muted">
          Nova cor de <strong>{source.name}</strong>. Informe código, cor e fotos desta peça — o
          resto já veio preenchido.
        </p>
      )}
      {source && !groupId && (
        <p className="mb-4 text-sm text-text-muted">
          Duplicado de <strong>{source.name}</strong> ({source.code}). Defina um código e um slug
          novos antes de publicar.
        </p>
      )}
      {!source && <div className="mb-4" />}
      <ProductForm
        action={createProductAction}
        categories={categories}
        colors={colors}
        defaultValues={defaultValues}
        submitLabel="Publicar produto"
        showImageUpload
        paymentSettings={paymentSettings}
      />
    </div>
  );
}
