"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { fieldLabel } from "@/lib/intake/labels";
import { approveConferenciaAction, markReviewedAction, startConferenciaAction } from "./conferencia-actions";

export interface AttemptView {
  id: string;
  attemptNo: number;
  verdict: "GREEN" | "REVIEW" | "BLOCKED";
  blockingFields: string[];
  reviewFields: string[];
  reviewedFields: string[];
  createdAt: string;
  results: { field: string; verdict: string; reason: string }[];
  extracted: Record<string, string | number | null>;
}

const BADGE: Record<AttemptView["verdict"], { dot: string; title: string }> = {
  GREEN: { dot: "🟢", title: "TUDO CERTO" },
  REVIEW: { dot: "🟡", title: "REVISAR" },
  BLOCKED: { dot: "🔴", title: "DIVERGÊNCIA — BLOQUEIO REAL" },
};

const EXTRACTED_LABELS: [string, string][] = [
  ["nfe_number", "NF-e"],
  ["nfe_series", "Série"],
  ["nfe_key", "Chave de acesso"],
  ["invoice_total", "Valor da NF-e"],
  ["carrier", "Transportadora"],
  ["shipping_service", "Serviço"],
  ["tracking_code", "Rastreio"],
];

export function ConferenciaPanel({
  intakeId,
  attempts,
  canUpload,
}: {
  intakeId: string;
  attempts: AttemptView[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const latest = attempts[0] ?? null;
  const isBlocked = latest?.verdict === "BLOCKED";
  const reviewPending = latest ? latest.reviewFields.filter((f) => !latest.reviewedFields.includes(f)) : [];
  const canConfirm = latest !== null && (latest.verdict === "GREEN" || (latest.verdict === "REVIEW" && reviewPending.length === 0));

  const upload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await startConferenciaAction(intakeId, data);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setChecked([]);
      formRef.current?.reset();
      setMessage({ kind: "info", text: "Conferência feita. A tentativa anterior continua no histórico." });
      router.refresh();
    });
  };

  const review = () => {
    if (!latest) return;
    startTransition(async () => {
      const result = await markReviewedAction(intakeId, latest.attemptNo, checked);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setMessage({ kind: "info", text: "Avisos marcados como revisados." });
      router.refresh();
    });
  };

  const approve = () => {
    if (!latest) return;
    startTransition(async () => {
      const result = await approveConferenciaAction(intakeId, latest.attemptNo);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      router.push(`/admin/faturamento-envios/${result.recordId}`);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {isBlocked && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
          <p className="font-semibold">🔴 CONFERÊNCIA BLOQUEADA</p>
          <p className="mt-2 text-sm">
            Encontramos informações importantes que não correspondem. Revise os dados, a NF-e e a etiqueta antes de continuar.
          </p>
          <p className="mt-3 text-xs">Não há como liberar esta tentativa. Recomece com os documentos corretos ou corrija os dados da cliente (abaixo).</p>
        </div>
      )}

      {latest && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-text">
            {BADGE[latest.verdict].dot} {BADGE[latest.verdict].title} <span className="font-normal text-text-muted">· tentativa {latest.attemptNo}</span>
          </p>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {EXTRACTED_LABELS.map(([key, label]) => (
              <div key={key} className="flex flex-col gap-0.5">
                <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
                <dd className="break-all text-sm text-text">{latest.extracted[key] ?? "não encontrado"}</dd>
              </div>
            ))}
          </dl>

          {latest.results.filter((r) => r.verdict !== "OK").length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {latest.results
                .filter((r) => r.verdict !== "OK")
                .map((r) => (
                  <li key={r.field} className={r.verdict === "BLOCKED" ? "text-red-800" : "text-amber-800"}>
                    {r.verdict === "BLOCKED" ? "🔴" : "🟡"} {fieldLabel(r.field)}: {r.reason}
                  </li>
                ))}
            </ul>
          )}

          {latest.verdict === "REVIEW" && (
            <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
              <p className="text-sm font-medium text-text">Marque cada aviso como revisado antes de confirmar:</p>
              {latest.reviewFields.map((f) => {
                const already = latest.reviewedFields.includes(f);
                return (
                  <label key={f} className="flex items-center gap-3 text-sm text-text">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      disabled={already || pending}
                      checked={already || checked.includes(f)}
                      onChange={(e) => setChecked((c) => (e.target.checked ? [...c, f] : c.filter((x) => x !== f)))}
                    />
                    {fieldLabel(f)} {already && <span className="text-text-muted">(revisado)</span>}
                  </label>
                );
              })}
              {reviewPending.length > 0 && (
                <Button type="button" variant="secondary" onClick={review} disabled={pending || checked.length === 0}>
                  MARCAR COMO REVISADO
                </Button>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button type="button" onClick={approve} disabled={pending || !canConfirm}>
              CONFIRMAR CONFERÊNCIA
            </Button>
            {!canConfirm && latest.verdict !== "BLOCKED" && (
              <p className="self-center text-xs text-text-muted">Libera quando não houver avisos pendentes.</p>
            )}
          </div>
        </div>
      )}

      {canUpload && (
        <form ref={formRef} onSubmit={upload} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text">{latest ? "REVISAR E RECOMEÇAR CONFERÊNCIA / SUBSTITUIR DANFE E ETIQUETA" : "INICIAR CONFERÊNCIA"}</p>
          <p className="text-xs text-text-muted">
            Envie a DANFE Simplificada e a etiqueta em PDF (até 2MB cada). A conferência é recalculada do zero e a tentativa anterior fica no histórico.
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            DANFE (PDF)
            <input name="danfe" type="file" accept="application/pdf" className="text-sm" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Etiqueta (PDF)
            <input name="label" type="file" accept="application/pdf" className="text-sm" />
          </label>
          <Button type="submit" variant="secondary" disabled={pending}>
            {latest ? "REVISAR E RECOMEÇAR CONFERÊNCIA" : "INICIAR CONFERÊNCIA"}
          </Button>
        </form>
      )}

      {attempts.length > 1 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Histórico de tentativas</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {attempts.slice(1).map((a) => (
              <li key={a.id} className="text-text-muted">
                Tentativa {a.attemptNo} · {BADGE[a.verdict].dot} {BADGE[a.verdict].title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-red-700" : "text-sm text-text-muted"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
