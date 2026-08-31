"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { createColorQuickAction } from "@/app/admin/produtos/actions";
import type { Color } from "@/lib/db/colors";
import { updateColorAction } from "./actions";

export function ColorFormDrawer({
  open,
  onClose,
  color,
}: {
  open: boolean;
  onClose: () => void;
  /** null = criar cor nova; preenchido = editar esta cor. */
  color: Color | null;
}) {
  const [name, setName] = useState(color?.name ?? "");
  const [hexColor, setHexColor] = useState(color?.hex_color ?? "#d6217d");
  const [useVisualColor, setUseVisualColor] = useState(Boolean(color?.hex_color));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSave() {
    if (!name.trim()) {
      setError("Informe o nome da cor.");
      return;
    }
    setPending(true);
    setError(null);

    const result = color
      ? await updateColorAction(color.id, name, useVisualColor ? hexColor : null)
      : await createColorQuickAction(name, useVisualColor ? hexColor : null);

    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} title={color ? "Editar cor" : "Nova cor"}>
      <div className="flex flex-col gap-4">
        <Input
          id="color-name"
          label="Nome da cor"
          placeholder="Ex: Azul Royal"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error ?? undefined}
        />

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={useVisualColor}
            onChange={(e) => setUseVisualColor(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Definir cor visual (opcional)
        </label>

        {useVisualColor && (
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={hexColor}
              onChange={(e) => setHexColor(e.target.value)}
              className="h-11 w-14 shrink-0 rounded-lg border border-border bg-surface"
            />
            <span className="text-sm text-text-muted">{hexColor}</span>
          </div>
        )}

        <Button type="button" onClick={handleSave} disabled={pending} className="mt-1">
          {pending ? "Salvando..." : "Salvar cor"}
        </Button>
      </div>
    </Drawer>
  );
}
