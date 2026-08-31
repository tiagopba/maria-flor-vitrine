"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { createSizeQuickAction } from "./actions";
import type { SizeOption } from "@/lib/db/sizes";

/**
 * Drawer "+ Novo tamanho" — cria no catálogo central (size_options) e já
 * devolve o tamanho pro bloco de variante selecionar sozinho, sem perder
 * nada do que já estava preenchido no formulário. Fica disponível pra
 * qualquer produto futuro (mesmo padrão de ColorQuickAddDrawer).
 */
export function SizeQuickAddDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (size: SizeOption) => void;
}) {
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setLabel("");
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (!label.trim()) {
      setError("Informe o tamanho.");
      return;
    }
    setPending(true);
    setError(null);

    const result = await createSizeQuickAction(label);

    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    onCreated(result.size);
    setLabel("");
  }

  return (
    <Drawer open={open} onClose={handleClose} title="Novo tamanho">
      <div className="flex flex-col gap-4">
        <Input
          id="new-size-label"
          label="Tamanho"
          placeholder='Ex: 48 ou "Único"'
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          error={error ?? undefined}
        />

        <Button type="button" onClick={handleSave} disabled={pending} className="mt-1">
          {pending ? "Salvando..." : "Salvar tamanho"}
        </Button>
      </div>
    </Drawer>
  );
}
