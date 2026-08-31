import { resolveProductPricing, type ProductPricing, type ProductPricingInput } from "@/lib/catalog/pricing";
import type { PaymentSettings } from "@/lib/site-settings/payments";

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Bloco de preço do modelo Pix/cartão, reaproveitado em todo lugar que
 * mostra preço duplo — card (Home, Novidades, Busca, Categoria, "Você
 * também pode gostar", Minha Seleção, seleção compartilhada) e página do
 * produto — pra nunca haver diferença visual entre eles. `variant` só
 * controla tamanho/espaçamento; hierarquia, cor e texto são os mesmos.
 *
 * Hierarquia (mais forte → mais discreto): Pix > parcela > total no
 * cartão > texto auxiliar. Sem parcelamento aplicável, mostra só Pix +
 * "R$ Y no cartão" (nunca "1x"). No card (lista/grade), o total do
 * cartão fica de fora quando há parcela — a peça já tem preço de sobra
 * pra card compacto; o total completo continua sempre visível na página
 * do produto (variant="detail").
 */
export function DualPriceBlock({
  pricing,
  variant,
}: {
  pricing: Extract<ProductPricing, { model: "dual" }>;
  variant: "card" | "detail";
}) {
  const hasInstallments = pricing.installmentCount != null && pricing.installmentAmount != null;

  if (variant === "card") {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="text-lg font-semibold leading-tight text-primary sm:text-xl">
          {formatBRL(pricing.cashPrice)} no Pix
        </span>
        {hasInstallments ? (
          <span className="text-sm font-medium leading-tight text-primary/75">
            ou {pricing.installmentCount}x de {formatBRL(pricing.installmentAmount!)} sem juros
          </span>
        ) : (
          <span className="text-xs font-normal leading-tight text-text-muted">
            {formatBRL(pricing.cardPrice)} no cartão
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-2">
      <span className="flex flex-col gap-0.5">
        <span className="text-2xl font-semibold leading-tight text-primary sm:text-3xl">
          {formatBRL(pricing.cashPrice)} no Pix
        </span>
        <span className="text-[13px] font-normal leading-tight text-text-muted">à vista com desconto</span>
      </span>
      {hasInstallments ? (
        <span className="flex flex-col gap-0.5">
          <span className="text-lg font-medium leading-tight text-primary/75 sm:text-xl">
            ou {pricing.installmentCount}x de {formatBRL(pricing.installmentAmount!)} sem juros
          </span>
          <span className="text-[13px] font-normal leading-tight text-text-muted">
            total no cartão {formatBRL(pricing.cardPrice)}
          </span>
        </span>
      ) : (
        <span className="text-[13px] font-normal leading-tight text-text-muted">
          {formatBRL(pricing.cardPrice)} no cartão
        </span>
      )}
    </span>
  );
}

/**
 * Compacto de propósito (usado em card/lista) — delega o modelo novo pro
 * DualPriceBlock (variant="card"). Página de produto usa DualPriceBlock
 * direto com variant="detail", não este componente.
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

  return <DualPriceBlock pricing={pricing} variant="card" />;
}
