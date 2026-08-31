"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DualPriceBlock } from "@/components/ui/Price";
import { ImageUploadQueueList } from "@/components/admin/ImageUploadQueueList";
import { SizeSelector } from "@/components/catalog/SizeSelector";
import { calculateInstallmentCount } from "@/lib/catalog/installments";
import { PRODUCT_STATUS_LABELS } from "@/lib/catalog/status";
import { useImageUploadQueue } from "@/lib/images/use-image-upload-queue";
import type { PaymentSettings } from "@/lib/site-settings/payments";
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
  cash_price: number | null;
  max_installments_override: number | null;
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
  paymentSettings,
}: {
  action: ProductFormAction;
  categories: { id: string; name: string }[];
  defaultValues?: Partial<ProductFormDefaults>;
  submitLabel: string;
  showImageUpload?: boolean;
  paymentSettings: PaymentSettings;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  const [name, setName] = useState(defaultValues?.name ?? "");
  const [slug, setSlug] = useState(defaultValues?.slug ?? "");
  const slugTouched = useRef(Boolean(defaultValues?.slug));

  const [sizes, setSizes] = useState<string[]>(defaultValues?.sizes ?? []);
  const imageQueue = useImageUploadQueue("products");

  // Preço no Pix e Preço promocional são mutuamente exclusivos nesta
  // versão (regra de promoção + Pix ainda não definida) — desabilitar um
  // campo quando o outro tem valor evita a cliente-admin preencher os dois
  // e só descobrir o erro ao salvar. Campo desabilitado não entra no
  // FormData no submit, então isso já garante o null do lado certo sem
  // nenhum código extra.
  const [price, setPrice] = useState(defaultValues?.price != null ? String(defaultValues.price) : "");
  const [promotionalPrice, setPromotionalPrice] = useState(
    defaultValues?.promotional_price != null ? String(defaultValues.promotional_price) : ""
  );
  const [cashPrice, setCashPrice] = useState(
    defaultValues?.cash_price != null ? String(defaultValues.cash_price) : ""
  );
  const cashPriceHasValue = cashPrice.trim() !== "";
  const promotionalPriceHasValue = promotionalPrice.trim() !== "";

  const [useStoreDefaultInstallments, setUseStoreDefaultInstallments] = useState(
    defaultValues?.max_installments_override == null
  );
  const [maxInstallmentsOverride, setMaxInstallmentsOverride] = useState(
    defaultValues?.max_installments_override != null ? String(defaultValues.max_installments_override) : ""
  );

  function handleImagesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    imageQueue.addFiles(files);
    event.target.value = "";
  }

  const priceNum = Number(price);
  const cashPriceNum = Number(cashPrice);
  const showPreview = cashPriceHasValue && Number.isFinite(cashPriceNum) && Number.isFinite(priceNum) && priceNum > 0;
  const previewInstallmentCount = showPreview
    ? calculateInstallmentCount({
        price: priceNum,
        maxInstallmentsOverride: useStoreDefaultInstallments ? null : Number(maxInstallmentsOverride) || null,
        defaultMaxInstallments: paymentSettings.defaultMaxInstallments,
        minInstallmentValue: paymentSettings.minInstallmentValue,
        installmentsEnabled: paymentSettings.installmentsEnabled,
      })
    : null;
  // Mesmo arredondamento de lib/catalog/pricing.ts — a prévia precisa bater
  // exatamente com o que a cliente vai ver no card/página de verdade.
  const previewInstallmentAmount =
    previewInstallmentCount != null ? Math.round((priceNum * 100) / previewInstallmentCount) / 100 : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {showImageUpload && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="images" className="text-sm font-medium text-text">
            Fotos
          </label>
          {imageQueue.successfulPaths.map((path) => (
            <input key={path} type="hidden" name="image_paths" value={path} />
          ))}
          <input
            id="images"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            onChange={handleImagesChange}
            disabled={imageQueue.isUploading}
            className="text-sm text-text-muted file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text"
          />
          <ImageUploadQueueList items={imageQueue.items} onRetry={imageQueue.retry} />
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
        <div className="flex flex-col gap-1.5">
          <Input
            id="cash_price"
            name="cash_price"
            type="number"
            step="0.01"
            min="0"
            label="Preço no Pix"
            placeholder="179.90"
            value={cashPrice}
            onChange={(e) => setCashPrice(e.target.value)}
            disabled={promotionalPriceHasValue}
            error={promotionalPriceHasValue ? undefined : state.fieldErrors?.cash_price}
          />
          {promotionalPriceHasValue && (
            <p className="text-xs text-text-muted">Indisponível enquanto houver Preço promocional.</p>
          )}
        </div>
        <Input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0"
          label="Preço a prazo/cartão"
          placeholder="199.90"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={state.fieldErrors?.price}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Input
          id="promotional_price"
          name="promotional_price"
          type="number"
          step="0.01"
          min="0"
          label="Preço promocional (opcional)"
          placeholder=""
          value={promotionalPrice}
          onChange={(e) => setPromotionalPrice(e.target.value)}
          disabled={cashPriceHasValue}
          error={cashPriceHasValue ? undefined : state.fieldErrors?.promotional_price}
        />
        {cashPriceHasValue && (
          <p className="text-xs text-text-muted">Indisponível enquanto houver Preço no Pix.</p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border p-3.5">
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={useStoreDefaultInstallments}
            onChange={(e) => setUseStoreDefaultInstallments(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Usar parcelamento padrão da loja ({paymentSettings.defaultMaxInstallments}x)
        </label>

        {!useStoreDefaultInstallments && (
          <Input
            id="max_installments_override"
            name="max_installments_override"
            type="number"
            step="1"
            min="1"
            label="Máximo de parcelas para este produto"
            value={maxInstallmentsOverride}
            onChange={(e) => setMaxInstallmentsOverride(e.target.value)}
            error={state.fieldErrors?.max_installments_override}
          />
        )}

        {showPreview && (
          <div className="mt-1 rounded-lg bg-muted/60 p-3">
            <p className="mb-1 text-xs font-medium text-text-muted">A cliente verá</p>
            {paymentSettings.cashPriceEnabled ? (
              <DualPriceBlock
                pricing={{
                  model: "dual",
                  cashPrice: cashPriceNum,
                  cardPrice: priceNum,
                  installmentCount: previewInstallmentCount,
                  installmentAmount: previewInstallmentAmount,
                }}
                variant="card"
              />
            ) : (
              <p className="text-xs text-amber-700">
                O preço no Pix está desativado nas configurações da loja — a cliente não verá isso até
                você ativar em /admin/configuracoes.
              </p>
            )}
          </div>
        )}
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

      <Button type="submit" disabled={pending || imageQueue.isUploading} className="mt-2">
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
