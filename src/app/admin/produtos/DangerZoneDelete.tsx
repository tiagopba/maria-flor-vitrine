"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProductPermanentlyAction } from "./actions";

/**
 * Exclusão permanente — item 3/5 da correção. Este componente só é
 * renderizado pela página quando `admin.role === "MASTER"` (ver
 * [id]/page.tsx), papel que ainda não existe na arquitetura — na prática
 * ninguém vê isto hoje. A Server Action refaz a checagem de role e de
 * histórico de qualquer forma (nunca confia só no fato deste componente
 * ter sido renderizado), então mesmo se essa condição um dia ficar
 * inconsistente por engano, a ação continua bloqueada no servidor.
 */
export function DangerZoneDelete({
  productId,
  productName,
  productCode,
}: {
  productId: string;
  productName: string;
  productCode: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setConfirmText("");
    setError(null);
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProductPermanentlyAction(productId, confirmText);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push("/admin/produtos");
    });
  }

  return (
    <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-4">
      <h2 className="font-display text-base text-red-700">Zona de perigo</h2>
      <p className="mt-1 text-sm text-red-700/80">
        Excluir permanentemente remove esta peça do banco de dados e não pode ser desfeito.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-full border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          Excluir permanentemente
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm text-text">
            {productName} — Código {productCode}
          </p>
          <label className="text-xs text-text-muted">
            Digite <span className="font-semibold">EXCLUIR</span> para confirmar
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="h-10 rounded-lg border border-red-300 bg-white px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-red-300"
            autoFocus
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={confirmText.trim().toUpperCase() !== "EXCLUIR" || pending}
              onClick={handleDelete}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
            >
              {pending ? "Excluindo..." : "Excluir definitivamente"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-text hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
