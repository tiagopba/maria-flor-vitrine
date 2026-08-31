"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { CATEGORY_ICON_KEYS, CATEGORY_ICON_REGISTRY, suggestCategoryIconKey, type CategoryIconKey } from "@/lib/catalog/category-icons";
import { createCategoryQuickAction } from "@/app/admin/categorias/actions";
import { slugify } from "@/lib/utils";
import type { Category } from "@/lib/db/categories";

/**
 * Modal "+" ao lado do select de categoria no formulário de produto —
 * cadastro rápido com só o que é realmente obrigatório (nome + ícone).
 * Reaproveita createCategoryQuickAction, que por sua vez reaproveita
 * categorySchema/createCategory (a mesma validação e gravação de
 * /admin/categorias) — nenhuma regra duplicada aqui, só uma UI mais
 * enxuta pro contexto de "preciso de uma categoria nova sem sair do
 * cadastro do produto".
 */
export function CategoryQuickAddModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (category: Category) => void;
}) {
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState<CategoryIconKey>("tag");
  const [iconTouched, setIconTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setName("");
    setIconKey("tag");
    setIconTouched(false);
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Informe o nome da categoria.");
      return;
    }
    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("slug", slugify(name));
    formData.set("icon_key", iconKey);

    const result = await createCategoryQuickAction(formData);

    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    onCreated(result.category);
    setName("");
    setIconKey("tag");
    setIconTouched(false);
  }

  return (
    <Drawer open={open} onClose={handleClose} title="Nova categoria">
      <div className="flex flex-col gap-4">
        <Input
          id="new-category-name"
          label="Nome"
          placeholder="Ex: Vestidos"
          value={name}
          onChange={(e) => {
            const value = e.target.value;
            setName(value);
            if (!iconTouched) setIconKey(suggestCategoryIconKey(value));
          }}
          error={error ?? undefined}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Ícone da categoria</span>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {CATEGORY_ICON_KEYS.map((key) => {
              const { label, Icon } = CATEGORY_ICON_REGISTRY[key];
              const selected = key === iconKey;
              return (
                <button
                  key={key}
                  type="button"
                  title={label}
                  aria-pressed={selected}
                  onClick={() => {
                    setIconTouched(true);
                    setIconKey(key);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors ${
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-text-muted hover:border-primary/40 hover:text-text"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  <span className="text-[10px] leading-tight">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Button type="button" onClick={handleSave} disabled={pending} className="mt-1">
          {pending ? "Salvando..." : "Salvar categoria"}
        </Button>
      </div>
    </Drawer>
  );
}
