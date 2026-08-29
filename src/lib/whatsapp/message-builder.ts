export interface ProductMessageInput {
  productName: string;
  code: string;
  price: number;
  size?: string;
  productUrl?: string;
}

const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Emoji via escape unicode explícito (não literal no arquivo) — a causa
// real do U+FFFD investigada nesta sessão era o redirect do wa.me (ver
// buildWhatsAppUrl abaixo), não o bundler; mantido assim mesmo assim por
// ser imune a qualquer problema de encoding de arquivo/bundler.
const HEART = String.fromCharCode(0x2764, 0xfe0f);
// Mesmo cuidado do HEART acima, mas com fromCodePoint (0x1F4F8 está fora do
// plano básico — precisa de par substituto, que fromCharCode não monta
// sozinho a partir de um único code point).
const CAMERA = String.fromCodePoint(0x1f4f8);

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

export interface FavoritesSelectionItem {
  productName: string;
  size?: string;
}

/**
 * Mensagem para "Enviar minha seleção" na página /favoritos — uma peça
 * SOLD_OUT nunca chega aqui (quem chama já filtrou antes; ver
 * favorites-click-action.ts), então todo item da lista é, por definição,
 * uma peça disponível para consulta.
 *
 * Compacta de propósito (sem código/preço por item) — quem quiser esse
 * detalhe visual entra no link da seleção compartilhável, que é a
 * referência visual real; repetir tudo na mensagem só deixaria ela grande
 * e a URL individual de cada produto redundante.
 */
export function buildFavoritesWhatsAppMessage(products: FavoritesSelectionItem[], selectionUrl?: string): string {
  const lines = [`Oi! Separei algumas peças na Vitrine Maria Flor ${HEART}`, ""];

  products.forEach((product, index) => {
    lines.push(
      product.size ? `${index + 1}. ${product.productName} — Tam: ${product.size}` : `${index + 1}. ${product.productName}`
    );
  });

  lines.push("", "Pode verificar quais estão disponíveis pra mim?");

  if (selectionUrl) {
    lines.push("", `${CAMERA} Fotos das peças:`, selectionUrl);
  }

  return lines.join("\n");
}

/**
 * Monta a URL final a partir do número (formato internacional, só dígitos).
 *
 * Usa api.whatsapp.com/send diretamente em vez de wa.me — achado nesta
 * sessão, isolado com curl puro (sem nenhum código nosso envolvido): o
 * redirect 302 do wa.me corrompe qualquer caractere de múltiplas unidades
 * UTF-16 no parâmetro `text` (ex: ❤️ = coração + seletor de variação,
 * 📸 = par substituto) em U+FFFD ao reconstruir a URL de destino. Chamando
 * api.whatsapp.com/send diretamente (o próprio destino final do redirect
 * do wa.me) esse passo intermediário quebrado é evitado, e o emoji chega
 * correto — confirmado via curl direto com os mesmos bytes exatos.
 */
export function buildWhatsAppUrl(phoneNumber: string, message: string): string {
  const digitsOnly = phoneNumber.replace(/\D/g, "");
  return `https://api.whatsapp.com/send/?phone=${digitsOnly}&text=${encodeURIComponent(message)}`;
}
