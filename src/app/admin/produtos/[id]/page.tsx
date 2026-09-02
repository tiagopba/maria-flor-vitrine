import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { getCurrentAdmin } from "@/lib/auth/permissions";
import { getActiveCategoriesPublic } from "@/lib/db/categories";
import { listActiveColorsAdmin } from "@/lib/db/colors";
import { getProductByIdAdmin, listGroupMemberIdsAdmin, type ProductDetail } from "@/lib/db/products";
import { listActiveSizeOptionsAdmin, listSizeOptionsForVariantEdit } from "@/lib/db/sizes";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import { ProductForm } from "../ProductForm";
import { DangerZoneDelete } from "../DangerZoneDelete";
import type { VariantBlockData } from "../VariantBlock";
import type { UserRole } from "@/types/database";

// Ver actions.ts: "MASTER" ainda não existe na arquitetura de papéis —
// nenhuma conta pode ter esse valor hoje, então a comparação abaixo nunca
// é verdadeira e a Zona de Perigo nunca renderiza pra ninguém ainda.
const MASTER_ROLE = "MASTER" as UserRole;

export const metadata: Metadata = { title: "Editar produto" };

function toVariantBlock(product: ProductDetail, sizeOptions: Awaited<ReturnType<typeof listSizeOptionsForVariantEdit>>): VariantBlockData {
  return {
    key: product.id,
    id: product.id,
    code: product.code,
    colorId: product.color_id,
    status: product.status,
    featured: product.featured,
    manualSlug: null,
    initialSlug: product.slug,
    initialCode: product.code,
    initialColorId: product.color_id,
    sizes: product.sizes,
    images: product.images.map((img) => ({ id: img.id, storage_path: img.storage_path, url: img.url })),
    sizeOptions,
  };
}

export default async function EditProductPage({
  params,
}: PageProps<"/admin/produtos/[id]">) {
  const { id } = await params;

  const [admin, product, categories, colors, paymentSettings, activeSizeOptions] = await Promise.all([
    getCurrentAdmin(),
    getProductByIdAdmin(id),
    getActiveCategoriesPublic(),
    listActiveColorsAdmin(),
    getPaymentSettings(),
    listActiveSizeOptionsAdmin(),
  ]);

  if (!product) notFound();

  const siblingIds = product.product_group_id
    ? (await listGroupMemberIdsAdmin(product.product_group_id)).filter((sid) => sid !== product.id)
    : [];
  const siblings = (await Promise.all(siblingIds.map((sid) => getProductByIdAdmin(sid)))).filter(
    (s): s is ProductDetail => s !== null
  );

  const allProducts = [product, ...siblings];
  const variantDefaults = await Promise.all(
    allProducts.map(async (p) => toVariantBlock(p, await listSizeOptionsForVariantEdit(p.sizes)))
  );

  return (
    <div className="max-w-2xl">
      <SuccessToast />
      <Link href="/admin/produtos" className="text-sm text-text-muted hover:text-text">
        ← Produtos
      </Link>
      <h1 className="mb-6 mt-2 font-display text-2xl text-text">Editar produto</h1>

      <ProductForm
        key={allProducts.map((p) => p.id).join(",")}
        categories={categories}
        colors={colors}
        sizeOptions={activeSizeOptions}
        paymentSettings={paymentSettings}
        rootProductId={product.id}
        submitLabel="Salvar alterações"
        sharedDefaults={{
          name: product.name,
          description: product.description,
          category_id: product.category_id,
          price: product.price,
          promotional_price: product.promotional_price,
          cash_price: product.cash_price,
          max_installments_override: product.max_installments_override,
        }}
        variantDefaults={variantDefaults}
      />

      {admin?.role === MASTER_ROLE && (
        <DangerZoneDelete productId={product.id} productName={product.name} productCode={product.code} />
      )}
    </div>
  );
}
