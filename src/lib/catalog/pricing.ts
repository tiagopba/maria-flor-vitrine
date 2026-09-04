import { calculateInstallmentCount } from "./installments";
import type { PaymentSettings } from "@/lib/site-settings/payments";

export interface ProductPricingInput {
  price: number;
  promotional_price: number | null;
  cash_price: number | null;
  max_installments_override: number | null;
}

export type ProductPricing =
  | {
      model: "legacy";
      price: number;
      promotionalPrice: number | null;
    }
  | {
      model: "dual";
      cashPrice: number;
      cardPrice: number;
      /** null = não mostrar parcelamento (desativado, ou nem 2x cabem). */
      installmentCount: number | null;
      /** cardPrice / installmentCount, arredondado ao centavo. null junto com installmentCount. */
      installmentAmount: number | null;
    };

/**
 * Decide, num lugar só, se um produto usa o modelo novo (Pix + cartão) ou
 * o legado (price + promotional_price) — reaproveitado por todo lugar que
 * exibe ou usa preço (cards, página do produto, filtro, mensagens de
 * WhatsApp), pra nunca divergir entre eles.
 *
 * Regra: só entra no modelo novo se `cash_price` estiver preenchido E o
 * Pix estiver ativado globalmente (`cashPriceEnabled`). Desativar o Pix na
 * loja não apaga `cash_price` do produto — só volta a exibição pro modelo
 * legado até reativar (exatamente como pedido: "não apagar os valores
 * cadastrados; apenas desativar sua exibição/uso").
 */
export function resolveProductPricing(
  product: ProductPricingInput,
  paymentSettings: PaymentSettings
): ProductPricing {
  if (product.cash_price == null || !paymentSettings.cashPriceEnabled) {
    return {
      model: "legacy",
      price: product.price,
      promotionalPrice: product.promotional_price,
    };
  }

  const installmentCount = calculateInstallmentCount({
    price: product.price,
    maxInstallmentsOverride: product.max_installments_override,
    defaultMaxInstallments: paymentSettings.defaultMaxInstallments,
    minInstallmentValue: paymentSettings.minInstallmentValue,
    installmentsEnabled: paymentSettings.installmentsEnabled,
  });

  // Arredondamento em centavos pra evitar erro de ponto flutuante — valor
  // exibido por parcela, não uma divisão exata garantida (o valor real
  // cobrado parcela a parcela é responsabilidade da maquininha/gateway;
  // aqui é só o texto "Nx de R$Y" mostrado à cliente).
  const installmentAmount =
    installmentCount != null ? Math.round((product.price * 100) / installmentCount) / 100 : null;

  return {
    model: "dual",
    cashPrice: product.cash_price,
    cardPrice: product.price,
    installmentCount,
    installmentAmount,
  };
}

/**
 * Preço "efetivo" pra tracking (Meta Pixel, Meta Catalog): no modelo dual
 * usa o preço à vista (Pix); no legado, a promocional quando existir, senão
 * o preço cheio. Um único lugar pra essa regra — reaproveitada em todo
 * evento/feed que precisa de um `value` numérico único por produto.
 */
export function resolveTrackingPrice(pricing: ProductPricing): number {
  return pricing.model === "dual" ? pricing.cashPrice : pricing.promotionalPrice ?? pricing.price;
}
