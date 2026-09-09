"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { buildFilterQueryString, type ParsedPublicFilters } from "@/lib/catalog/filters";
import { sortProductSizes } from "@/lib/catalog/size-order";
import { cn } from "@/lib/utils";

/**
 * Filtro de tamanho sempre visível nas páginas de categoria, logo antes da
 * grade — o filtro completo (ProductFilters) continua existindo por trás do
 * botão "Filtrar" para preço, mas o tamanho é o filtro mais usado ali e
 * ficava escondido num drawer. Reaproveita o mesmo mecanismo de URL
 * (buildFilterQueryString) em vez de duplicar a lógica de filtragem.
 */
export function CategorySizeQuickFilter({
  basePath,
  initial,
  sizeOptions,
}: {
  basePath: string;
  initial: ParsedPublicFilters;
  sizeOptions: string[];
}) {
  const router = useRouter();
  const sortedSizes = useMemo(() => sortProductSizes(sizeOptions), [sizeOptions]);

  if (sortedSizes.length === 0) return null;

  function selectSize(size: string | null) {
    router.push(`${basePath}${buildFilterQueryString({ ...initial, size })}`, { scroll: false });
  }

  return (
    <div className="mb-6">
      <p className="mb-2 font-display text-sm text-text">Qual tamanho você procura?</p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <SizeChip label="Todos" selected={!initial.size} onClick={() => selectSize(null)} />
        {sortedSizes.map((size) => (
          <SizeChip key={size} label={size} selected={initial.size === size} onClick={() => selectSize(size)} />
        ))}
      </div>
    </div>
  );
}

function SizeChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border px-3.5 text-sm font-medium transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-text hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}
