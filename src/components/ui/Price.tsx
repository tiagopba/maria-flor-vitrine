import { Badge } from "@/components/ui/Badge";
import { resolveProductPricing, type ProductPricing, type ProductPricingInput } from "@/lib/catalog/pricing";
import type { PaymentSettings } from "@/lib/site-settings/payments";

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CARD_SIZES = {
  outerGap: "gap-1",
  innerGap: "gap-0.5",
  pix: "text-lg sm:text-xl",
  aux: "text-[11px]",
  card: "text-sm sm:text-base",
  installment: "text-xs",
} as const;

/**
 * Só a variante "detail" (página do produto) — "Modelo 1": o preço cheio
 * vira riscado/secundário acima do Pix, que segue como destaque principal
 * (mesmo tamanho de sempre, `text-2xl sm:text-3xl`), com um selo de
 * desconto e a economia em reais explícita. O cartão desce pra um bloco
 * visualmente secundário, sem nenhuma palavra que sugira taxa/acréscimo —
 * ele é só "outra forma de pagamento", nunca o preço de referência.
 *
 * `hasCashDiscount` é a ÚNICA condição que liga riscado/selo/"Você
 * economiza R$X" — exatamente a regra pedida: só existem quando
 * `cashPrice < cardPrice` de verdade (nunca um desconto inventado). O
 * texto "à vista" é sempre o mesmo, com ou sem desconto (nenhuma alegação
 * de desconto embutida nele — quem afirma o desconto é a linha "Você
 * economiza", que só aparece quando é real). `discountPercent` só aparece
 * como selo quando arredonda pra 1% ou mais — um desconto real de poucos
 * centavos arredondaria pra "0% OFF", que não comunica nada e pareceria
 * bug; a linha de economia em reais continua aparecendo mesmo nesse caso
 * raro, porque ali o valor exato (nunca arredondado a zero) sempre faz
 * sentido. "ou R$Y no cartão" é sempre mostrado (com ou sem desconto) —
 * o cartão nunca é escondido, só apresentado como alternativa, nunca como
 * acréscimo.
 */
function DetailDualPrice({
  pricing,
  hasInstallments,
}: {
  pricing: Extract<ProductPricing, { model: "dual" }>;
  hasInstallments: boolean;
}) {
  const hasCashDiscount = pricing.cardPrice > 0 && pricing.cashPrice < pricing.cardPrice;
  const discountAmount = hasCashDiscount ? pricing.cardPrice - pricing.cashPrice : 0;
  const discountPercent = hasCashDiscount ? Math.round((discountAmount / pricing.cardPrice) * 100) : 0;

  return (
    <span className="flex flex-col gap-2.5">
      <span className="flex flex-col gap-1">
        {hasCashDiscount && (
          <span className="text-sm font-normal leading-tight text-text-muted line-through">
            {formatBRL(pricing.cardPrice)}
          </span>
        )}
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-semibold leading-tight text-primary sm:text-3xl">
            {formatBRL(pricing.cashPrice)}
          </span>
          {hasCashDiscount && discountPercent >= 1 && (
            <Badge tone="success" className="px-2.5 py-1 text-[13px] font-semibold sm:text-sm">
              {discountPercent}% OFF no Pix
            </Badge>
          )}
        </span>
        <span className="text-[13px] font-normal leading-tight text-text-muted">à vista</span>
        {hasCashDiscount && (
          <span className="text-sm font-medium leading-tight text-primary/80">
            🩷 Você economiza {formatBRL(discountAmount)}
          </span>
        )}
      </span>

      <span className="flex flex-col gap-0.5">
        <span className="text-base font-semibold leading-tight text-text sm:text-lg">
          ou {formatBRL(pricing.cardPrice)} no cartão
        </span>
        {hasInstallments && (
          <span className="text-sm font-medium leading-tight text-primary sm:text-base">
            em até {pricing.installmentCount}x de {formatBRL(pricing.installmentAmount!)} sem juros
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Bloco de preço do modelo Pix/cartão. `variant="card"` é reaproveitado em
 * todo lugar que mostra preço duplo em formato compacto — Home, Novidades,
 * Busca, Categoria, "Você também pode gostar", Minha Seleção, seleção
 * compartilhada, e as prévias de Configurações/Produtos no Admin — pra
 * nunca haver diferença visual entre eles; JSX e classes desta variante
 * são exatamente as de antes desta mudança, byte a byte.
 *
 * `variant="detail"` é usada SÓ na página pública do produto (ver
 * DetailDualPrice acima) — layout "Modelo 1", pedido explicitamente como
 * mudança isolada da página de produto, nunca dos cards.
 */
export function DualPriceBlock({
  pricing,
  variant,
}: {
  pricing: Extract<ProductPricing, { model: "dual" }>;
  variant: "card" | "detail";
}) {
  const hasInstallments = pricing.installmentCount != null && pricing.installmentAmount != null;

  if (variant === "detail") {
    return <DetailDualPrice pricing={pricing} hasInstallments={hasInstallments} />;
  }

  const sizes = CARD_SIZES;

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
