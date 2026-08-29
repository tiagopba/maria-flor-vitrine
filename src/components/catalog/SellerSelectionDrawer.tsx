"use client";

import { Drawer } from "@/components/ui/Drawer";

/**
 * Drawer "Com quem você quer falar?" — usado tanto pelo fluxo de produto
 * individual quanto pelo envio da seleção de Favoritos. Só apresenta as
 * opções e avisa quem chama; toda a lógica de resolver vendedora/round-robin
 * fica no servidor (lib/whatsapp/resolve-seller.ts), nunca duplicada aqui.
 */
export function SellerSelectionDrawer({
  open,
  onClose,
  sellers,
  onChoose,
  submitting,
  error,
}: {
  open: boolean;
  onClose: () => void;
  sellers: { id: string; name: string }[];
  onChoose: (sellerId: string | null) => void;
  /** sellerId sendo processado, "any" para round-robin, ou null se nada em andamento */
  submitting: string | null;
  error: string | null;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Com quem você quer falar?">
      <div className="flex flex-col gap-2">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => onChoose(null)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-primary px-4 py-2.5 text-center text-primary-foreground disabled:opacity-60"
        >
          <span className="text-sm font-medium">{submitting === "any" ? "Abrindo..." : "Qualquer vendedora"}</span>
          {submitting !== "any" && (
            <span className="text-xs opacity-80">Te encaminhamos para uma vendedora disponível.</span>
          )}
        </button>

        {sellers.map((seller) => (
          <button
            key={seller.id}
            type="button"
            disabled={submitting !== null}
            onClick={() => onChoose(seller.id)}
            className="flex h-12 items-center justify-center rounded-xl border border-border text-sm font-medium text-text hover:bg-muted disabled:opacity-60"
          >
            {submitting === seller.id ? "Abrindo..." : seller.name}
          </button>
        ))}

        {sellers.length === 0 && (
          <p className="py-2 text-center text-sm text-text-muted">Nenhuma vendedora cadastrada no momento.</p>
        )}
      </div>
    </Drawer>
  );
}
