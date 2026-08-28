"use client";

import { useCallback } from "react";
import { ImageUploadQueueList } from "@/components/admin/ImageUploadQueueList";
import { useImageUploadQueue } from "@/lib/images/use-image-upload-queue";
import { addProductImagesAction } from "./actions";

/**
 * Upload de fotos adicionais na edição do produto: sobe direto pro
 * Storage a partir do navegador (nunca passa pela Vercel — ver
 * lib/images/upload-client.ts). Cada foto é registrada em product_images
 * assim que a SUA própria upload termina — não espera o lote inteiro, então
 * uma falha em uma foto nunca derruba as que já foram salvas.
 */
export function ProductImageUploader({ productId }: { productId: string }) {
  const handleSuccess = useCallback(
    (result: { path: string }) => {
      addProductImagesAction(productId, [result.path]);
    },
    [productId]
  );

  const imageQueue = useImageUploadQueue("products", handleSuccess);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    imageQueue.addFiles(files);
    event.target.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={handleChange}
        disabled={imageQueue.isUploading}
        className="text-sm text-text-muted file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text"
      />
      <ImageUploadQueueList items={imageQueue.items} onRetry={imageQueue.retry} />
    </div>
  );
}
