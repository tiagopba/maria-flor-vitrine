"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { slugify } from "@/lib/utils";
import type { CategoryFormState } from "./actions";

type CategoryFormAction = (
  state: CategoryFormState,
  formData: FormData
) => Promise<CategoryFormState>;

export interface CategoryFormDefaults {
  name: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
}

const initialState: CategoryFormState = {};

export function CategoryForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: CategoryFormAction;
  defaultValues?: CategoryFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  const [name, setName] = useState(defaultValues?.name ?? "");
  const [slug, setSlug] = useState(defaultValues?.slug ?? "");
  const slugTouched = useRef(Boolean(defaultValues?.slug));

  const [coverImage, setCoverImage] = useState<string | null>(defaultValues?.cover_image ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/categories/cover", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setUploadError(data.error ?? "Falha no upload.");
      } else {
        setCoverImage(data.url as string);
      }
    } catch {
      setUploadError("Falha no upload. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        id="name"
        name="name"
        label="Nome"
        placeholder="Ex: Jeans"
        value={name}
        onChange={(e) => {
          const value = e.target.value;
          setName(value);
          if (!slugTouched.current) setSlug(slugify(value));
        }}
        error={state.fieldErrors?.name}
        required
      />

      <Input
        id="slug"
        name="slug"
        label="Slug (URL)"
        placeholder="jeans"
        value={slug}
        onChange={(e) => {
          slugTouched.current = true;
          setSlug(slugify(e.target.value));
        }}
        error={state.fieldErrors?.slug}
        required
      />
      <p className="-mt-2 text-xs text-text-muted">
        Aparece como /categoria/{slug || "..."}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-text">
          Descrição (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={defaultValues?.description ?? ""}
          rows={2}
          maxLength={280}
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          placeholder="Ex: As novidades em jeans da Maria Flor aparecem aqui."
        />
        {state.fieldErrors?.description && (
          <p className="text-xs text-red-600">{state.fieldErrors.description}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-text">Imagem de capa (opcional)</label>
        <input type="hidden" name="cover_image" value={coverImage ?? ""} />

        {coverImage && (
          <div className="relative mb-1 h-32 w-full overflow-hidden rounded-lg bg-muted">
            <Image src={coverImage} alt="" fill className="object-cover" unoptimized />
          </div>
        )}

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={uploading}
          className="text-sm text-text-muted file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text"
        />
        {uploading && <p className="text-xs text-text-muted">Enviando imagem...</p>}
        {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <Button type="submit" disabled={pending || uploading} className="mt-2">
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
