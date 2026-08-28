function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Price({
  price,
  promotionalPrice,
}: {
  price: number;
  promotionalPrice?: number | null;
}) {
  const hasPromo = promotionalPrice != null && promotionalPrice < price;

  if (!hasPromo) {
    return <span className="font-medium text-text">{formatBRL(price)}</span>;
  }

  return (
    <span className="flex items-baseline gap-2">
      <span className="text-sm text-text-muted line-through">{formatBRL(price)}</span>
      <span className="font-medium text-primary">{formatBRL(promotionalPrice)}</span>
    </span>
  );
}
