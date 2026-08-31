"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { relateProductToGroupAction, searchProductsForRelateAction } from "./actions";
import type { ProductSearchResult } from "@/lib/db/products";

/**
 * Busca simples por nome/código pra relacionar uma peça já cadastrada
 * como "outra cor deste modelo". Nunca lista o próprio produto (a busca
 * já exclui no servidor); se a peça encontrada já pertencer a outro
 * conjunto de cores, a Server Action devolve o aviso amigável em vez de
 * mover automaticamente.
 */
export function RelateProductModal({
  open,
  onClose,
  currentProductId,
  onRelated,
}: {
  open: boolean;
  onClose: () => void;
  currentProductId: string;
  onRelated: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [relatingId, setRelatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setQuery("");
    setResults([]);
    setError(null);
    onClose();
  }

  async function handleSearch(term: string) {
    setQuery(term);
    setError(null);
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const found = await searchProductsForRelateAction(term, currentProductId);
    setSearching(false);
    setResults(found);
  }

  async function handleRelate(targetId: string) {
    setRelatingId(targetId);
    setError(null);

    const result = await relateProductToGroupAction(currentProductId, targetId);

    setRelatingId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    handleClose();
    onRelated();
  }

  return (
    <Drawer open={open} onClose={handleClose} title="Escolher uma peça já cadastrada">
      <div className="flex flex-col gap-4">
        <Input
          id="relate-search"
          label="Buscar por nome ou código"
          placeholder="Ex: 7284, calça pantalona"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />

        {error && <p className="text-xs text-red-600">{error}</p>}
        {searching && <p className="text-xs text-text-muted">Buscando...</p>}

        <div className="flex flex-col gap-2">
          {results.map((product) => (
            <div key={product.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                {product.mainImageUrl && (
                  <Image src={product.mainImageUrl} alt="" fill className="object-cover" unoptimized />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{product.name}</p>
                <p className="text-xs text-text-muted">
                  Código: {product.code}
                  {product.colorName && ` • ${product.colorName}`}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={relatingId === product.id}
                onClick={() => handleRelate(product.id)}
              >
                {relatingId === product.id ? "Relacionando..." : "Relacionar"}
              </Button>
            </div>
          ))}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-text-muted">Nenhuma peça encontrada.</p>
          )}
        </div>
      </div>
    </Drawer>
  );
}
