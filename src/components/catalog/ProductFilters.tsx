"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Filter } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { buildFilterQueryString, PRICE_QUICK_RANGES, type ParsedPublicFilters } from "@/lib/catalog/filters";

export interface ProductFiltersProps {
  /** Rota base para onde os filtros são aplicados (ex: "/busca", "/novidades", "/categoria/blusas"). */
  basePath: string;
  /** Filtros já aplicados (vindos do searchParams da própria página, sempre atuais após navegação). */
  initial: ParsedPublicFilters;
  sizeOptions: string[];
  /** Omitido em /categoria/[slug] — a categoria já está fixada pela própria rota. */
  categoryOptions?: { slug: string; name: string }[];
  /** Parâmetros que não são filtros mas precisam sobreviver (ex: "q" da busca). */
  preserveParams?: Record<string, string | undefined>;
}

export function ProductFilters({ basePath, initial, sizeOptions, categoryOptions, preserveParams }: ProductFiltersProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ParsedPublicFilters>(initial);

  const activeCount = [initial.size, initial.minPrice != null || initial.maxPrice != null, initial.category].filter(
    Boolean
  ).length;

  function openDrawer() {
    setPending(initial);
    setOpen(true);
  }

  function apply(next: ParsedPublicFilters) {
    router.push(`${basePath}${buildFilterQueryString(next, preserveParams)}`, { scroll: false });
    setOpen(false);
  }

  function clearOne(key: keyof ParsedPublicFilters) {
    apply({ ...initial, [key]: null });
  }

  function isQuickRangeActive(min: number, max: number | null) {
    return pending.minPrice === min && pending.maxPrice === max;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={openDrawer} className="gap-1.5">
          <Filter className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Filtrar
          {activeCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>

        {initial.category && (
          <ActiveChip label={categoryOptions?.find((c) => c.slug === initial.category)?.name ?? initial.category} onRemove={() => clearOne("category")} />
        )}
        {initial.size && <ActiveChip label={`Tamanho ${initial.size}`} onRemove={() => clearOne("size")} />}
        {(initial.minPrice != null || initial.maxPrice != null) && (
          <ActiveChip
            label={priceRangeLabel(initial.minPrice, initial.maxPrice)}
            onRemove={() => apply({ ...initial, minPrice: null, maxPrice: null })}
          />
        )}
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title="Filtrar">
        <div className="flex flex-col gap-6 pb-2">
          {categoryOptions && categoryOptions.length > 0 && (
            <FilterSection title="Categoria">
              <div className="flex flex-wrap gap-1.5">
                {categoryOptions.map((category) => (
                  <FilterChip
                    key={category.slug}
                    label={category.name}
                    selected={pending.category === category.slug}
                    onClick={() =>
                      setPending((p) => ({ ...p, category: p.category === category.slug ? null : category.slug }))
                    }
                  />
                ))}
              </div>
            </FilterSection>
          )}

          <FilterSection title="Preço">
            <div className="flex flex-wrap gap-1.5">
              {PRICE_QUICK_RANGES.map((range) => (
                <FilterChip
                  key={range.label}
                  label={range.label}
                  selected={isQuickRangeActive(range.min, range.max)}
                  onClick={() =>
                    setPending((p) =>
                      isQuickRangeActive(range.min, range.max)
                        ? { ...p, minPrice: null, maxPrice: null }
                        : { ...p, minPrice: range.min, maxPrice: range.max }
                    )
                  }
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Mín."
                value={pending.minPrice ?? ""}
                onChange={(e) => setPending((p) => ({ ...p, minPrice: e.target.value === "" ? null : Number(e.target.value) }))}
                className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
              <span className="shrink-0 text-text-muted">até</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Máx."
                value={pending.maxPrice ?? ""}
                onChange={(e) => setPending((p) => ({ ...p, maxPrice: e.target.value === "" ? null : Number(e.target.value) }))}
                className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
          </FilterSection>

          {sizeOptions.length > 0 && (
            <FilterSection title="Tamanho">
              <div className="flex flex-wrap gap-1.5">
                {sizeOptions.map((size) => (
                  <FilterChip
                    key={size}
                    label={size}
                    selected={pending.size === size}
                    onClick={() => setPending((p) => ({ ...p, size: p.size === size ? null : size }))}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => apply({ size: null, minPrice: null, maxPrice: null, category: null })}>
              Limpar filtros
            </Button>
            <Button type="button" className="flex-1" onClick={() => apply(pending)}>
              Aplicar filtros
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

function priceRangeLabel(min: number | null, max: number | null): string {
  if (min != null && max != null) return `R$ ${min}–${max}`;
  if (min != null) return `A partir de R$ ${min}`;
  if (max != null) return `Até R$ ${max}`;
  return "Preço";
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-text">{title}</h3>
      {children}
    </div>
  );
}

function FilterChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 items-center justify-center rounded-full border px-3.5 text-sm font-medium transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-text hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="flex h-8 items-center gap-1.5 rounded-full border border-primary bg-primary/10 pl-3 pr-2 text-xs font-medium text-primary"
    >
      {label}
      <span aria-hidden="true" className="text-sm leading-none">
        ×
      </span>
      <span className="sr-only">Remover filtro {label}</span>
    </button>
  );
}
