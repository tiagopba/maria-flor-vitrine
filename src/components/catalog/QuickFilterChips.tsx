"use client";

import { cn } from "@/lib/utils";

/**
 * Renderização compartilhada da linha de chips "sempre visível, logo antes
 * da grade" — usada por SizeQuickFilter (tamanho da etiqueta, ?size=) e
 * FitQuickFilter (numeração que veste, ?fit=). Só a apresentação é
 * compartilhada; cada um decide sua própria label, ordenação e parâmetro de
 * URL — generalizado com segurança em vez de duplicar o chip inteiro.
 *
 * Tamanho do chip aumentado (item 8 da Etapa 2): texto ~16px/semibold,
 * altura ~44px (área de toque confortável), mesma identidade rosa Maria
 * Flor quando selecionado.
 */
export function QuickFilterChips({
  label,
  options,
  selectedValue,
  onSelect,
  allLabel = "Todos",
}: {
  label: string;
  options: { value: string; label: string }[];
  /** null = "Todos" selecionado. */
  selectedValue: string | null;
  onSelect: (value: string | null) => void;
  allLabel?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="mb-2 font-display text-sm text-text">{label}</p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <QuickFilterChip label={allLabel} selected={selectedValue === null} onClick={() => onSelect(null)} />
        {options.map((option) => (
          <QuickFilterChip
            key={option.value}
            label={option.label}
            selected={selectedValue === option.value}
            onClick={() => onSelect(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

function QuickFilterChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full border px-4 text-base font-semibold transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-text hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}
