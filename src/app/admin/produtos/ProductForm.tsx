"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SizeSelector } from "@/components/catalog/SizeSelector";
import { PRODUCT_STATUS_LABELS } from "@/lib/catalog/status";
import { slugify } from "@/lib/utils";
import type { ProductFormState } from "./actions";

type ProductFormAction = (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;

export interface ProductFormDefaults {
  code: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  promotional_price: number | null;
  category_id: string;
  status: string;
  featured: boolean;
  sizes: string[];
}

const STATUS_OPTIONS = Object.entries(PRODUCT_STATUS_LABELS).filter(([value]) => value !== "ARCHIVED");

const initialState: ProductFormState = {};

export function ProductForm({
  action,
  categories,
  defaultValues,
  submitLabel,
  showImageUpload = false,
}: {
  action: ProductFormAction;
  categories: { id: string; name: string }[];
  defaultValues?: Partial<ProductFormDefaults>;
  submitLabel: string;
  showImageUpload?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  const [name, setName] = useState(defaultValues?.name ?? "");
  const [slug, setSlug] = useState(defaultValues?.slug ?? "");
  const slugTouched = useRef(Boolean(defaultValues?.slug));

  const [sizes, setSizes] = useState<string[]>(defaultValues?.sizes ?? []);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  function handleImagesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setImagePreviews(files.map((file) => URL.createObjectURL(file)));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {showImageUpload && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="images" className="text-sm font-medium text-text">
            Fotos
          </label>
          <input
            id="images"
            name="images"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleImagesChange}
            className="text-sm text-text-muted file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text"
          />
          {imagePreviews.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {imagePreviews.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="h-16 w-16 rounded-lg object-cover" />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input
          id="code"
          name="code"
          label="Código"
          placeholder="MF-7284"
          defaultValue={defaultValues?.code}
          error={state.fieldErrors?.code}
          required
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category_id" className="text-sm font-medium text-text">
            Categoria
          </label>
          <select
            id="category_id"
            name="category_id"
            defaultValue={defaultValues?.category_id ?? ""}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            required
          >
            <option value="">Selecione...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.category_id && (
            <p className="text-xs text-red-600">{state.fieldErrors.category_id}</p>
          )}
        </div>
      </div>

      <Input
        id="name"
        name="name"
        label="Nome"
        placeholder="Ex: Calça Balloon Poá"
        value={name}
        onChange={(e) => {
          const v = e.target.value;
          setName(v);
          if (!slugTouched.current) setSlug(slugify(v));
        }}
        error={state.fieldErrors?.name}
        required
      />

      <Input
        id="slug"
        name="slug"
        label="Slug (URL)"
        value={slug}
        onChange={(e) => {
          slugTouched.current = true;
          setSlug(slugify(e.target.value));
        }}
        error={state.fieldErrors?.slug}
        required
      />
      <p className="-mt-2 text-xs text-text-muted">Aparece como /produto/{slug || "..."}</p>

      <div className="grid grid-cols-2 gap-4">
        <Input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0"
          label="Preço"
          placeholder="199.90"
          defaultValue={defaultValues?.price}
          error={state.fieldErrors?.price}
          required
        />
        <Input
          id="promotional_price"
          name="promotional_price"
          type="number"
          step="0.01"
          min="0"
          label="Preço promocional (opcional)"
          placeholder=""
          defaultValue={defaultValues?.promotional_price ?? ""}
          error={state.fieldErrors?.promotional_price}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Tamanhos</span>
        <SizeSelector name="sizes" value={sizes} onChange={setSizes} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className="text-sm font-medium text-text">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={defaultValues?.status ?? "ACTIVE"}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        >
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          name="featured"
          defaultChecked={defaultValues?.featured}
          className="h-4 w-4 rounded border-border"
        />
        Destaque na vitrine
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-text">
          Descrição (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={defaultValues?.description ?? ""}
          rows={3}
          maxLength={2000}
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
