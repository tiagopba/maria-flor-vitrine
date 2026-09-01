"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DualPriceBlock } from "@/components/ui/Price";
import { calculateInstallmentCount } from "@/lib/catalog/installments";
import { buildProductSlugBase } from "@/lib/catalog/product-slug";
import type { Category } from "@/lib/db/categories";
import type { Color } from "@/lib/db/colors";
import type { SizeOption } from "@/lib/db/sizes";
import type { PaymentSettings } from "@/lib/site-settings/payments";
import { discardUnusedUploadAction, saveProductWithVariantsAction } from "./actions";
import { CategoryQuickAddModal } from "./CategoryQuickAddModal";
import { ColorQuickAddDrawer } from "./ColorQuickAddDrawer";
import { RelateProductModal } from "./RelateProductModal";
import { SizeQuickAddDrawer } from "./SizeQuickAddDrawer";
import { VariantBlock, type VariantBlockData, type VariantUploadState } from "./VariantBlock";

function emptyVariant(sizeOptions: SizeOption[], suggestedSizes: string[] = []): VariantBlockData {
  return {
    key: crypto.randomUUID(),
    id: null,
    code: "",
    colorId: null,
    status: "ACTIVE",
    featured: false,
    manualSlug: null,
    initialSlug: null,
    initialCode: "",
    initialColorId: null,
    sizes: suggestedSizes,
    images: [],
    sizeOptions,
  };
}

export interface ProductFormSharedDefaults {
  name: string;
  description: string | null;
  category_id: string;
  price: number;
  promotional_price: number | null;
  cash_price: number | null;
  max_installments_override: number | null;
}

export function ProductForm({
  categories: initialCategories,
  colors: initialColors,
  sizeOptions: initialSizeOptions,
  paymentSettings,
  rootProductId,
  sharedDefaults,
  variantDefaults,
  submitLabel,
}: {
  categories: Category[];
  colors: Color[];
  sizeOptions: SizeOption[];
  paymentSettings: PaymentSettings;
  /** null na criação; id do produto que abriu a tela na edição. */
  rootProductId: string | null;
  sharedDefaults?: ProductFormSharedDefaults;
  variantDefaults?: VariantBlockData[];
  submitLabel: string;
}) {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [categoryId, setCategoryId] = useState(sharedDefaults?.category_id ?? "");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const [colors, setColors] = useState<Color[]>(initialColors);
  const [name, setName] = useState(sharedDefaults?.name ?? "");
  const [description, setDescription] = useState(sharedDefaults?.description ?? "");

  const [price, setPrice] = useState(sharedDefaults?.price != null ? String(sharedDefaults.price) : "");
  const [promotionalPrice, setPromotionalPrice] = useState(
    sharedDefaults?.promotional_price != null ? String(sharedDefaults.promotional_price) : ""
  );
  const [cashPrice, setCashPrice] = useState(
    sharedDefaults?.cash_price != null ? String(sharedDefaults.cash_price) : ""
  );
  const cashPriceHasValue = cashPrice.trim() !== "";
  const promotionalPriceHasValue = promotionalPrice.trim() !== "";

  const [useStoreDefaultInstallments, setUseStoreDefaultInstallments] = useState(
    sharedDefaults?.max_installments_override == null
  );
  const [maxInstallmentsOverride, setMaxInstallmentsOverride] = useState(
    sharedDefaults?.max_installments_override != null ? String(sharedDefaults.max_installments_override) : ""
  );

  const [variants, setVariants] = useState<VariantBlockData[]>(
    variantDefaults && variantDefaults.length > 0 ? variantDefaults : [emptyVariant(initialSizeOptions)]
  );
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);

  const [colorDrawerForKey, setColorDrawerForKey] = useState<string | null>(null);
  const [sizeDrawerForKey, setSizeDrawerForKey] = useState<string | null>(null);
  const [relateModalOpen, setRelateModalOpen] = useState(false);

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Trava síncrona contra clique-duplo/duplo-submit — diferente de `pending`
  // (estado React, só reflete na tela no próximo render), esta ref já vale
  // na mesma tarefa síncrona, então mesmo dois disparos praticamente
  // simultâneos (ex: Enter + clique) nunca chegam a chamar a RPC duas vezes.
  const submittingRef = useRef(false);

  const [uploadStatusByKey, setUploadStatusByKey] = useState<Record<string, VariantUploadState>>({});
  const handleUploadStateChange = useCallback((key: string, state: VariantUploadState) => {
    setUploadStatusByKey((prev) => {
      const current = prev[key];
      if (current && current.uploading === state.uploading && current.hasUnresolvedError === state.hasUnresolvedError && current.errorCount === state.errorCount) {
        return prev;
      }
      return { ...prev, [key]: state };
    });
  }, []);

  /**
   * Aceita tanto um valor pronto quanto um updater `(prev) => next` — o
   * updater é essencial pro upload de várias fotos ao mesmo tempo: cada
   * upload resolve de forma assíncrona e independente, e se o callback de
   * sucesso computasse `next` a partir do `block` capturado no fechamento
   * de quando o upload começou (em vez de a partir do estado mais recente
   * dentro deste próprio `setVariants`), duas fotos terminando perto uma
   * da outra fariam a segunda sobrescrever a primeira — exatamente o bug
   * de "só 1 foto entra" quando várias são selecionadas de uma vez.
   */
  function updateVariant(key: string, updater: VariantBlockData | ((prev: VariantBlockData) => VariantBlockData)) {
    setVariants((prev) => {
      const index = prev.findIndex((v) => v.key === key);
      if (index === -1) return prev;
      const previous = prev[index];
      const next = typeof updater === "function" ? updater(previous) : updater;

      // Só uma cor destacada por modelo: ao marcar "Destacar esta cor"
      // (transição false → true, nunca reage a outros campos mudando),
      // desmarca automaticamente as outras — a Home usa a variante
      // destacada como representante do card (ver group-products-for-display.ts),
      // então duas destacadas no mesmo grupo não têm sentido.
      const justFeatured = next.featured && !previous.featured;
      return prev.map((v, i) => {
        if (i === index) return next;
        if (justFeatured && v.featured) return { ...v, featured: false };
        return v;
      });
    });
  }

  const allColored = variants.every((v) => v.colorId !== null);
  // Regra de negócio (mesma da constraint em saveProductVariantsPayloadSchema
  // e da RPC save_product_with_variants): "Sem cor" só é inválido quando o
  // modelo tem 2+ variantes — com uma peça só, color_id null é uma
  // representação legítima de "sem cor cadastrada". `allColored` continua
  // exigindo cor em QUALQUER contagem porque handleAddColor precisa dela pra
  // impedir criar a 2ª variante enquanto a 1ª ainda está "Sem cor" (isso já
  // levaria a exatamente o estado inválido que a regra proíbe).
  const colorsValidForSave = variants.length === 1 || allColored;
  const anyUploading = variants.some((v) => uploadStatusByKey[v.key]?.uploading);
  const blocksWithUploadErrors = variants.filter((v) => uploadStatusByKey[v.key]?.hasUnresolvedError);
  const hasUnresolvedUploadError = blocksWithUploadErrors.length > 0;

  function blockLabel(block: VariantBlockData): string {
    const index = variants.indexOf(block);
    const colorName = block.colorId ? (colors.find((c) => c.id === block.colorId)?.name ?? null) : null;
    return colorName ?? (index === 0 ? "Peça principal" : `Cor ${index + 1}`);
  }

  function handleAddColor() {
    if (!allColored) {
      setFormError("Escolha a cor desta peça antes de adicionar outra cor.");
      return;
    }
    setFormError(null);
    const suggestion = variants[0]?.sizes ?? [];
    setVariants((prev) => [...prev, emptyVariant(initialSizeOptions, suggestion)]);
  }

  function handleRemoveVariant(block: VariantBlockData) {
    if (block.id) {
      const label = colors.find((c) => c.id === block.colorId)?.name ?? "esta cor";
      const confirmed = window.confirm(
        `Remover ${label} deste modelo? A peça continua existindo normalmente, só deixa de fazer parte deste conjunto de cores.`
      );
      if (!confirmed) return;
      setRemovedVariantIds((prev) => [...prev, block.id!]);
      setVariants((prev) => prev.filter((v) => v.key !== block.key));
      return;
    }

    // Bloco novo, nunca salvo — descarta local e limpa qualquer upload órfão.
    for (const img of block.images) {
      if (img.id === null) discardUnusedUploadAction(img.storage_path);
    }
    setVariants((prev) => prev.filter((v) => v.key !== block.key));
  }

  function duplicateColorNameFor(block: VariantBlockData): string | null {
    if (!block.colorId) return null;
    const dupe = variants.find((v) => v.key !== block.key && v.colorId === block.colorId);
    if (!dupe) return null;
    return dupe.code ? `código ${dupe.code}` : "outra cor já cadastrada com este mesmo tom";
  }

  const nameChanged = name !== (sharedDefaults?.name ?? "");

  /**
   * Enquanto a admin não editar o campo com a própria mão (manualSlug
   * null), um produto JÁ SALVO mantém o slug atual até nome/código/cor
   * mudarem de propósito — não recalcula do zero só por abrir a tela (o
   * slug salvo pode nem seguir mais o padrão nome-código-cor, ex: produto
   * antigo). Um bloco novo (nunca salvo) sempre segue o automático.
   */
  function computeSlug(block: VariantBlockData): string {
    if (block.manualSlug !== null) return block.manualSlug;

    const unchanged =
      block.id !== null && !nameChanged && block.code === block.initialCode && block.colorId === block.initialColorId;
    if (unchanged && block.initialSlug) return block.initialSlug;

    const colorName = block.colorId ? (colors.find((c) => c.id === block.colorId)?.name ?? null) : null;
    return buildProductSlugBase(name, block.code, colorName);
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
  const previewInstallmentAmount =
    previewInstallmentCount != null ? Math.round((priceNum * 100) / previewInstallmentCount) / 100 : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Cobre tanto o clique no botão (já desabilitado nesses casos) quanto o
    // Enter dado num campo de texto — que dispara o submit do form mesmo
    // com o botão desabilitado.
    if (submittingRef.current || pending) return;

    if (anyUploading) {
      setFormError("Aguarde as fotos terminarem de enviar antes de salvar.");
      return;
    }
    if (hasUnresolvedUploadError) {
      setFormError("Corrija ou remova as fotos com erro antes de salvar.");
      return;
    }
    if (!colorsValidForSave) {
      setFormError("Escolha a cor de cada peça antes de salvar.");
      return;
    }

    setFormError(null);
    submittingRef.current = true;
    setPending(true);

    const payload = {
      root_product_id: rootProductId,
      removed_variant_ids: removedVariantIds,
      shared: {
        name,
        description: description.trim() === "" ? null : description.trim(),
        category_id: categoryId,
        price: Number(price),
        promotional_price: promotionalPriceHasValue ? Number(promotionalPrice) : null,
        cash_price: cashPriceHasValue ? Number(cashPrice) : null,
        max_installments_override: useStoreDefaultInstallments
          ? null
          : maxInstallmentsOverride.trim() === ""
            ? null
            : Number(maxInstallmentsOverride),
      },
      variants: variants.map((v) => ({
        id: v.id,
        code: v.code,
        color_id: v.colorId,
        status: v.status,
        featured: v.featured,
        slug: computeSlug(v),
        sizes: v.sizes,
        images: v.images.map((img, i) => ({ id: img.id, storage_path: img.storage_path, position: i })),
      })),
    };

    const result = await saveProductWithVariantsAction(payload);
    setPending(false);
    submittingRef.current = false;

    if ("error" in result) {
      setFormError(result.error);
      return;
    }

    router.push(
      `/admin/produtos/${result.productId}?sucesso=${encodeURIComponent(
        rootProductId ? "Alterações salvas com sucesso." : "Produto cadastrado com sucesso."
      )}`
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category_id" className="text-sm font-medium text-text">
            Categoria
          </label>
          <div className="flex gap-2">
            <select
              id="category_id"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              required
            >
              <option value="">Selecione...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCategoryModalOpen(true)}
              aria-label="Nova categoria"
              title="Nova categoria"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-lg text-text hover:bg-muted"
            >
              +
            </button>
          </div>
        </div>

        <Input
          id="name"
          label="Nome"
          placeholder="Ex: Calça Balloon Poá"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Input
            id="cash_price"
            type="number"
            step="0.01"
            min="0"
            label="Preço no Pix"
            placeholder="179.90"
            value={cashPrice}
            onChange={(e) => setCashPrice(e.target.value)}
            disabled={promotionalPriceHasValue}
          />
          {promotionalPriceHasValue && (
            <p className="text-xs text-text-muted">Indisponível enquanto houver Preço promocional.</p>
          )}
        </div>
        <Input
          id="price"
          type="number"
          step="0.01"
          min="0"
          label="Preço a prazo/cartão"
          placeholder="199.90"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Input
          id="promotional_price"
          type="number"
          step="0.01"
          min="0"
          label="Preço promocional (opcional)"
          value={promotionalPrice}
          onChange={(e) => setPromotionalPrice(e.target.value)}
          disabled={cashPriceHasValue}
        />
        {cashPriceHasValue && <p className="text-xs text-text-muted">Indisponível enquanto houver Preço no Pix.</p>}
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
            type="number"
            step="1"
            min="1"
            label="Máximo de parcelas para este produto"
            value={maxInstallmentsOverride}
            onChange={(e) => setMaxInstallmentsOverride(e.target.value)}
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
                O preço no Pix está desativado nas configurações da loja — a cliente não verá isso até você
                ativar em /admin/configuracoes.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-text">
          Descrição (opcional)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-text">Cores desta peça</span>

        {variants.map((block, index) => (
          <VariantBlock
            key={block.key}
            block={block}
            index={index}
            colors={colors}
            isRoot={index === 0}
            duplicateColorName={duplicateColorNameFor(block)}
            computedSlug={computeSlug(block)}
            onChange={(next) => updateVariant(block.key, next)}
            onRemove={() => handleRemoveVariant(block)}
            onOpenColorDrawer={() => setColorDrawerForKey(block.key)}
            onOpenSizeDrawer={() => setSizeDrawerForKey(block.key)}
            onUploadStateChange={handleUploadStateChange}
          />
        ))}

        <button
          type="button"
          onClick={handleAddColor}
          className="self-start rounded-full border border-dashed border-border px-4 py-2 text-sm text-text-muted hover:border-primary/40 hover:text-text"
        >
          {variants.length === 1 && variants[0].colorId === null ? "+ Adicionar cor" : "+ Adicionar outra cor"}
        </button>

        {rootProductId && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border p-3">
            <span className="text-xs text-text-muted">
              Já cadastrou outra cor desta peça em um cadastro separado?
            </span>
            <button
              type="button"
              onClick={() => setRelateModalOpen(true)}
              className="self-start text-xs font-medium text-primary hover:underline"
            >
              Localizar peça já cadastrada
            </button>
          </div>
        )}
      </div>

      {hasUnresolvedUploadError && (
        <div className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50 p-3">
          {blocksWithUploadErrors.map((block) => {
            const count = uploadStatusByKey[block.key]?.errorCount ?? 0;
            return (
              <p key={block.key} className="text-xs text-red-700">
                <strong>{blockLabel(block).toUpperCase()}:</strong> Não foi possível enviar{" "}
                {count === 1 ? "1 foto" : `${count} fotos`}. Tente novamente ou remova a foto antes de salvar.
              </p>
            );
          })}
        </div>
      )}

      {anyUploading && !hasUnresolvedUploadError && (
        <p className="text-xs text-text-muted">Aguarde as fotos terminarem de enviar antes de salvar.</p>
      )}

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <Button type="submit" disabled={pending || anyUploading || hasUnresolvedUploadError} className="mt-2">
        {pending ? "Salvando..." : anyUploading ? "Enviando fotos..." : submitLabel}
      </Button>

      <CategoryQuickAddModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onCreated={(category) => {
          setCategories((prev) => [...prev, category]);
          setCategoryId(category.id);
          setCategoryModalOpen(false);
        }}
      />

      <ColorQuickAddDrawer
        open={colorDrawerForKey !== null}
        onClose={() => setColorDrawerForKey(null)}
        onCreated={(color) => {
          setColors((prev) => [...prev, color]);
          if (colorDrawerForKey) {
            setVariants((prev) =>
              prev.map((v) => (v.key === colorDrawerForKey ? { ...v, colorId: color.id } : v))
            );
          }
          setColorDrawerForKey(null);
        }}
      />

      <SizeQuickAddDrawer
        open={sizeDrawerForKey !== null}
        onClose={() => setSizeDrawerForKey(null)}
        onCreated={(size) => {
          const forKey = sizeDrawerForKey;
          setVariants((prev) =>
            prev.map((v) => ({
              ...v,
              sizeOptions: [...v.sizeOptions, size],
              sizes: v.key === forKey ? [...v.sizes, size.label] : v.sizes,
            }))
          );
          setSizeDrawerForKey(null);
        }}
      />

      {rootProductId && (
        <RelateProductModal
          open={relateModalOpen}
          onClose={() => setRelateModalOpen(false)}
          currentProductId={rootProductId}
          onRelated={() => {
            setRelateModalOpen(false);
            router.refresh();
          }}
        />
      )}
    </form>
  );
}
