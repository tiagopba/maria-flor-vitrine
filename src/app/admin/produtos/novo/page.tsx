import type { Metadata } from "next";
import Link from "next/link";
import { getActiveCategoriesPublic } from "@/lib/db/categories";
import { listActiveColorsAdmin } from "@/lib/db/colors";
import { getProductByIdAdmin } from "@/lib/db/products";
import { listActiveSizeOptionsAdmin, listSizeOptionsForVariantEdit } from "@/lib/db/sizes";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import { ProductForm } from "../ProductForm";
import type { VariantBlockData } from "../VariantBlock";

export const metadata: Metadata = { title: "Novo produto" };

/**
 * Duplicar (`?duplicar=<id>`) — só pré-preenche o formulário de Novo
 * Produto a partir de um produto existente; não grava nada no banco
 * sozinho (isso só acontece se a admin clicar Salvar, exatamente como um
 * cadastro novo normal). `rootProductId` continua `null` de propósito:
 * a cópia é sempre um produto novo e independente, nunca fica associada
 * ao grupo de cores do original.
 *
 * Campos copiados: categoria, nome, descrição, preço no Pix (cash_price),
 * preço a prazo/cartão (price), status e tamanhos. Nunca copiados:
 * código (vazio), cor (Sem cor), fotos (nenhuma), slug, redirects,
 * product_group_id, vínculo com outras cores, featured, e o override de
 * parcelamento (força "usar parcelamento padrão da loja" marcado).
 * `promotional_price` também não é copiado — não está na lista de campos
 * pedida, então fica de fora em vez de herdar um valor não solicitado.
 */
export default async function NewProductPage({ searchParams }: PageProps<"/admin/produtos/novo">) {
  const [rawParams, categories, colors, activeSizeOptions, paymentSettings] = await Promise.all([
    searchParams,
    getActiveCategoriesPublic(),
    listActiveColorsAdmin(),
    listActiveSizeOptionsAdmin(),
    getPaymentSettings(),
  ]);

  const duplicateFromId = typeof rawParams.duplicar === "string" ? rawParams.duplicar : null;
  const sourceProduct = duplicateFromId ? await getProductByIdAdmin(duplicateFromId) : null;

  const sharedDefaults = sourceProduct
    ? {
        name: sourceProduct.name,
        description: sourceProduct.description,
        category_id: sourceProduct.category_id,
        price: sourceProduct.price,
        promotional_price: null,
        cash_price: sourceProduct.cash_price,
        max_installments_override: null,
      }
    : undefined;

  const variantDefaults: VariantBlockData[] | undefined = sourceProduct
    ? [
        {
          key: "duplicated-variant",
          id: null,
          code: "",
          colorId: null,
          status: sourceProduct.status,
          featured: false,
          manualSlug: null,
          initialSlug: null,
          initialCode: "",
          initialColorId: null,
          sizes: sourceProduct.sizes,
          images: [],
          sizeOptions: await listSizeOptionsForVariantEdit(sourceProduct.sizes),
        },
      ]
    : undefined;

  return (
    <div className="max-w-2xl">
      <Link href="/admin/produtos" className="text-sm text-text-muted hover:text-text">
        ← Produtos
      </Link>
      <h1 className="mb-6 mt-2 font-display text-2xl text-text">Novo produto</h1>
      <ProductForm
        categories={categories}
        colors={colors}
        sizeOptions={activeSizeOptions}
        paymentSettings={paymentSettings}
        rootProductId={null}
        submitLabel="Publicar produto"
        sharedDefaults={sharedDefaults}
        variantDefaults={variantDefaults}
      />
    </div>
  );
}
