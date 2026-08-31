import { resolveProductPricing, type ProductPricing, type ProductPricingInput } from "@/lib/catalog/pricing";
import type { PaymentSettings } from "@/lib/site-settings/payments";

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const DUAL_PRICE_SIZES = {
  card: {
    outerGap: "gap-1",
    innerGap: "gap-0.5",
    pix: "text-lg sm:text-xl",
    aux: "text-[11px]",
    card: "text-sm sm:text-base",
    installment: "text-xs",
  },
  detail: {
    outerGap: "gap-2",
    innerGap: "gap-0.5",
    pix: "text-2xl sm:text-3xl",
    aux: "text-[13px]",
    card: "text-lg sm:text-xl",
    installment: "text-sm sm:text-base",
  },
} as const;

/**
 * Bloco de preço do modelo Pix/cartão, reaproveitado em todo lugar que
 * mostra preço duplo — card (Home, Novidades, Busca, Categoria, "Você
 * também pode gostar", Minha Seleção, seleção compartilhada) e página do
 * produto — pra nunca haver diferença visual entre eles. `variant` só
 * controla tamanho/espaçamento (card é a versão compacta); estrutura,
 * cor e texto são exatamente os mesmos nos dois.
 *
 * Hierarquia (mais forte → mais discreto): Pix (rosa, maior) > "ou R$Y no
 * cartão" (cor neutra escura, tamanho médio — é o total, não uma linha
 * secundária) > parcela (rosa, menor que o Pix) > "à vista com desconto"
 * (auxiliar, cinza pequeno). Nunca existe uma quinta linha "total" — o
 * total já está explícito em "ou R$Y no cartão". Sem parcelamento
 * aplicável, a linha de parcela some (nunca escreve "1x"), mas "ou R$Y no
 * cartão" continua aparecendo do mesmo jeito.
 */
export function DualPriceBlock({
  pricing,
  variant,
}: {
  pricing: Extract<ProductPricing, { model: "dual" }>;
  variant: "card" | "detail";
}) {
  const hasInstallments = pricing.installmentCount != null && pricing.installmentAmount != null;
  const sizes = DUAL_PRICE_SIZES[variant];

  return (
    <span className={`flex flex-col ${sizes.outerGap}`}>
      <span className={`flex flex-col ${sizes.innerGap}`}>
        <span className={`${sizes.pix} font-semibold leading-tight text-primary`}>
          {formatBRL(pricing.cashPrice)} no Pix
        </span>
        <span className={`${sizes.aux} font-normal leading-tight text-text-muted`}>à vista com desconto</span>
      </span>
      <span className={`flex flex-col ${sizes.innerGap}`}>
        <span className={`${sizes.card} font-semibold leading-tight text-text`}>
          ou {formatBRL(pricing.cardPrice)} no cartão
        </span>
        {hasInstallments && (
          <span className={`${sizes.installment} font-medium leading-tight text-primary`}>
            em até {pricing.installmentCount}x de {formatBRL(pricing.installmentAmount!)} sem juros
          </span>
        )}
      </span>
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
