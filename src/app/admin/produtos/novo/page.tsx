import type { Metadata } from "next";
import Link from "next/link";
import { getActiveCategoriesPublic } from "@/lib/db/categories";
import { getProductByIdAdmin } from "@/lib/db/products";
import { createProductAction } from "../actions";
import { ProductForm, type ProductFormDefaults } from "../ProductForm";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage({
  searchParams,
}: PageProps<"/admin/produtos/novo">) {
  const params = await searchParams;
  const duplicateId = typeof params.duplicar === "string" ? params.duplicar : undefined;

  const [categories, source] = await Promise.all([
    getActiveCategoriesPublic(),
    duplicateId ? getProductByIdAdmin(duplicateId) : Promise.resolve(null),
  ]);

  const defaultValues: Partial<ProductFormDefaults> | undefined = source
    ? {
        name: source.name,
        description: source.description,
        price: source.price,
        promotional_price: source.promotional_price,
        category_id: source.category_id,
        status: source.status,
        featured: source.featured,
        sizes: source.sizes,
        // code e slug ficam em branco de propósito — precisam ser novos
      }
    : undefined;

  return (
    <div className="max-w-md">
      <Link href="/admin/produtos" className="text-sm text-text-muted hover:text-text">
        ← Produtos
      </Link>
      <h1 className="mb-1 mt-2 font-display text-2xl text-text">Novo produto</h1>
      {source && (
        <p className="mb-4 text-sm text-text-muted">
          Duplicado de <strong>{source.name}</strong> ({source.code}). Defina um código e um slug
          novos antes de publicar.
        </p>
      )}
      {!source && <div className="mb-4" />}
      <ProductForm
        action={createProductAction}
        categories={categories}
        defaultValues={defaultValues}
        submitLabel="Publicar produto"
        showImageUpload
      />
    </div>
  );
}
