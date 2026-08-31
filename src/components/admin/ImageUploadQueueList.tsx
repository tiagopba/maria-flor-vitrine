import { cn } from "@/lib/utils";
import type { UploadQueueItem } from "@/lib/images/use-image-upload-queue";

export function ImageUploadQueueList({
  items,
  onRetry,
  onRemove,
}: {
  items: UploadQueueItem[];
  onRetry: (id: string) => void;
  /** Descarta um item com erro da fila — sem isso, uma foto que falhou nunca sai da tela. */
  onRemove?: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1">
          <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
            {item.status === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </div>
            )}
            {item.status === "error" && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-600/60 text-lg text-white">
                ✕
              </div>
            )}
          </div>

          {item.status === "error" && (
            <div className="flex max-w-[64px] flex-col items-start gap-0.5">
              <p className={cn("text-[10px] leading-tight text-red-600")}>{item.error}</p>
              {item.errorKind === "upload" && (
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="text-[10px] font-medium text-primary underline"
                >
                  Tentar de novo
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="text-[10px] font-medium text-text-muted underline"
                >
                  Remover
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
