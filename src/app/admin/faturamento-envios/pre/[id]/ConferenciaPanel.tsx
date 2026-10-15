"use client";

import { AlertCircle, FileText, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { fieldLabel } from "@/lib/intake/labels";
import { approveConferenciaAction, markReviewedAction, startConferenciaAction } from "./conferencia-actions";

const MAX_XML_BYTES = 2 * 1024 * 1024;

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

// Só campos do XML (identificação fiscal + valor + transportadora, se houver). Nada
// derivado de etiqueta: serviço e rastreio não existem mais nesta etapa — ver
// RASTREAMENTO PENDENTE depois da aprovação.
const EXTRACTED_LABELS: [string, string][] = [
  ["nfe_number", "NF-e"],
  ["nfe_series", "Série"],
  ["nfe_key", "Chave de acesso"],
  ["invoice_total", "Valor da NF-e"],
  ["carrier", "Transportadora"],
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const latest = attempts[0] ?? null;
  const isBlocked = latest?.verdict === "BLOCKED";
  const reviewPending = latest ? latest.reviewFields.filter((f) => !latest.reviewedFields.includes(f)) : [];
  const canConfirm = latest !== null && (latest.verdict === "GREEN" || (latest.verdict === "REVIEW" && reviewPending.length === 0));

  const pickFile = (file: File | null) => {
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xml")) {
      setSelectedFile(null);
      setFileError("Selecione um arquivo .xml (o XML da NF-e, não a DANFE nem a etiqueta).");
      return;
    }
    if (file.size > MAX_XML_BYTES) {
      setSelectedFile(null);
      setFileError("O XML é maior que 2MB.");
      return;
    }
    setSelectedFile(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const upload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await startConferenciaAction(intakeId, data);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setChecked([]);
      formRef.current?.reset();
      clearFile();
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
            Encontramos informações importantes que não correspondem. Revise os dados da cliente e o XML antes de continuar.
          </p>
          <p className="mt-3 text-xs">Não há como liberar esta tentativa. Recomece com o XML correto ou corrija os dados da cliente (abaixo).</p>
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

          {latest.results.filter((r) => r.verdict === "BLOCKED" || r.verdict === "REVIEW").length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {latest.results
                .filter((r) => r.verdict === "BLOCKED" || r.verdict === "REVIEW")
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

          {!isBlocked && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
              <Button type="button" onClick={approve} disabled={pending || !canConfirm}>
                CONFIRMAR CONFERÊNCIA
              </Button>
              {!canConfirm && <p className="self-center text-xs text-text-muted">Libera quando não houver avisos pendentes.</p>}
            </div>
          )}
        </div>
      )}

      {canUpload && (
        <form ref={formRef} onSubmit={upload} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text">{latest ? "REVISAR E RECOMEÇAR CONFERÊNCIA" : "INICIAR CONFERÊNCIA"}</p>
          <p className="text-xs text-text-muted">
            Envie o XML autorizado da NF-e. A conferência é recalculada do zero e a tentativa anterior fica no histórico.
          </p>

          <label
            htmlFor="xml-dropzone-input"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/40 px-5 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/70"
          >
            <Upload className="h-8 w-8 text-text-muted" aria-hidden="true" />
            <span className="text-base font-medium text-text">Clique para selecionar o XML da NF-e</span>
            <span className="text-xs text-text-muted">Arquivo .xml, até 2 MB</span>
            <input
              ref={fileInputRef}
              id="xml-dropzone-input"
              name="xml"
              type="file"
              accept=".xml,application/xml,text/xml"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {selectedFile && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted px-3.5 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-text">
                <FileText className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                <span className="truncate">{selectedFile.name}</span>
              </span>
              <button
                type="button"
                onClick={clearFile}
                className="shrink-0 rounded-full p-1 text-text-muted hover:bg-border/60 hover:text-text"
                aria-label="Remover arquivo selecionado"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {fileError && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {fileError}
            </p>
          )}

          <Button type="submit" variant="secondary" disabled={pending || !selectedFile}>
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
