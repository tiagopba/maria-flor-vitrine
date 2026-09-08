"use client";

import { useEffect, useMemo } from "react";
import { sortProductSizes } from "@/lib/catalog/size-order";
import { cn } from "@/lib/utils";

/**
 * Escolha de UM tamanho entre as opções cadastradas do produto — usada na
 * página de produto individual e em cada peça da lista de Favoritos
 * (mesmo componente nos dois, para não duplicar a regra de "só um
 * tamanho = seleciona sozinho"). Ordena aqui dentro (não em cada chamador)
 * pelo mesmo motivo: um único lugar decide a ordem de exibição pra
 * qualquer tela que use este seletor, hoje ou no futuro — ver
 * lib/catalog/size-order.ts.
 */
export function SingleSizeSelector({
  sizes,
  value,
  onChange,
  label = "Selecione o tamanho",
}: {
  sizes: string[];
  value: string | null;
  onChange: (size: string) => void;
  label?: string;
}) {
  const sortedSizes = useMemo(() => sortProductSizes(sizes), [sizes]);
  const singleSize = sortedSizes.length === 1 ? sortedSizes[0] : null;

  useEffect(() => {
    if (singleSize && value !== singleSize) onChange(singleSize);
  }, [singleSize, value, onChange]);

  if (sortedSizes.length === 0) return null;

  if (singleSize) {
    return (
      <p className="text-sm text-text">
        Tamanho: <span className="font-medium">{singleSize}</span>
      </p>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-text">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {sortedSizes.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onChange(size)}
            aria-pressed={value === size}
            className={cn(
              "flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors",
              value === size
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-text hover:bg-muted"
            )}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
}
