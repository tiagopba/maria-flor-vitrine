"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { createColorQuickAction } from "./actions";
import type { Color } from "@/lib/db/colors";

/**
 * Drawer "+ Nova cor" — cria e já devolve a cor pro chip-select do
 * formulário de produto selecionar sozinho, sem navegar pra outra
 * página e sem perder nada do que já estava preenchido no produto (essa
 * é uma chamada de Server Action isolada, o form de produto em volta
 * nunca é tocado).
 */
export function ColorQuickAddDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (color: Color) => void;
}) {
  const [name, setName] = useState("");
  const [hexColor, setHexColor] = useState("#d6217d");
  const [useVisualColor, setUseVisualColor] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setName("");
    setHexColor("#d6217d");
    setUseVisualColor(false);
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Informe o nome da cor.");
      return;
    }
    setPending(true);
    setError(null);

    const result = await createColorQuickAction(name, useVisualColor ? hexColor : null);

    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    onCreated(result.color);
    setName("");
    setHexColor("#d6217d");
    setUseVisualColor(false);
  }

  return (
    <Drawer open={open} onClose={handleClose} title="Nova cor">
      <div className="flex flex-col gap-4">
        <Input
          id="new-color-name"
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
