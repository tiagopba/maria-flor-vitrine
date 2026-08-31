import { ProductCard } from "@/components/catalog/ProductCard";
import type { DisplayGroup } from "@/lib/catalog/group-products-for-display";
import type { PaymentSettings } from "@/lib/site-settings/payments";

/**
 * Renderiza grupos já montados (ver groupProductsForDisplay) — usado
 * diretamente pela busca, que precisa de uma regra especial (item 8: busca
 * por código nunca esconde o resultado exato dentro de um agrupamento).
 * ProductGrid é a versão simples que agrupa sozinha, pra quem não precisa
 * dessa regra.
 */
export function GroupedProductGrid({
  groups,
  paymentSettings,
}: {
  groups: DisplayGroup[];
  paymentSettings: PaymentSettings;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {groups.map((group) => (
        <ProductCard
          key={group.representative.id}
          product={group.representative}
          paymentSettings={paymentSettings}
          swatches={group.swatches}
        />
      ))}
    </div>
  );
}
