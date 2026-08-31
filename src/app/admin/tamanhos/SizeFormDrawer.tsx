"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { createSizeQuickAction } from "@/app/admin/produtos/actions";
import type { SizeOption } from "@/lib/db/sizes";
import { renameSizeOptionAction } from "./actions";

export function SizeFormDrawer({
  open,
  onClose,
  size,
}: {
  open: boolean;
  onClose: () => void;
  /** null = criar tamanho novo; preenchido = renomear este tamanho. */
  size: SizeOption | null;
}) {
  const [label, setLabel] = useState(size?.label ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSave() {
    if (!label.trim()) {
      setError("Informe o tamanho.");
      return;
    }
    setPending(true);
    setError(null);

    const result = size ? await renameSizeOptionAction(size.id, label) : await createSizeQuickAction(label);

    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} title={size ? "Renomear tamanho" : "Novo tamanho"}>
      <div className="flex flex-col gap-4">
        <Input
          id="size-label"
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
