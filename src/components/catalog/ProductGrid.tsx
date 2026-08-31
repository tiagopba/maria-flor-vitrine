import { GroupedProductGrid } from "@/components/catalog/GroupedProductGrid";
import { groupProductsForDisplay } from "@/lib/catalog/group-products-for-display";
import type { ProductListItem } from "@/lib/db/products";
import type { PaymentSettings } from "@/lib/site-settings/payments";

/**
 * Agrupa por product_group_id antes de renderizar (Home, Novidades,
 * Categoria, "Você também pode gostar") — um modelo com 2+ cores vira 1
 * card só, nunca um card por cor (ver lib/catalog/group-products-for-display.ts).
 * A busca usa GroupedProductGrid diretamente porque precisa de uma regra
 * de agrupamento diferente (código nunca some dentro do grupo).
 */
export function ProductGrid({
  products,
  paymentSettings,
}: {
  products: ProductListItem[];
  paymentSettings: PaymentSettings;
}) {
  const groups = groupProductsForDisplay(products);
  return <GroupedProductGrid groups={groups} paymentSettings={paymentSettings} />;
}
