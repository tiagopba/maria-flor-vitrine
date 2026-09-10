"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { buildFilterQueryString, type ParsedPublicFilters } from "@/lib/catalog/filters";
import { sortProductSizes } from "@/lib/catalog/size-order";
import { QuickFilterChips } from "@/components/catalog/QuickFilterChips";

/**
 * Filtro de TAMANHO DA ETIQUETA (?size=) — mantido por compatibilidade com
 * URLs existentes; a interface principal nova de numeração é
 * FitQuickFilter (?fit=), que substituiu este componente nas telas
 * públicas (Home, Novidades, Categoria). Continua existindo caso algum
 * lugar precise filtrar por etiqueta especificamente.
 *
 * Reaproveita o mesmo mecanismo de URL (buildFilterQueryString) e a mesma
 * apresentação de chip de FitQuickFilter (QuickFilterChips) — só a
 * ordenação (letras antes de números, ver size-order.ts) e o parâmetro
 * filtrado (`size`, nunca `fit`) são específicos deste componente.
 */
export function SizeQuickFilter({
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

  function selectSize(size: string | null) {
    router.push(`${basePath}${buildFilterQueryString({ ...initial, size })}`, { scroll: false });
  }

  return (
    <QuickFilterChips
      label="Qual tamanho você procura?"
      options={sortedSizes.map((size) => ({ value: size, label: size }))}
      selectedValue={initial.size}
      onSelect={selectSize}
    />
  );
}
