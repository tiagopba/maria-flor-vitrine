"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Chips vêm do catálogo central `size_options` (ver lib/db/sizes.ts) — quem
 * chama já resolveu a união certa (ativos + os já usados nesta variante,
 * mesmo que inativos — item 11 aprovado). O campo livre "Outro" continua
 * existindo: product_sizes aceita qualquer texto, nunca um enum fechado.
 */
export function SizeSelector({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (sizes: string[]) => void;
  options: { label: string }[];
}) {
  const [customValue, setCustomValue] = useState("");

  function toggle(size: string) {
    onChange(value.includes(size) ? value.filter((s) => s !== size) : [...value, size]);
  }

  function addCustom() {
    const size = customValue.trim();
    if (size && !value.includes(size)) {
      onChange([...value, size]);
    }
    setCustomValue("");
  }

  const optionLabels = new Set(options.map((o) => o.label));
  const extraSizes = value.filter((s) => !optionLabels.has(s));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <SizeChip
            key={option.label}
            label={option.label}
            selected={value.includes(option.label)}
            onClick={() => toggle(option.label)}
          />
        ))}
      </div>

      {extraSizes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {extraSizes.map((size) => (
            <SizeChip key={size} label={size} selected onClick={() => toggle(size)} />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder='Outro (ex: "Único")'
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
        <button
          type="button"
          onClick={addCustom}
          className="rounded-lg border border-border px-3 text-sm font-medium text-text hover:bg-muted"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}

function SizeChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-text hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}
