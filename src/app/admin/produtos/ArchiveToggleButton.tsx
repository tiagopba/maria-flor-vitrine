"use client";

import { useState, useTransition } from "react";
import { toggleArchiveProductAction } from "./actions";

/**
 * Botão Arquivar/Restaurar — antes era um `<form action={...}>` puro, sem
 * confirmação e sem nenhum jeito de mostrar erro (ver o comentário em
 * setProductStatus, lib/db/products.ts, sobre a causa real do bug). Agora
 * pede confirmação simples antes, mostra estado de carregamento durante a
 * chamada e exibe qualquer erro que a Server Action devolver — clicar
 * sempre tem uma reação visível, nunca mais "parece não fazer nada".
 */
export function ArchiveToggleButton({
  productId,
  productName,
  isArchived,
}: {
  productId: string;
  productName: string;
  isArchived: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);

    const confirmed = window.confirm(
      isArchived
        ? `Restaurar "${productName}"? Ela volta a ficar disponível normalmente.`
        : `Arquivar "${productName}"? A peça some da vitrine, busca, categorias e recomendações, mas continua salva e pode ser restaurada depois.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await toggleArchiveProductAction(productId, !isArchived);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-muted disabled:opacity-60"
      >
        {pending ? "Salvando..." : isArchived ? "Restaurar" : "Arquivar"}
      </button>
      {error && <p className="max-w-[180px] text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
