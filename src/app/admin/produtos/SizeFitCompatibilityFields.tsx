"use client";

import { cn } from "@/lib/utils";

/**
 * "Como essa peça veste?" — edição de compatibilidade numérica por tamanho
 * da etiqueta. Componente puramente client-side: nada aqui grava no banco,
 * quem chama (ProductForm ou a tela Revisar numerações) decide quando
 * persistir via saveProductSizeFitCompatibilityAction. `value` é sempre a
 * fonte da verdade exibida — nenhuma sugestão conta como selecionada até
 * a administradora tocar nela.
 */

export const FIT_SIZE_OPTIONS = [34, 36, 38, 40, 42, 44, 46, 48] as const;

const UNICO_SHORTCUTS: { label: string; sizes: number[] }[] = [
  { label: "36–38", sizes: [36, 38] },
  { label: "36–40", sizes: [36, 38, 40] },
  { label: "38–40", sizes: [38, 40] },
  { label: "36–42", sizes: [36, 38, 40, 42] },
];

/** Só pra comparação (reconhecer Único/Unico/UNICO) — o texto salvo é sempre o original de product_sizes.size. */
function normalizeForComparison(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

function isUnicoLabel(labelSize: string): boolean {
  return normalizeForComparison(labelSize) === "UNICO";
}

/** Etiqueta numérica (ex: "38") sugere a mesma numeração, se ela existir entre as opções — só sugestão visual. */
function numericSuggestion(labelSize: string): number | null {
  const trimmed = labelSize.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return (FIT_SIZE_OPTIONS as readonly number[]).includes(n) ? n : null;
}

export function SizeFitCompatibilityFields({
  labelSizes,
  value,
  onChange,
}: {
  /** Tamanhos da etiqueta desta variante, na ordem atual (product_sizes.size). */
  labelSizes: string[];
  /** Numerações marcadas por tamanho da etiqueta — chave é o texto exato do labelSize. */
  value: Record<string, number[]>;
  onChange: (next: Record<string, number[]>) => void;
}) {
  if (labelSizes.length === 0) return null;

  function setFitSizes(labelSize: string, fitSizes: number[]) {
    onChange({ ...value, [labelSize]: fitSizes });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text">Como essa peça veste?</span>
        <span className="text-xs text-text-muted">
          Pra cada tamanho da etiqueta, marque as numerações que a peça realmente veste.
        </span>
      </div>

      {labelSizes.map((labelSize) => (
        <LabelSizeFitRow
          key={labelSize}
          labelSize={labelSize}
          fitSizes={value[labelSize] ?? []}
          onChangeFitSizes={(sizes) => setFitSizes(labelSize, sizes)}
        />
      ))}
    </div>
  );
}

function LabelSizeFitRow({
  labelSize,
  fitSizes,
  onChangeFitSizes,
}: {
  labelSize: string;
  fitSizes: number[];
  onChangeFitSizes: (sizes: number[]) => void;
}) {
  const unico = isUnicoLabel(labelSize);
  const suggestion = unico ? null : numericSuggestion(labelSize);

  function toggle(size: number) {
    onChangeFitSizes(
      fitSizes.includes(size) ? fitSizes.filter((s) => s !== size) : [...fitSizes, size].sort((a, b) => a - b)
    );
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
      <span className="text-sm font-semibold text-text">Etiqueta: {labelSize}</span>

      {unico && (
        <div className="flex flex-wrap gap-1.5">
          {UNICO_SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              onClick={() => onChangeFitSizes(shortcut.sizes)}
              className="rounded-full border border-dashed border-primary/50 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
            >
              Veste {shortcut.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FIT_SIZE_OPTIONS.map((size) => {
          const selected = fitSizes.includes(size);
          const isSuggestion = !selected && suggestion === size;
          return (
            <button
              key={size}
              type="button"
              onClick={() => toggle(size)}
              title={isSuggestion ? "Sugestão a partir do tamanho da etiqueta — toque para confirmar" : undefined}
              className={cn(
                "flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : isSuggestion
                    ? "border-dashed border-primary/60 text-primary hover:bg-primary/10"
                    : "border-border bg-surface text-text hover:bg-muted"
              )}
            >
              {size}
            </button>
          );
        })}
      </div>

      {fitSizes.length === 0 && (
        <span className="text-xs text-amber-700">Pendente — nenhuma numeração marcada ainda.</span>
      )}
    </div>
  );
}
