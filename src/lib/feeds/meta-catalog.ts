import "server-only";
import { listPublishedProducts } from "@/lib/db/products";
import { resolveProductPricing } from "@/lib/catalog/pricing";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import { getSiteUrl } from "@/lib/site";
import type { ProductStatus } from "@/types/database";

/**
 * Feed público do Catálogo Meta (/feeds/meta-catalog.csv) — gerado 100% a
 * partir dos mesmos dados/consultas já usados nas páginas públicas
 * (listPublishedProducts, resolveProductPricing, getSiteUrl), nunca uma
 * fonte paralela. Não cria nenhuma tabela/coluna nova nem toca no cadastro
 * de produto: é só uma projeção de leitura do que já existe.
 *
 * `id = product.code` de propósito — é o mesmo identificador que
 * ViewContent e AddToWishlist do Meta Pixel já enviam em `content_ids`
 * (ver ProductViewTracker/FavoriteButton/ProductWhatsAppFlow), então um
 * evento de Pixel e uma linha deste feed sempre apontam pro mesmo item aos
 * olhos do Meta — pré-requisito pra Catálogo Dinâmico/Advantage+ casar
 * evento com produto.
 */
const CSV_COLUMNS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "brand",
  "product_type",
  "color",
  "item_group_id",
] as const;

type CsvColumn = (typeof CSV_COLUMNS)[number];

const BRAND = "Maria Flor";

export interface MetaCatalogFeedResult {
  csv: string;
  exportedCount: number;
  skippedNoImageCount: number;
  skippedDuplicateIdCount: number;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * SOLD_OUT é o único status realmente indisponível pra venda. ACTIVE,
 * LAST_UNITS e CHECK_AVAILABILITY continuam vendáveis normalmente — a
 * confirmação de giro/estoque dessas duas últimas acontece na conversa com
 * a vendedora (é assim que a loja já vende hoje), não é motivo pra tirar o
 * produto do ar no catálogo. ARCHIVED nunca chega aqui: já filtrado por
 * `listPublishedProducts`.
 */
function mapAvailability(status: ProductStatus): "in stock" | "out of stock" {
  return status === "SOLD_OUT" ? "out of stock" : "in stock";
}

export async function buildMetaCatalogFeed(): Promise<MetaCatalogFeedResult> {
  const [products, paymentSettings] = await Promise.all([
    // Mesma listagem pública usada no sitemap (listPublishedProducts com um
    // limite alto) — já filtra ARCHIVED e produtos sem published_at, então
    // nenhum produto arquivado/não publicado chega a ser considerado aqui.
    listPublishedProducts(10000),
    getPaymentSettings(),
  ]);

  const siteUrl = getSiteUrl();
  const seenIds = new Set<string>();
  const rows: string[] = [CSV_COLUMNS.join(",")];

  let skippedNoImageCount = 0;
  let skippedDuplicateIdCount = 0;

  for (const product of products) {
    // "imagem principal válida" = a mesma que a Home/listagens já exigem
    // pra mostrar uma foto (posição 0 em product_images) — sem ela, nunca
    // vira linha do feed.
    if (!product.mainImageUrl) {
      skippedNoImageCount++;
      continue;
    }

    const id = product.code;
    // Defensivo: `code` já é único por linha de produto na prática (mesma
    // premissa que ViewContent/AddToWishlist já assumem), mas nunca deixa
    // um id duplicado ir pro feed se isso um dia deixar de ser verdade.
    if (seenIds.has(id)) {
      skippedDuplicateIdCount++;
      continue;
    }
    seenIds.add(id);

    // Mesmo preço efetivo que ProductViewTracker manda no `value` do
    // ViewContent — catálogo e Pixel nunca podem mostrar preços diferentes
    // pro mesmo content_id/id.
    const pricing = resolveProductPricing(product, paymentSettings);
    const effectivePrice =
      pricing.model === "dual" ? pricing.cashPrice : (pricing.promotionalPrice ?? pricing.price);

    const fields: Record<CsvColumn, string> = {
      id,
      title: product.name,
      // Fallback pro nome quando a descrição não foi preenchida — a Meta
      // exige o campo não vazio; nunca inventa texto novo, só reaproveita
      // um dado real que o produto já tem.
      description: product.description ?? product.name,
      availability: mapAvailability(product.status),
      condition: "new",
      price: `${effectivePrice.toFixed(2)} BRL`,
      link: `${siteUrl}/produto/${product.slug}`,
      image_link: product.mainImageUrl,
      brand: BRAND,
      product_type: product.categoryName ?? "",
      color: product.colorName ?? "",
      item_group_id: product.product_group_id ?? "",
    };

    rows.push(CSV_COLUMNS.map((column) => csvEscape(fields[column])).join(","));
  }

  return {
    csv: rows.join("\n") + "\n",
    exportedCount: seenIds.size,
    skippedNoImageCount,
    skippedDuplicateIdCount,
  };
}
