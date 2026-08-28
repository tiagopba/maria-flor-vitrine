import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveCategoriesPublic } from "@/lib/db/categories";
import { getProductByIdAdmin } from "@/lib/db/products";
import { updateProductAction } from "../actions";
import { ProductForm } from "../ProductForm";
import { ProductImageManager } from "../ProductImageManager";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditProductPage({
  params,
}: PageProps<"/admin/produtos/[id]">) {
  const { id } = await params;

  const [product, categories] = await Promise.all([
    getProductByIdAdmin(id),
    getActiveCategoriesPublic(),
  ]);

  if (!product) notFound();

  const boundAction = updateProductAction.bind(null, product.id);

  return (
    <div className="max-w-2xl">
      <Link href="/admin/produtos" className="text-sm text-text-muted hover:text-text">
        ← Produtos
      </Link>
      <h1 className="mb-6 mt-2 font-display text-2xl text-text">Editar produto</h1>

      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-medium text-text-muted">Fotos</h2>
          <ProductImageManager productId={product.id} images={product.images} />
        </div>

        <div className="max-w-md">
          <ProductForm
            action={boundAction}
            categories={categories}
            submitLabel="Salvar alterações"
            defaultValues={{
              code: product.code,
              name: product.name,
              slug: product.slug,
              description: product.description,
              price: product.price,
              promotional_price: product.promotional_price,
              category_id: product.category_id,
              status: product.status,
              featured: product.featured,
              sizes: product.sizes,
            }}
          />
        </div>
      </div>
    </div>
  );
}
