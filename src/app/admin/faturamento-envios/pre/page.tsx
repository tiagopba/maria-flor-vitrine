import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/permissions";
import { listIntakes } from "@/lib/db/intakes";
import { groupIntakeRows } from "@/lib/intake/groups";
import { FulfillmentTabs } from "../FulfillmentTabs";
import { getIntakeSectionPresentation } from "./intake-section-presentation";
import { IntakeMiniCard } from "./IntakeMiniCard";
import { IntakeSectionCard } from "./IntakeSectionCard";

export const metadata: Metadata = { title: "Pré-faturamento — Faturamento e Envios" };

export default async function PreFaturamentoPage() {
  await requireAdmin(["admin", "master"]);
  const rows = await listIntakes();
  const sections = groupIntakeRows(rows);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-text">Faturamento e Envios</h1>
          <p className="text-sm text-text-muted">Coleta de dados da cliente e conferência antes do envio.</p>
        </div>
        <Link
          href="/admin/faturamento-envios/pre/nova"
          data-variant="primary"
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + NOVA VENDA
        </Link>
      </div>

      <FulfillmentTabs active="pre" />

      {sections.map(({ group, items }) => {
        const presentation = getIntakeSectionPresentation(group.key);
        return (
          <IntakeSectionCard key={group.key} title={group.title} count={items.length} presentation={presentation}>
            {items.map((row) => (
              <IntakeMiniCard key={row.id} row={row} presentation={presentation} />
            ))}
          </IntakeSectionCard>
        );
      })}
    </div>
  );
}
