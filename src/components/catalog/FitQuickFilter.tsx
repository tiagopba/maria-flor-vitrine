"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { buildFilterQueryString, type ParsedPublicFilters } from "@/lib/catalog/filters";
import { getPreferredFitSize, setPreferredFitSize } from "@/lib/catalog/fit-size-storage";
import { QuickFilterChips } from "@/components/catalog/QuickFilterChips";

// Sem evento de mudança real pra assinar (localStorage não notifica outras
// abas/nem é preciso aqui) — só usamos useSyncExternalStore pelo
// getServerSnapshot: SSR/primeira renderização de hidratação sempre vêem
// `null` (nunca o valor real do navegador), e só depois de hidratar o
// React troca pelo valor de verdade — sem isso, ler localStorage direto
// num useState ou efeito ou arriscaria um mismatch de hidratação (o HTML
// do servidor nunca pode saber essa preferência) ou cairia na regra de
// lint "não chamar setState dentro de efeito".
function subscribeNever() {
  return () => {};
}

/**
 * Filtro público novo por NUMERAÇÃO QUE VESTE (?fit=), a experiência
 * principal da Etapa 2 — substitui SizeQuickFilter nas telas públicas
 * (Home, Novidades, Categoria). Nunca gera `?size=` (esse parâmetro
 * continua existindo só para compatibilidade com URLs antigas).
 *
 * Usado tanto nas páginas de categoria/Novidades (onde filtra a própria
 * listagem) quanto como atalho na Home (basePath="/novidades" com a
 * página atual sendo "/" — o clique só navega, nunca filtra os 16 cards
 * da Home; mesmo truque de sempre, `initial` vem vazio).
 *
 * "Minha numeração" (localStorage) só sugere — nunca filtra sozinho uma
 * página aberta sem `?fit=` explícito na URL.
 */
export function FitQuickFilter({
  basePath,
  initial,
  fitOptions,
}: {
  basePath: string;
  initial: ParsedPublicFilters;
  fitOptions: number[];
}) {
  const router = useRouter();
  const preferredFitSize = useSyncExternalStore(subscribeNever, getPreferredFitSize, () => null);

  const sortedFitSizes = [...fitOptions].sort((a, b) => a - b);

  function selectFit(fit: number | null) {
    if (fit != null) setPreferredFitSize(fit);
    router.push(`${basePath}${buildFilterQueryString({ ...initial, fit })}`, { scroll: false });
  }

  const showPreferredHint =
    preferredFitSize != null && sortedFitSizes.includes(preferredFitSize) && initial.fit !== preferredFitSize;

  return (
    <div>
      <QuickFilterChips
        label="Qual numeração você veste?"
        options={sortedFitSizes.map((n) => ({ value: String(n), label: String(n) }))}
        selectedValue={initial.fit != null ? String(initial.fit) : null}
        onSelect={(value) => selectFit(value != null ? Number(value) : null)}
      />
      {showPreferredHint && (
        <button
          type="button"
          onClick={() => selectFit(preferredFitSize)}
          className="-mt-4 mb-6 block text-xs text-text-muted hover:text-text"
        >
          Sua numeração: <span className="font-medium text-primary">{preferredFitSize}</span> · Aplicar
        </button>
      )}
    </div>
  );
}
