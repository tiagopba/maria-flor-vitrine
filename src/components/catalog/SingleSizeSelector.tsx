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
  fitHintByLabel,
}: {
  sizes: string[];
  value: string | null;
  onChange: (size: string) => void;
  label?: string;
  /** "Veste X ao Y" por tamanho — opcional, quando ausente o chip fica exatamente como antes (ex: Minhas Roupas, item 13: nunca lista compatibilidade de todos os tamanhos). */
  fitHintByLabel?: Record<string, string | null>;
}) {
  const sortedSizes = useMemo(() => sortProductSizes(sizes), [sizes]);
  const singleSize = sortedSizes.length === 1 ? sortedSizes[0] : null;

  useEffect(() => {
    if (singleSize && value !== singleSize) onChange(singleSize);
  }, [singleSize, value, onChange]);

  if (sortedSizes.length === 0) return null;

  if (singleSize) {
    const hint = fitHintByLabel?.[singleSize];
    return (
      <p className="text-sm text-text">
        Tamanho: <span className="font-medium">{singleSize}</span>
        {hint && <span className="ml-1.5 text-text-muted">· {hint}</span>}
      </p>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-text">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {sortedSizes.map((size) => {
          const hint = fitHintByLabel?.[size];
          return (
            <div key={size} className="flex flex-col items-center gap-0.5">
              <button
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
              {hint && <span className="text-[10px] text-text-muted">{hint}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
