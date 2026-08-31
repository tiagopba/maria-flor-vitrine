import { resolveProductPricing, type ProductPricingInput } from "@/lib/catalog/pricing";
import type { PaymentSettings } from "@/lib/site-settings/payments";

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Compacto de propósito (usado em card/lista) — modelo novo mostra só a
 * contagem de parcelas, nunca o valor de cada uma (ver
 * lib/catalog/installments.ts sobre por quê). Página de produto usa seu
 * próprio bloco mais completo, não este componente.
 */
export function Price({
  product,
  paymentSettings,
}: {
  product: ProductPricingInput;
  paymentSettings: PaymentSettings;
}) {
  const pricing = resolveProductPricing(product, paymentSettings);

  if (pricing.model === "legacy") {
    const { price, promotionalPrice } = pricing;

    if (promotionalPrice == null || promotionalPrice >= price) {
      return <span className="font-medium text-text">{formatBRL(price)}</span>;
    }

    return (
      <span className="flex items-baseline gap-2">
        <span className="text-sm text-text-muted line-through">{formatBRL(price)}</span>
        <span className="font-medium text-primary">{formatBRL(promotionalPrice)}</span>
      </span>
    );
  }

  return (
    <span className="flex flex-col">
      <span className="font-medium text-text">{formatBRL(pricing.cashPrice)} no Pix</span>
      <span className="text-xs text-text-muted">
        {formatBRL(pricing.cardPrice)} no cartão
        {pricing.installmentCount != null && ` • até ${pricing.installmentCount}x sem juros`}
      </span>
    </span>
  );
}
