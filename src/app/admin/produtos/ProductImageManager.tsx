import Image from "next/image";
import type { ProductImage } from "@/lib/db/products";
import { deleteProductImageAction, moveProductImageAction } from "./actions";
import { ProductImageUploader } from "./ProductImageUploader";

export function ProductImageManager({
  productId,
  images,
}: {
  productId: string;
  images: (ProductImage & { url: string })[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {images.length === 0 ? (
        <p className="text-sm text-text-muted">Nenhuma foto ainda.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((image, index) => (
            <div key={image.id} className="flex flex-col gap-1.5">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <Image src={image.url} alt="" fill className="object-cover" sizes="200px" />
                {index === 0 && (
                  <span className="absolute left-1 top-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Principal
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1">
                <form action={moveProductImageAction.bind(null, productId, image.id, "up")}>
                  <button
                    type="submit"
                    disabled={index === 0}
                    aria-label="Mover para a esquerda"
                    className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-muted disabled:opacity-30"
                  >
                    ←
                  </button>
                </form>
                <form action={moveProductImageAction.bind(null, productId, image.id, "down")}>
                  <button
                    type="submit"
                    disabled={index === images.length - 1}
                    aria-label="Mover para a direita"
                    className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-muted disabled:opacity-30"
                  >
                    →
                  </button>
                </form>
                <form action={deleteProductImageAction.bind(null, productId, image.id)}>
                  <button
                    type="submit"
                    aria-label="Remover foto"
                    className="flex h-7 w-7 items-center justify-center rounded text-red-600 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProductImageUploader productId={productId} />
    </div>
  );
}
