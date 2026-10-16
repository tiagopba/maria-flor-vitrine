"use client";

import { CheckCircle2, FileText, Truck, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
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
  results: { field: string; verdict: string; reason: string; overrideCode?: string }[];
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

const MAX_XML_MB = 2;

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const latest = attempts[0] ?? null;
  const isBlocked = latest?.verdict === "BLOCKED";
  const reviewPending = latest ? latest.reviewFields.filter((f) => !latest.reviewedFields.includes(f)) : [];
  const canConfirm = latest !== null && (latest.verdict === "GREEN" || (latest.verdict === "REVIEW" && reviewPending.length === 0));
  // Resultados informativos de um override aplicado (ex.: frete legado) — nunca
  // bloqueiam nem pedem revisão (ver compareMoneyCents/conferir-xml.ts), só são
  // mostrados pra nunca esconder que uma diferença foi encontrada e aceita.
  const overrideNotices = latest ? latest.results.filter((r) => r.overrideCode) : [];

  function pickFile() {
    setFileError(null);
    fileInputRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xml")) {
      setSelectedFile(null);
      e.target.value = "";
      setFileError("Selecione um arquivo .xml (o XML da NF-e, não a DANFE nem a etiqueta).");
      return;
    }
    if (file.size > MAX_XML_MB * 1024 * 1024) {
      setSelectedFile(null);
      e.target.value = "";
      setFileError(`O XML é maior que ${MAX_XML_MB}MB.`);
      return;
    }
    setSelectedFile(file);
  }

  function clearFile() {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const upload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await startConferenciaAction(intakeId, data);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      clearFile();
      formRef.current?.reset();
      setChecked([]);
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
        <div className="rounded-2xl border border-admin-border bg-white p-5">
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

          {overrideNotices.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {overrideNotices.map((r) => (
                <div key={r.field} className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <Truck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" strokeWidth={1.75} />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Frete legado</p>
                    <p className="text-xs text-blue-800">{r.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

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
            <div className="mt-5 flex flex-col gap-3 border-t border-admin-border pt-4">
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

          {/* Em BLOCKED não há como confirmar (ver canConfirm) — o botão nem
              aparece, pra não sugerir visualmente uma ação que nunca é
              permitida (cliente, Server Action e RPC recusam as 3). */}
          {!isBlocked && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-admin-border pt-4">
              <Button type="button" onClick={approve} disabled={pending || !canConfirm}>
                CONFIRMAR CONFERÊNCIA
              </Button>
              {!canConfirm && (
                <p className="self-center text-xs text-text-muted">Libera quando não houver avisos pendentes.</p>
              )}
            </div>
          )}
        </div>
      )}

      {canUpload && (
        <form ref={formRef} onSubmit={upload} className="flex flex-col gap-4 rounded-2xl border border-admin-border bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-admin-primary-soft">
              <FileText className="h-[18px] w-[18px] text-admin-primary" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-text">XML DA NF-e</p>
              <p className="text-xs text-text-muted">Envie o XML autorizado para iniciar a conferência automática.</p>
            </div>
          </div>

          <input ref={fileInputRef} name="xml" type="file" accept=".xml,application/xml,text/xml" className="sr-only" onChange={onFileChosen} />

          {selectedFile ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-admin-border bg-admin-surface-muted p-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{selectedFile.name}</p>
                  <p className="flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} /> Pronto para conferência
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearFile}
                aria-label="Remover arquivo"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-admin-border/40 hover:text-text"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={pickFile}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-admin-border bg-admin-surface-muted py-8 text-center transition-colors hover:border-admin-primary/40"
            >
              <UploadCloud className="h-6 w-6 text-text-muted" strokeWidth={1.75} />
              <span className="text-sm font-medium text-text">Clique para selecionar o XML</span>
              <span className="text-xs text-text-muted">Arquivo .xml · máximo {MAX_XML_MB} MB</span>
            </button>
          )}

          {fileError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              {fileError}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !selectedFile}
            className={buttonClasses({ variant: selectedFile ? "primary" : "secondary", className: "disabled:cursor-not-allowed" })}
          >
            {pending ? "Conferindo..." : latest ? "REFAZER CONFERÊNCIA" : "INICIAR CONFERÊNCIA"}
          </button>
        </form>
      )}

      {attempts.length > 1 && (
        <section className="rounded-2xl border border-admin-border bg-white p-5">
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
