import type { ProductDetail } from "@/lib/db/products";
import { resolveProductPricing } from "@/lib/catalog/pricing";
import type { PaymentSettings } from "@/lib/site-settings/payments";
import type { InstitutionalInfo } from "@/lib/site-settings/institutional";
import type { ProductStatus } from "@/types/database";
import { LOCAL_SEO } from "@/lib/seo/local";

/**
 * JSON-LD da loja (ClothingStore, subtipo de LocalBusiness — mais específico
 * e melhor reconhecido pelo Google pra e-commerce de moda). Só declara campo
 * que tem dado real em `site_settings`; nunca inventa endereço, telefone,
 * geo ou horário — horário em particular fica de fora porque `hours` é
 * texto livre digitado no admin (ex: "Seg a sáb, 8h às 18h"), sem garantia
 * de bater com o formato estrito que o schema.org exige pra
 * `openingHours`/`openingHoursSpecification`; declarar errado é pior do que
 * não declarar.
 */
export function buildStoreJsonLd(info: InstitutionalInfo, siteUrl: string): Record<string, unknown> {
  const sameAs = [info.instagramUrl, info.googleMapsUrl, ...info.socialLinks.map((s) => s.url)].filter(
    (url): url is string => Boolean(url)
  );

  const hasAddress = Boolean(info.address || info.city);

  return {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    name: info.tradeName,
    ...(info.legalName ? { legalName: info.legalName } : {}),
    url: siteUrl,
    ...(info.facadePhotoUrl ? { image: info.facadePhotoUrl } : {}),
    description: `${info.tradeName} — moda feminina em ${info.city ?? LOCAL_SEO.city}, ${info.state ?? LOCAL_SEO.state}.`,
    ...(info.phone ? { telephone: info.phone } : {}),
    ...(hasAddress
      ? {
          address: {
            "@type": "PostalAddress",
            ...(info.address ? { streetAddress: info.address } : {}),
            addressLocality: info.city ?? LOCAL_SEO.city,
            addressRegion: info.state ?? LOCAL_SEO.state,
            addressCountry: "BR",
          },
        }
      : {}),
    ...(info.whatsapp
      ? {
          contactPoint: [
            {
              "@type": "ContactPoint",
              contactType: "customer service",
              telephone: info.whatsapp,
            },
          ],
        }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

const AVAILABILITY_BY_STATUS: Record<ProductStatus, string> = {
  ACTIVE: "https://schema.org/InStock",
  LAST_UNITS: "https://schema.org/LimitedAvailability",
  CHECK_AVAILABILITY: "https://schema.org/LimitedAvailability",
  SOLD_OUT: "https://schema.org/OutOfStock",
  // Nunca deveria chegar aqui (produto arquivado não tem página pública),
  // mas precisa de um valor válido pra satisfazer o Record completo.
  ARCHIVED: "https://schema.org/OutOfStock",
};

/**
 * JSON-LD `Product` da página de produto. Preço único em `offers.price`
 * (exigência do schema — não dá pra declarar Pix e cartão ao mesmo tempo);
 * usa o menor preço real do produto (Pix/à vista quando o modelo dual está
 * ativo, senão o preço promocional ou o preço cheio do modelo legado) —
 * nunca um valor inventado. Sem `sku`/estoque numérico: o sistema não
 * controla quantidade, só os status (`ACTIVE`/`LAST_UNITS`/etc.).
 */
export function buildProductJsonLd(
  product: ProductDetail,
  paymentSettings: PaymentSettings,
  siteUrl: string
): Record<string, unknown> {
  const pricing = resolveProductPricing(product, paymentSettings);
  const price = pricing.model === "dual" ? pricing.cashPrice : pricing.promotionalPrice ?? pricing.price;
  const url = `${siteUrl}/produto/${product.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.code,
    url,
    ...(product.images[0]?.url ? { image: product.images.map((img) => img.url) } : {}),
    ...(product.description ? { description: product.description } : {}),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BRL",
      price: price.toFixed(2),
      availability: AVAILABILITY_BY_STATUS[product.status],
    },
  };
}
