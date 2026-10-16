import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "warning" | "success" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-text-muted",
  primary: "bg-primary/10 text-primary",
  warning: "bg-amber-100 text-amber-800",
  /** Selo de desconto à vista (ver DualPriceBlock, variant "detail") —
   * verde suave, único uso hoje; tom novo e aditivo, os outros três
   * continuam exatamente iguais. */
  success: "bg-emerald-50 text-emerald-700",
  /** Dois tons novos (redesign do Pré-faturamento) — mesma receita dos
   * acima (cor Tailwind padrão, não os tokens --admin-*, porque este
   * componente também é usado fora do Admin, ex. ProductCard/Price). */
  danger: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
