"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ImageUploadQueueList } from "@/components/admin/ImageUploadQueueList";
import { SizeSelector } from "@/components/catalog/SizeSelector";
import { PRODUCT_STATUS_LABELS } from "@/lib/catalog/status";
import type { Color } from "@/lib/db/colors";
import type { SizeOption } from "@/lib/db/sizes";
import { useImageUploadQueue } from "@/lib/images/use-image-upload-queue";
import { slugify } from "@/lib/utils";
import { discardUnusedUploadAction } from "./actions";

const STATUS_OPTIONS = Object.entries(PRODUCT_STATUS_LABELS).filter(([value]) => value !== "ARCHIVED");

export interface VariantGalleryImage {
  id: string | null;
  storage_path: string;
  url: string;
}

export interface VariantBlockData {
  /** Chave local estável (nunca muda enquanto o bloco existe na tela) — não é o id do produto. */
  key: string;
  /** id real do produto, só quando esta variante já existe salva. */
  id: string | null;
  code: string;
  colorId: string | null;
  status: string;
  featured: boolean;
  /** Slug digitado à mão nesta sessão — enquanto null, o slug acompanha nome/código/cor ao vivo. */
  manualSlug: string | null;
  /** Slug/código/cor como estavam ao carregar a tela — só relevante quando `id` não é null. */
  initialSlug: string | null;
  initialCode: string;
  initialColorId: string | null;
  sizes: string[];
  images: VariantGalleryImage[];
  /** Tamanhos disponíveis pra esta variante (ativos ∪ já usados aqui mesmo que inativos). */
  sizeOptions: SizeOption[];
}

export interface VariantUploadState {
  uploading: boolean;
  hasUnresolvedError: boolean;
  errorCount: number;
}

export function VariantBlock({
  block,
  index,
  colors,
  isRoot,
  duplicateColorName,
  computedSlug,
  onChange,
  onRemove,
  onOpenColorDrawer,
  onOpenSizeDrawer,
  onUploadStateChange,
}: {
  block: VariantBlockData;
  index: number;
  colors: Color[];
  isRoot: boolean;
  duplicateColorName: string | null;
  computedSlug: string;
  /** Aceita um valor pronto ou um updater `(prev) => next` — ver comentário em ProductForm.updateVariant sobre por que isso é obrigatório pro upload de várias fotos simultâneas. */
  onChange: (next: VariantBlockData | ((prev: VariantBlockData) => VariantBlockData)) => void;
  onRemove: () => void;
  onOpenColorDrawer: () => void;
  onOpenSizeDrawer: () => void;
  /** Notifica o ProductForm sempre que a fila de upload desta cor muda — é assim que o botão "Salvar" sabe se alguma cor ainda tem foto em andamento ou com erro. */
  onUploadStateChange: (key: string, state: VariantUploadState) => void;
}) {
  const colorName = block.colorId ? (colors.find((c) => c.id === block.colorId)?.name ?? null) : null;
  const title = colorName ?? (index === 0 ? "PEÇA PRINCIPAL" : "NOVA COR");

  // Sempre via updater (nunca `{...block, ...patch}` direto): `block` é o
  // valor da prop NO RENDER ATUAL, e várias fotos podem terminar de subir
  // em sequência rápida antes de um re-render acontecer — computar a
  // partir do estado mais recente dentro do próprio setVariants (ver
  // ProductForm.updateVariant) é o que evita uma foto sobrescrever a outra.
  function update(patch: Partial<VariantBlockData>) {
    onChange((prev) => ({ ...prev, ...patch }));
  }

  const imageQueue = useImageUploadQueue("products", (result) => {
    onChange((prev) => ({
      ...prev,
      images: [...prev.images, { id: null, storage_path: result.path, url: result.url }],
    }));
  });

  const errorCount = imageQueue.items.filter((i) => i.status === "error").length;

  // Sincroniza o estado da fila de upload desta cor com o ProductForm — é
  // uma notificação pra um sistema externo (o botão "Salvar", que precisa
  // saber o estado agregado de TODAS as cores), não um setState local.
  useEffect(() => {
    onUploadStateChange(block.key, {
      uploading: imageQueue.isUploading,
      hasUnresolvedError: imageQueue.hasUnresolvedError,
      errorCount,
    });
  }, [block.key, imageQueue.isUploading, imageQueue.hasUnresolvedError, errorCount, onUploadStateChange]);

  function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    imageQueue.addFiles(files);
    event.target.value = "";
  }

  // As três funções abaixo identificam a foto pela referência do objeto
  // (nunca por índice) e recalculam contra `prev.images` dentro do próprio
  // updater — mesmo motivo do onSuccess do upload: um clique de reordenar/
  // remover pode acontecer bem na hora que outra foto termina de subir, e
  // só assim as duas mudanças convivem em vez de uma apagar a outra.
  function moveImage(img: VariantGalleryImage, direction: "left" | "right") {
    onChange((prev) => {
      const imgIndex = prev.images.indexOf(img);
      if (imgIndex === -1) return prev;
      const targetIndex = direction === "left" ? imgIndex - 1 : imgIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.images.length) return prev;
      const next = [...prev.images];
      [next[imgIndex], next[targetIndex]] = [next[targetIndex], next[imgIndex]];
      return { ...prev, images: next };
    });
  }

  /** Move a foto direto pra position 0 — bem mais rápido no celular do que várias setinhas. */
  function makePrimary(img: VariantGalleryImage) {
    onChange((prev) => ({ ...prev, images: [img, ...prev.images.filter((i) => i !== img)] }));
  }

  function removeImage(img: VariantGalleryImage) {
    if (img.id === null) {
      // Ainda não pertence a nenhum produto salvo — seguro apagar do
      // Storage na hora (nada no banco referencia esse arquivo).
      discardUnusedUploadAction(img.storage_path);
    }
    onChange((prev) => ({ ...prev, images: prev.images.filter((i) => i !== img) }));
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-wide text-text">{title}</span>
        {!isRoot && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs font-medium text-red-600 hover:underline"
          >
            {block.id ? "Remover esta cor" : "Descartar"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Código</label>
          <input
            value={block.code}
            onChange={(e) => update({ code: e.target.value })}
            placeholder="MF-7284"
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Status</label>
          <select
            value={block.status}
            onChange={(e) => update({ status: e.target.value })}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text">Cor desta peça</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => update({ colorId: null })}
            className={`flex h-9 items-center rounded-full border px-3.5 text-sm transition-colors ${
              block.colorId === null ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted"
            }`}
          >
            Sem cor
          </button>
          {colors.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => update({ colorId: c.id })}
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
                block.colorId === c.id ? "border-primary bg-primary/10 text-primary" : "border-border text-text"
              }`}
            >
              {c.hex_color && (
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-border/60"
                  style={{ backgroundColor: c.hex_color }}
                />
              )}
              {c.name}
            </button>
          ))}
          <button
            type="button"
            onClick={onOpenColorDrawer}
            className="flex h-9 items-center rounded-full border border-dashed border-border px-3.5 text-sm text-text-muted hover:border-primary/40 hover:text-text"
          >
            + Nova cor
          </button>
        </div>
        {duplicateColorName && (
          <p className="text-xs text-amber-700">
            Já existe outra peça desta cor neste modelo: {duplicateColorName}. Você pode continuar se for
            intencional.
          </p>
        )}
      </div>

      <SlugField block={block} computedSlug={computedSlug} onChange={onChange} />

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={block.featured}
          onChange={(e) => update({ featured: e.target.checked })}
          className="h-4 w-4 rounded border-border"
        />
        Destacar esta cor
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Fotos</span>
        {block.images.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {block.images.map((img, imgIndex) => {
              const isPrimary = imgIndex === 0;
              return (
                <div key={img.id ?? img.storage_path} className="flex w-24 shrink-0 flex-col gap-1.5">
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                    <Image src={img.url} alt="" fill className="object-cover" sizes="96px" />
                    {isPrimary && (
                      <span className="absolute left-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
                        Principal
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(img)}
                      aria-label="Remover foto"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs leading-none text-white hover:bg-black/80"
                    >
                      ✕
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isPrimary}
                    onClick={() => makePrimary(img)}
                    className="flex h-7 items-center justify-center gap-1 rounded-full border border-border text-[10px] font-medium text-text-muted hover:border-primary/40 hover:text-text disabled:pointer-events-none disabled:opacity-30"
                  >
                    ★ Tornar principal
                  </button>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      disabled={imgIndex === 0}
                      onClick={() => moveImage(img, "left")}
                      aria-label="Mover para a esquerda"
                      className="flex h-8 w-8 items-center justify-center rounded text-text-muted hover:bg-muted disabled:opacity-30"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={imgIndex === block.images.length - 1}
                      onClick={() => moveImage(img, "right")}
                      aria-label="Mover para a direita"
                      className="flex h-8 w-8 items-center justify-center rounded text-text-muted hover:bg-muted disabled:opacity-30"
                    >
                      →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          onChange={handleFilesChange}
          disabled={imageQueue.isUploading}
          className="text-sm text-text-muted file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text"
        />
        {/* Item "done" já apareceu no grid principal (com Principal/★/←→/✕)
            assim que a foto entrou em block.images — mostrar de novo aqui
            seria uma miniatura duplicada e sem nenhum controle, só confusão. */}
        <ImageUploadQueueList
          items={imageQueue.items.filter((i) => i.status !== "done")}
          onRetry={imageQueue.retry}
          onRemove={imageQueue.removeItem}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text">Tamanhos</span>
          <button
            type="button"
            onClick={onOpenSizeDrawer}
            className="text-xs font-medium text-primary hover:underline"
          >
            + Novo tamanho
          </button>
        </div>
        <SizeSelector value={block.sizes} onChange={(sizes) => update({ sizes })} options={block.sizeOptions} />
      </div>
    </div>
  );
}

/**
 * Enquanto `manualSlug` for null, o endereço acompanha nome/código/cor ao
 * vivo (e, num produto já salvo, permanece igual ao que já estava gravado
 * até um desses três campos mudar de propósito — nunca recalcula do zero
 * só por abrir a tela). Assim que a admin edita o campo com a própria mão,
 * o formulário passa a respeitar exatamente o que foi digitado.
 */
function SlugField({
  block,
  computedSlug,
  onChange,
}: {
  block: VariantBlockData;
  computedSlug: string;
  onChange: (next: VariantBlockData) => void;
}) {
  const [editing, setEditing] = useState(block.manualSlug !== null);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
        <span className="truncate">/produto/{computedSlug || "..."}</span>
        <button
          type="button"
          onClick={() => {
            onChange({ ...block, manualSlug: computedSlug });
            setEditing(true);
          }}
          className="shrink-0 font-medium text-primary hover:underline"
        >
          Editar endereço
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text">Endereço (URL)</label>
      <input
        value={block.manualSlug ?? computedSlug}
        onChange={(e) => onChange({ ...block, manualSlug: slugify(e.target.value) })}
        className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
      />
      <button
        type="button"
        onClick={() => {
          onChange({ ...block, manualSlug: null });
          setEditing(false);
        }}
        className="self-start text-xs text-text-muted hover:text-text"
      >
        Voltar a gerar automaticamente
      </button>
    </div>
  );
}
