import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { FavoriteButton } from "@/components/catalog/FavoriteButton";
import { publicStatusBadge } from "@/lib/catalog/status";
import type { DisplayGroupSwatch } from "@/lib/catalog/group-products-for-display";
import type { ProductListItem } from "@/lib/db/products";
import type { PaymentSettings } from "@/lib/site-settings/payments";

const MAX_VISIBLE_SWATCHES = 3;

export function ProductCard({
  product,
  paymentSettings,
  swatches = [],
}: {
  product: ProductListItem;
  paymentSettings: PaymentSettings;
  /** Cores do mesmo modelo (mesmo product_group_id) — só faz sentido mostrar com 2+. */
  swatches?: DisplayGroupSwatch[];
}) {
  const badge = publicStatusBadge(product.status);
  const visibleSwatches = swatches.slice(0, MAX_VISIBLE_SWATCHES);
  const hiddenSwatchCount = swatches.length - visibleSwatches.length;

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

        {swatches.length > 1 && (
          <div className="mt-1 flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-1">
              {visibleSwatches.map((s) =>
                s.hex ? (
                  <span
                    key={s.id}
                    title={s.name}
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-border/60"
                    style={{ backgroundColor: s.hex }}
                  />
                ) : (
                  <span
                    key={s.id}
                    className="shrink-0 rounded-full border border-border px-1.5 py-0 text-[9px] leading-4 text-text-muted"
                  >
                    {s.name}
                  </span>
                )
              )}
              {hiddenSwatchCount > 0 && (
                <span className="text-[10px] text-text-muted">+{hiddenSwatchCount} cores</span>
              )}
            </div>
            <p className="text-[10px] text-text-muted">{swatches.length} cores disponíveis</p>
          </div>
        )}
      </div>
    </Link>
  );
}
