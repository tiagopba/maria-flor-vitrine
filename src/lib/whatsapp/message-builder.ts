export interface ProductMessageInput {
  productName: string;
  code: string;
  price: number;
  size?: string;
  productUrl?: string;
}

const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Mensagem para "Quero essa peça" na página de produto.
 */
export function buildProductWhatsAppMessage({
  productName,
  code,
  price,
  size,
  productUrl,
}: ProductMessageInput): string {
  const lines = [
    "Oi! Vi essa peça na Vitrine Maria Flor ❤️",
    productName,
    `Código: ${code}`,
  ];

  if (size) lines.push(`Tamanho: ${size}`);

  lines.push(`Preço: ${formatPrice(price)}`);
  lines.push("Poderia verificar a disponibilidade para mim?");

  if (productUrl) {
    lines.push("");
    lines.push(productUrl);
  }

  return lines.join("\n");
}

export interface LookMessageInput {
  lookTitle: string;
  products: ProductMessageInput[];
}

/**
 * Mensagem para "Quero o look" no Provador.
 */
export function buildLookWhatsAppMessage({ lookTitle, products }: LookMessageInput): string {
  const lines = [`Oi! Gostei do ${lookTitle} na Vitrine Maria Flor ❤️`, ""];

  products.forEach((product) => {
    lines.push(`${product.code} — ${product.productName} — ${formatPrice(product.price)}`);
  });

  lines.push("", "Poderia verificar a disponibilidade dessas peças para mim?");

  return lines.join("\n");
}

export interface FavoritesMessageInput {
  products: { code: string; productName: string }[];
}

/**
 * Mensagem para "Enviar meus favoritos para uma vendedora".
 */
export function buildFavoritesWhatsAppMessage({ products }: FavoritesMessageInput): string {
  const lines = ["Oi! Separei algumas peças na Vitrine Maria Flor ❤️", ""];

  products.forEach((product) => {
    lines.push(`${product.code} — ${product.productName}`);
  });

  lines.push("", "Poderia verificar a disponibilidade para mim?");

  return lines.join("\n");
}

/**
 * Monta a URL final do wa.me a partir do número (formato internacional, só dígitos).
 */
export function buildWhatsAppUrl(phoneNumber: string, message: string): string {
  const digitsOnly = phoneNumber.replace(/\D/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}
