"use client";

import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { SingleSizeSelector } from "@/components/catalog/SingleSizeSelector";
import { publicStatusBadge } from "@/lib/catalog/status";
import { removeFavorite, setSelectedSize } from "@/lib/favorites/storage";
import type { ProductDetail } from "@/lib/db/products";
import type { PaymentSettings } from "@/lib/site-settings/payments";

/**
 * Uma peça na lista de /favoritos — imagem à esquerda, informações à
 * direita (prioriza leitura e toque em iPhone). SOLD_OUT mostra aviso e
 * não oferece escolha de tamanho (não faz sentido pedir tamanho de algo
 * que não entra no pedido de disponibilidade).
 */
export function FavoriteProductRow({
  product,
  selectedSize,
  pending,
  rowRef,
  paymentSettings,
}: {
  product: ProductDetail;
  selectedSize: string | null;
  /** true quando essa é a primeira peça sem tamanho escolhido — usado só para o scroll/foco, a mensagem de erro é única, mostrada acima da lista */
  pending?: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  paymentSettings: PaymentSettings;
}) {
  const isSoldOut = product.status === "SOLD_OUT";
  const badge = publicStatusBadge(product.status);
  const mainImage = product.images[0]?.url ?? null;

  return (
    <div
      ref={rowRef}
      className={
        "flex gap-3 rounded-2xl border p-3 transition-colors " +
        (pending ? "border-primary bg-primary/5" : "border-border bg-surface")
      }
    >
      <Link href={`/produto/${product.slug}`} className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-32 sm:w-28">
        {mainImage ? (
          <Image src={mainImage} alt={product.name} fill sizes="120px" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">Sem foto</div>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/produto/${product.slug}`} className="min-w-0">
            <p className="truncate text-sm font-medium text-text">{product.name}</p>
            <p className="text-xs text-text-muted">Código: {product.code}</p>
          </Link>
          <button
            type="button"
            onClick={() => removeFavorite(product.id)}
            className="shrink-0 text-xs font-medium text-text-muted hover:text-red-600"
          >
            Remover
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Price product={product} paymentSettings={paymentSettings} />
          {badge && <Badge tone="warning">{badge}</Badge>}
        </div>

        {isSoldOut ? (
          <p className="text-xs font-medium text-red-600">Esgotado no momento</p>
        ) : (
          <SingleSizeSelector
            sizes={product.sizes}
            value={selectedSize}
            onChange={(size) => setSelectedSize(product.id, size)}
            label="Tamanho"
          />
        )}
      </div>
    </div>
  );
}
