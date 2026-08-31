"use client";

import { useCallback, useState } from "react";
import { uploadImageDirect, validateImageFile, type UploadedImage } from "./upload-client";

export interface UploadQueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  /** "validation" = arquivo inválido (retry inútil); "upload" = falha de rede (pode tentar de novo). */
  errorKind?: "validation" | "upload";
  error?: string;
  result?: UploadedImage;
}

/**
 * Fila de upload direto-ao-Storage com estado por item: cada imagem sobe
 * independentemente, então uma falhar nunca derruba nem perde as outras já
 * enviadas. `onSuccess` roda a cada imagem que termina (dá pra já persistir
 * no banco uma a uma, sem esperar o lote inteiro).
 */
export function useImageUploadQueue(bucket: string, onSuccess?: (result: UploadedImage) => void) {
  const [items, setItems] = useState<UploadQueueItem[]>([]);

  const uploadOne = useCallback(
    async (item: UploadQueueItem) => {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "uploading", error: undefined, errorKind: undefined } : i))
      );

      try {
        const result = await uploadImageDirect(bucket, item.file);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "done", result } : i)));
        onSuccess?.(result);
      } catch (err) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "error",
                  errorKind: "upload",
                  error: err instanceof Error ? err.message : "Falha no upload.",
                }
              : i
          )
        );
      }
    },
    [bucket, onSuccess]
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const newItems: UploadQueueItem[] = files.map((file) => {
        const validationError = validateImageFile(file);
        return {
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          status: validationError ? "error" : "uploading",
          errorKind: validationError ? "validation" : undefined,
          error: validationError ?? undefined,
        };
      });

      setItems((prev) => [...prev, ...newItems]);
      newItems.filter((i) => i.status === "uploading").forEach(uploadOne);
    },
    [uploadOne]
  );

  const retry = useCallback(
    (id: string) => {
      setItems((prev) => {
        const item = prev.find((i) => i.id === id);
        if (item) uploadOne(item);
        return prev;
      });
    },
    [uploadOne]
  );

  /** Descarta um item da fila (ex: uma foto com erro que a admin decidiu não reenviar). */
  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const isUploading = items.some((i) => i.status === "uploading");
  const hasUnresolvedError = items.some((i) => i.status === "error");
  /** Ordem de seleção preservada — nunca reordenamos o array, só o status muda. */
  const successfulPaths = items.filter((i) => i.status === "done" && i.result).map((i) => i.result!.path);

  return { items, addFiles, retry, removeItem, isUploading, hasUnresolvedError, successfulPaths };
}
