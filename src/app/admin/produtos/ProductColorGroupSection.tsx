"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ensureProductGroupAction } from "./actions";
import { RelateProductModal } from "./RelateProductModal";
import type { Color } from "@/lib/db/colors";
import type { GroupSibling } from "@/lib/db/product-groups";

/**
 * "Este mesmo modelo existe em outras cores?" — só aparece depois da
 * peça já estar salva (precisa de um id de verdade pra relacionar) e só
 * quando ela tem cor definida (não faz sentido "outras cores" sem cor
 * própria). Linguagem sempre em termos de "conjunto de cores"/"modelo",
 * nunca "grupo" ou UUID — isso é implementação interna.
 */
export function ProductColorGroupSection({
  productId,
  siblings,
  colors,
}: {
  productId: string;
  siblings: GroupSibling[];
  colors: Color[];
}) {
  const router = useRouter();
  const [hasOtherColors, setHasOtherColors] = useState(siblings.length > 0);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [relateOpen, setRelateOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colorNameById = new Map(colors.map((c) => [c.id, c.name]));

  async function handleCreateNewColor() {
    setPending(true);
    setError(null);
    const result = await ensureProductGroupAction(productId);
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setActionSheetOpen(false);
    router.push(`/admin/produtos/novo?duplicar=${productId}&group=${result.groupId}`);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3.5">
      <span className="text-sm font-medium text-text">Este mesmo modelo existe em outras cores?</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setHasOtherColors(false)}
          className={`h-9 rounded-full border px-4 text-sm transition-colors ${
            !hasOtherColors ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted"
          }`}
        >
          Não
        </button>
        <button
          type="button"
          onClick={() => setHasOtherColors(true)}
          className={`h-9 rounded-full border px-4 text-sm transition-colors ${
            hasOtherColors ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted"
          }`}
        >
          Sim
        </button>
      </div>

      {hasOtherColors && (
        <div className="mt-2 flex flex-col gap-2">
          <span className="text-sm font-medium text-text">Cores deste modelo</span>
          {siblings.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <span key={s.id} className="rounded-full bg-muted px-3 py-1.5 text-xs text-text">
                  {s.colorId ? (colorNameById.get(s.colorId) ?? s.name) : s.name}
                </span>
              ))}
            </div>
          )}
          <Button type="button" variant="secondary" onClick={() => setActionSheetOpen(true)} className="self-start">
            + Cadastrar outra cor
          </Button>
          <p className="text-xs text-text-muted">
            Quando a cliente abrir esta peça, ela poderá escolher entre essas outras cores.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}

      <Drawer open={actionSheetOpen} onClose={() => setActionSheetOpen(false)} title="O que você deseja fazer?">
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={handleCreateNewColor} disabled={pending}>
            {pending ? "Preparando..." : "Cadastrar uma nova peça em outra cor"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setActionSheetOpen(false);
              setRelateOpen(true);
            }}
          >
            Escolher uma peça que já está cadastrada
          </Button>
        </div>
      </Drawer>

      <RelateProductModal
        open={relateOpen}
        onClose={() => setRelateOpen(false)}
        currentProductId={productId}
        onRelated={() => router.refresh()}
      />
    </div>
  );
}
