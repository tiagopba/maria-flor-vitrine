import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { publicStatusBadge } from "@/lib/catalog/status";
import type { ProductListItem } from "@/lib/db/products";

export function ProductCard({ product }: { product: ProductListItem }) {
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

        {/* Favoritos: visual preparado, sem interação ainda */}
        <div className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-text/70">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 21s-6.7-4.35-9.3-8.1C1 10.1 1.8 6.6 4.9 5.3c2.1-.9 4.2 0 5.6 1.9L12 8.7l1.5-1.5c1.4-1.9 3.5-2.8 5.6-1.9 3.1 1.3 3.9 4.8 2.2 7.6C18.7 16.65 12 21 12 21z" />
          </svg>
        </div>

        {badge && (
          <Badge tone="warning" className="absolute bottom-2 left-2">
            {badge}
          </Badge>
        )}
      </div>

      <div className="mt-2">
        <p className="truncate text-sm text-text">{product.name}</p>
        <Price price={product.price} promotionalPrice={product.promotional_price} />
      </div>
    </Link>
  );
}
