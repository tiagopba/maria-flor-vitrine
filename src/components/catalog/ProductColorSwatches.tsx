import Link from "next/link";
import type { Color } from "@/lib/db/colors";
import type { ProductGroupSibling } from "@/lib/db/products";

/**
 * "Outras cores disponíveis" na página do produto — cada cor é um
 * produto de verdade, com sua própria URL/fotos/tamanhos/preço (nunca
 * troca imagem dentro da mesma ficha). Ao tocar, navega pra página real
 * daquela cor. Sem carregar fotos das outras cores aqui de propósito
 * (item 13 da especificação) — só nome e swatch.
 */
export function ProductColorSwatches({
  currentColorId,
  currentColorName,
  siblings,
  colors,
}: {
  currentColorId: string | null;
  currentColorName: string | null;
  siblings: ProductGroupSibling[];
  colors: Color[];
}) {
  if (siblings.length === 0) return null;

  const colorById = new Map(colors.map((c) => [c.id, c]));
  const currentHex = currentColorId ? colorById.get(currentColorId)?.hex_color : null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text">Outras cores disponíveis</span>
      <div className="flex flex-wrap gap-2">
        {currentColorName && (
          <span className="flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3.5 py-1.5 text-sm text-primary">
            {currentHex && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-primary/30"
                style={{ backgroundColor: currentHex }}
              />
            )}
            {currentColorName}
          </span>
        )}
        {siblings.map((sibling) => {
          const color = sibling.colorId ? colorById.get(sibling.colorId) : null;
          return (
            <Link
              key={sibling.id}
              href={`/produto/${sibling.slug}`}
              className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm text-text transition-colors hover:border-primary/40"
            >
              {color?.hex_color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-border/60"
                  style={{ backgroundColor: color.hex_color }}
                />
              )}
              {color?.name ?? "Ver cor"}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
