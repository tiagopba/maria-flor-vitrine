import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "warning";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-text-muted",
  primary: "bg-primary/10 text-primary",
  warning: "bg-amber-100 text-amber-800",
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
