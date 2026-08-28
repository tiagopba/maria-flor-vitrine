export interface ProductMessageInput {
  productName: string;
  code: string;
  price: number;
  size?: string;
  productUrl?: string;
}

const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Emoji de coração via escape unicode explícito (não literal no arquivo) —
// o coração literal estava saindo corrompido (replacement character U+FFFD)
// na URL final do wa.me, mesmo com os bytes do arquivo em UTF-8 correto;
// aparentemente uma etapa do bundler no Windows não preservava esse
// caractere ao empacotar a Server Action. Escape explícito é imune a isso.
const HEART = String.fromCharCode(0x2764, 0xfe0f);

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
    `Oi! Vi essa peça na Vitrine Maria Flor ${HEART}`,
    productName,
    size ? `Código: ${code} | Tam: ${size}` : `Código: ${code}`,
    formatPrice(price),
    "Pode verificar a disponibilidade pra mim?",
  ];

  if (productUrl) lines.push(productUrl);

  return lines.join("\n");
}

/**
 * Mensagem para "Quero algo parecido" quando o produto está SOLD_OUT — não
 * pede tamanho (não faz sentido para uma peça esgotada).
 */
export function buildSoldOutWhatsAppMessage({ productName, code }: { productName: string; code: string }): string {
  return `Gostei da peça ${code} (${productName}), mas vi que está esgotada. Vocês têm algo parecido?`;
}

export interface LookMessageInput {
  lookTitle: string;
  products: ProductMessageInput[];
}

/**
 * Mensagem para "Quero o look" no Provador.
 */
export function buildLookWhatsAppMessage({ lookTitle, products }: LookMessageInput): string {
  const lines = [`Oi! Gostei do ${lookTitle} na Vitrine Maria Flor ${HEART}`, ""];

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
  const lines = [`Oi! Separei algumas peças na Vitrine Maria Flor ${HEART}`, ""];

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
