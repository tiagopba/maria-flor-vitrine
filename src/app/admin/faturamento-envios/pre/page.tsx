import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/permissions";
import { listIntakes } from "@/lib/db/intakes";
import { formatStoreDateTime, formatBRL, formatIsoDate } from "@/lib/fulfillment/format";
import { INTAKE_STATUS_LABELS, type IntakeStatus } from "@/lib/intake/status";

export const metadata: Metadata = { title: "Pré-faturamento — Faturamento e Envios" };

const GROUPS: { title: string; statuses: IntakeStatus[] }[] = [
  { title: "Aguardando dados", statuses: ["AWAITING_CUSTOMER_DATA"] },
  { title: "Dados recebidos", statuses: ["DATA_RECEIVED", "DOCUMENTS_PENDING"] },
  { title: "Conferência bloqueada", statuses: ["BLOCKED"] },
  { title: "Revisar", statuses: ["CHECKING", "REVIEW_REQUIRED"] },
  { title: "Prontos / conferidos", statuses: ["APPROVED"] },
];

export default async function PreFaturamentoPage() {
  await requireAdmin(["admin", "master"]);
  const rows = await listIntakes();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-text">Pré-faturamento</h1>
          <p className="text-sm text-text-muted">Coleta de dados da cliente e conferência antes do envio.</p>
        </div>
        <Link
          href="/admin/faturamento-envios/pre/nova"
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          SOLICITAR DADOS DO CLIENTE
        </Link>
      </div>

      {GROUPS.map((group) => {
        const items = rows.filter((r) => group.statuses.includes(r.status as IntakeStatus));
        return (
          <section key={group.title} className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
              {group.title} <span className="font-normal">({items.length})</span>
            </h2>
            {items.length === 0 ? (
              <p className="text-sm text-text-muted">Nada aqui.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <Link href={`/admin/faturamento-envios/pre/${row.id}`} className="font-medium text-text hover:underline">
                      {row.customer_name}
                    </Link>
                    <span className="text-text-muted">
                      venda {formatIsoDate(row.sale_date)} · {formatBRL(Number(row.sale_total))} · {INTAKE_STATUS_LABELS[row.status as IntakeStatus]}
                      {row.submitted_at ? ` · recebido em ${formatStoreDateTime(row.submitted_at)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
