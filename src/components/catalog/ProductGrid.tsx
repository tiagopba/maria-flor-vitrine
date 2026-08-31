import { ProductCard } from "@/components/catalog/ProductCard";
import type { ProductListItem } from "@/lib/db/products";
import type { PaymentSettings } from "@/lib/site-settings/payments";

export function ProductGrid({
  products,
  paymentSettings,
}: {
  products: ProductListItem[];
  paymentSettings: PaymentSettings;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} paymentSettings={paymentSettings} />
      ))}
    </div>
  );
}
