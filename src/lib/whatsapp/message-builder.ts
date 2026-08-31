export interface ProductMessageInput {
  productName: string;
  code: string;
  price: number;
  size?: string;
  productUrl?: string;
}

/**
 * Linhas de preço do modelo Pix/cartão — quando presente, substitui a
 * linha única de `price` na mensagem de "Quero essa peça" pela mesma
 * informação de dois preços exibida no site (nunca pode divergir). Não é
 * usado em buildLookWhatsAppMessage (Provador) — esse fluxo continua com
 * o preço único de sempre, fora do escopo desta mudança.
 */
export interface DualPriceLines {
  cashPrice: number;
  cardPrice: number;
  installmentCount: number | null;
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
 * Mensagem para "Quero essa peça" na página de produto. Quando o produto
 * usa o modelo de dois preços, `dualPrice` substitui a linha única de
 * `price` pela mesma informação de Pix + cartão exibida no site — não pode
 * haver divergência entre a Vitrine e a mensagem enviada à vendedora.
 */
export function buildProductWhatsAppMessage({
  productName,
  code,
  price,
  size,
  productUrl,
  dualPrice,
}: ProductMessageInput & { dualPrice?: DualPriceLines }): string {
  const priceLines = dualPrice
    ? [
        `${formatPrice(dualPrice.cashPrice)} no Pix`,
        `${formatPrice(dualPrice.cardPrice)} no cartão${
          dualPrice.installmentCount != null ? ` • até ${dualPrice.installmentCount}x sem juros` : ""
        }`,
      ]
    : [formatPrice(price)];

  const lines = [
    `Oi! Vi essa peça na Vitrine Maria Flor ${HEART}`,
    productName,
    size ? `Código: ${code} | Tam: ${size}` : `Código: ${code}`,
    ...priceLines,
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
  /** Preço legado — só entra na mensagem quando a seleção tem exatamente 1 peça. */
  price?: number;
  /** Preço Pix/cartão do modelo de dois preços — mesma regra de `price` acima. */
  dualPrice?: DualPriceLines;
}

/**
 * Mensagem para "Enviar minha seleção" na página /favoritos — uma peça
 * SOLD_OUT nunca chega aqui (quem chama já filtrou antes; ver
 * favorites-click-action.ts), então todo item da lista é, por definição,
 * uma peça disponível para consulta.
 *
 * Compacta de propósito com 2+ peças (sem código/preço por item) — quem
 * quiser esse detalhe visual entra no link da seleção compartilhável, que
 * é a referência visual real; repetir tudo na mensagem só deixaria ela
 * grande e a URL individual de cada produto redundante.
 *
 * Com exatamente 1 peça, porém, ESTA é a mensagem real de "Quero essa
 * peça" na página de produto — "Quero essa peça" entra nesta mesma
 * infraestrutura de seleção (ver ProductWhatsAppFlow.tsx) em vez de um
 * envio isolado. Por isso o preço aparece nesse caso: não pode haver
 * divergência entre o preço mostrado na Vitrine e o preço na mensagem
 * enviada à vendedora.
 */
export function buildFavoritesWhatsAppMessage(products: FavoritesSelectionItem[], selectionUrl?: string): string {
  const lines = [`Oi! Separei algumas peças na Vitrine Maria Flor ${HEART}`, ""];

  products.forEach((product, index) => {
    lines.push(
      product.size ? `${index + 1}. ${product.productName} — Tam: ${product.size}` : `${index + 1}. ${product.productName}`
    );
  });

  if (products.length === 1) {
    const [only] = products;
    if (only.dualPrice) {
      lines.push(
        "",
        `${formatPrice(only.dualPrice.cashPrice)} no Pix`,
        `${formatPrice(only.dualPrice.cardPrice)} no cartão${
          only.dualPrice.installmentCount != null ? ` • até ${only.dualPrice.installmentCount}x sem juros` : ""
        }`
      );
    } else if (only.price != null) {
      lines.push("", formatPrice(only.price));
    }
  }

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
