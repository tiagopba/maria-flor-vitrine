import { Badge } from "@/components/ui/Badge";
import type { IntakeSectionPresentation } from "./intake-section-presentation";

/**
 * Card de uma seção do Pré-faturamento (cabeçalho com ícone/cor da etapa +
 * lista de mini-cards, ou empty state). Só apresentação — recebe o grupo
 * já calculado por groupIntakeRows (lib/intake/groups.ts, intocado).
 */
export function IntakeSectionCard({
  title,
  count,
  presentation,
  children,
}: {
  title: string;
  count: number;
  presentation: IntakeSectionPresentation;
  children: React.ReactNode;
}) {
  const Icon = presentation.icon;

  return (
    <section className="rounded-2xl border border-admin-border bg-white p-5 shadow-[0_1px_2px_rgba(20,10,20,0.04),0_8px_24px_-16px_rgba(20,10,20,0.12)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `var(${presentation.softBgVar})` }}
          >
            <Icon className="h-[18px] w-[18px]" style={{ color: `var(${presentation.iconColorVar})` }} strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="font-semibold text-text">{title}</h2>
            <p className="text-xs text-text-muted">{presentation.description}</p>
          </div>
        </div>
        <Badge tone={presentation.badgeTone} className="shrink-0">
          {count}
        </Badge>
      </div>

      {count === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-xl py-8 text-center"
          style={{ backgroundColor: `var(${presentation.softBgVar})` }}
        >
          <Icon className="h-5 w-5 opacity-40" style={{ color: `var(${presentation.iconColorVar})` }} strokeWidth={1.75} />
          <p className="text-sm text-text-muted">Nenhuma venda nesta etapa no momento.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">{children}</div>
      )}
    </section>
  );
}
