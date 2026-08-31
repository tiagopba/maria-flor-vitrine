import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { FavoriteButton } from "@/components/catalog/FavoriteButton";
import { publicStatusBadge } from "@/lib/catalog/status";
import type { ProductListItem } from "@/lib/db/products";
import type { PaymentSettings } from "@/lib/site-settings/payments";

export function ProductCard({
  product,
  paymentSettings,
}: {
  product: ProductListItem;
  paymentSettings: PaymentSettings;
}) {
  const badge = publicStatusBadge(product.status);

  return (
    <Link href={`/produto/${product.slug}`} className="group block">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted">
        {product.mainImageUrl ? (
          <Image
            src={product.mainImageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            Sem foto
          </div>
        )}

        <FavoriteButton productId={product.id} size="sm" className="absolute right-2 top-2" />

        {badge && (
          <Badge tone="warning" className="absolute bottom-2 left-2">
            {badge}
          </Badge>
        )}
      </div>

      <div className="mt-2">
        <p className="truncate text-sm text-text">{product.name}</p>
        <Price product={product} paymentSettings={paymentSettings} />
      </div>
    </Link>
  );
}
