"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { maskCpfCnpj, formatCpfCnpj } from "@/lib/fulfillment/text";
import { DELIVERY_STATUSES, DELIVERY_STATUS_LABELS, UNKNOWN_SELLER_LABEL } from "@/lib/fulfillment/delivery";
import type { DocumentReadStatus } from "@/lib/fulfillment/types";
import type { ReadDocumentsResult, SaveRecordResult } from "./actions";

const MAX_PDF_BYTES = 2 * 1024 * 1024;
const SELECT_CLASS =
  "h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary";
const UNREADABLE_MESSAGE =
  "Não conseguimos ler este PDF automaticamente. Preencha os dados manualmente ou envie outro arquivo.";

type ReadOk = Extract<ReadDocumentsResult, { ok: true }>;

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function validatePdf(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Selecione um arquivo PDF.";
  if (file.size > MAX_PDF_BYTES) return "O PDF deve ter no máximo 2MB.";
  return null;
}

function PdfPicker({
  id,
  title,
  file,
  error,
  onChange,
}: {
  id: string;
  title: string;
  file: File | null;
  error: string | null;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={onChange}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          Selecionar PDF
        </Button>
        {file && !error ? (
          <span className="min-w-0 truncate text-sm text-text-muted">
            {file.name} · {formatBytes(file.size)}
          </span>
        ) : (
          <span className="text-sm text-text-muted">Nenhum arquivo selecionado</span>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function ReadStatusNotice({ title, status }: { title: string; status: DocumentReadStatus }) {
  if (status === "ok") {
    return <p className="text-sm text-emerald-700">✅ {title}: lido automaticamente.</p>;
  }
  return (
    <p className="text-sm text-amber-800">
      ⚠️ {title}: {UNREADABLE_MESSAGE}
    </p>
  );
}

function ComparisonBlock({ result }: { result: ReadOk }) {
  const { comparison } = result;
  const mismatches = comparison.fields.filter((f) => f.status === "mismatch");

  return (
    <div
      className={
        comparison.overall === "match"
          ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
          : comparison.overall === "mismatch"
            ? "rounded-2xl border border-amber-300 bg-amber-50 p-4"
            : "rounded-2xl border border-border bg-muted p-4"
      }
    >
      <p className="text-sm font-semibold text-text">
        {comparison.overall === "match" && "✅ Documentos parecem pertencer ao mesmo envio"}
        {comparison.overall === "mismatch" && "⚠️ Confira os documentos antes de salvar"}
        {comparison.overall === "incomplete" &&
          "Não foi possível comparar os documentos (só um foi lido ou não há dados em comum)."}
      </p>

      {mismatches.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-900">
          {mismatches.map((field) => (
            <li key={field.key}>
              <strong>{field.label}:</strong> DANFE «{field.danfe}» · Etiqueta «{field.shippingLabel}»
            </li>
          ))}
        </ul>
      )}

      {comparison.overall !== "incomplete" && (
        <details className="mt-3 text-xs text-text-muted">
          <summary className="cursor-pointer select-none">Ver comparação campo a campo</summary>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr className="text-text-muted">
                <th className="py-1 pr-2 font-medium">Campo</th>
                <th className="py-1 pr-2 font-medium">DANFE</th>
                <th className="py-1 pr-2 font-medium">Etiqueta</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {comparison.fields.map((field) => (
                <tr key={field.key} className="border-t border-border/60">
                  <td className="py-1 pr-2">{field.label}</td>
                  <td className="py-1 pr-2">{field.danfe ?? "—"}</td>
                  <td className="py-1 pr-2">{field.shippingLabel ?? "—"}</td>
                  <td className="py-1">
                    {field.status === "match" ? "✅" : field.status === "mismatch" ? "⚠️" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

export function NewRecordFlow({
  readDocuments: readDocumentsAction,
  saveRecord: saveFulfillmentRecordAction,
  sellers,
}: {
  /** Vendedoras já cadastradas (public.sellers) — nunca se cria vendedora por aqui. Vendedora e origem são independentes. */
  sellers: { id: string; name: string; active: boolean }[];
  readDocuments: (formData: FormData) => Promise<ReadDocumentsResult>;
  saveRecord: (formData: FormData) => Promise<SaveRecordResult>;
}) {
  const [danfe, setDanfe] = useState<File | null>(null);
  const [label, setLabel] = useState<File | null>(null);
  const [danfeError, setDanfeError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadOk | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [revealDocument, setRevealDocument] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState("PENDING");
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  function pick(setFile: (f: File | null) => void, setError: (e: string | null) => void) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      const error = file ? validatePdf(file) : null;
      setFile(error ? null : file);
      setError(error);
      setReadError(null);
    };
  }

  function handleRead() {
    if (!danfe || !label) return;
    const formData = new FormData();
    formData.set("danfe", danfe);
    formData.set("label", label);
    setReadError(null);

    startReading(async () => {
      const response = await readDocumentsAction(formData);
      if (!response.ok) {
        setReadError(response.error);
        return;
      }
      setSaveError(null);
      setFieldErrors({});
      setRevealDocument(false);
      setDeliveryStatus(response.values.deliveryStatus);
      setResult(response);
    });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!danfe || !label) return;

    const formData = new FormData(event.currentTarget);
    formData.set("danfe", danfe);
    formData.set("label", label);
    setSaveError(null);
    setFieldErrors({});

    startSaving(async () => {
      const response = await saveFulfillmentRecordAction(formData);
      // Em caso de sucesso a action redireciona para o detalhe e nunca retorna.
      if (response && !response.ok) {
        setSaveError(response.error ?? "Não foi possível salvar.");
        setFieldErrors(response.fieldErrors ?? {});
      }
    });
  }

  if (!result) {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <PdfPicker
          id="danfe-file"
          title="DANFE Simplificado"
          file={danfe}
          error={danfeError}
          onChange={pick(setDanfe, setDanfeError)}
        />
        <PdfPicker
          id="label-file"
          title="Etiqueta de Envio"
          file={label}
          error={labelError}
          onChange={pick(setLabel, setLabelError)}
        />

        {readError && <p className="text-sm text-red-600">{readError}</p>}

        <div>
          <Button type="button" onClick={handleRead} disabled={!danfe || !label || reading}>
            {reading ? "Lendo documentos..." : "LER DOCUMENTOS"}
          </Button>
        </div>
      </div>
    );
  }

  const { values } = result;
  const errorFor = (name: string) => fieldErrors[name] || undefined;

  return (
    <form onSubmit={save} autoComplete="off" className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <ReadStatusNotice title="DANFE Simplificado" status={result.danfeStatus} />
        <ReadStatusNotice title="Etiqueta de Envio" status={result.labelStatus} />
      </div>

      <ComparisonBlock result={result} />

      {result.duplicates.length > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ Já existe registro com esta NF-e:{" "}
          {result.duplicates.map((dup, index) => (
            <span key={dup.id}>
              {index > 0 && ", "}
              <Link href={`/admin/faturamento-envios/${dup.id}`} target="_blank" className="underline">
                ver registro de {new Date(dup.created_at).toLocaleDateString("pt-BR")}
              </Link>
            </span>
          ))}
          . Salve só se for realmente outro envio.
        </p>
      )}

      {result.labelAddressHint && (
        <p className="rounded-xl bg-muted p-3 text-sm text-text-muted">
          Na etiqueta, bairro e complemento aparecem juntos: «{result.labelAddressHint}». Separe nos campos abaixo.
        </p>
      )}

      <Section title="Cliente">
        <div className="sm:col-span-2">
          <Input
            id="customerName"
            name="customerName"
            label="Nome"
            defaultValue={values.customerName}
            error={errorFor("customerName")}
            autoComplete="off"
            required
          />
        </div>

        <div className="sm:col-span-2">
          {revealDocument ? (
            <Input
              id="customerDocument"
              name="customerDocument"
              label="CPF (ou CNPJ)"
              defaultValue={formatCpfCnpj(values.customerDocument)}
              error={errorFor("customerDocument")}
              inputMode="numeric"
              autoComplete="off"
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">CPF (ou CNPJ)</span>
              <input type="hidden" name="customerDocument" value={values.customerDocument} />
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-text">
                  {values.customerDocument ? maskCpfCnpj(values.customerDocument) : "não encontrado"}
                </span>
                <Button type="button" variant="secondary" size="sm" onClick={() => setRevealDocument(true)}>
                  Mostrar / corrigir
                </Button>
              </div>
              {errorFor("customerDocument") && <p className="text-xs text-red-600">{errorFor("customerDocument")}</p>}
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <Input
            id="customerWhatsapp"
            name="customerWhatsapp"
            label="WhatsApp do cliente (opcional)"
            defaultValue={values.customerWhatsapp}
            error={errorFor("customerWhatsapp")}
            inputMode="tel"
            autoComplete="off"
            placeholder="(67) 99999-9999"
          />
          <p className="mt-1 text-xs text-text-muted">Fica só no registro privado. Sem ele, não é possível abrir a conversa pelo WhatsApp.</p>
        </div>

        <Input
          id="addressLine"
          name="addressLine"
          label="Endereço"
          defaultValue={values.addressLine}
          error={errorFor("addressLine")}
          autoComplete="off"
        />
        <Input
          id="addressNumber"
          name="addressNumber"
          label="Número"
          defaultValue={values.addressNumber}
          error={errorFor("addressNumber")}
          autoComplete="off"
        />
        <Input
          id="addressComplement"
          name="addressComplement"
          label="Complemento"
          defaultValue={values.addressComplement}
          error={errorFor("addressComplement")}
          autoComplete="off"
        />
        <Input
          id="neighborhood"
          name="neighborhood"
          label="Bairro"
          defaultValue={values.neighborhood}
          error={errorFor("neighborhood")}
          autoComplete="off"
        />
        <Input
          id="postalCode"
          name="postalCode"
          label="CEP"
          defaultValue={values.postalCode}
          error={errorFor("postalCode")}
          inputMode="numeric"
          autoComplete="off"
        />
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <Input
            id="city"
            name="city"
            label="Cidade"
            defaultValue={values.city}
            error={errorFor("city")}
            autoComplete="off"
          />
          <Input
            id="state"
            name="state"
            label="UF"
            defaultValue={values.state}
            error={errorFor("state")}
            maxLength={2}
            autoComplete="off"
          />
        </div>
      </Section>

      <Section title="NF-e">
        <Input
          id="nfeNumber"
          name="nfeNumber"
          label="Número"
          defaultValue={values.nfeNumber}
          error={errorFor("nfeNumber")}
          inputMode="numeric"
          autoComplete="off"
        />
        <Input
          id="nfeSeries"
          name="nfeSeries"
          label="Série"
          defaultValue={values.nfeSeries}
          error={errorFor("nfeSeries")}
          inputMode="numeric"
          autoComplete="off"
        />
        <Input
          id="nfeIssuedAt"
          name="nfeIssuedAt"
          type="date"
          label="Emissão"
          defaultValue={values.nfeIssuedAt}
          error={errorFor("nfeIssuedAt")}
        />
        <Input
          id="invoiceTotal"
          name="invoiceTotal"
          label="Valor (R$)"
          defaultValue={values.invoiceTotal}
          error={errorFor("invoiceTotal")}
          inputMode="decimal"
          autoComplete="off"
        />
        <Input
          id="itemsCount"
          name="itemsCount"
          label="Quantidade de itens"
          defaultValue={values.itemsCount}
          error={errorFor("itemsCount")}
          inputMode="numeric"
          autoComplete="off"
        />
        <Input
          id="nfeProtocol"
          name="nfeProtocol"
          label="Protocolo"
          defaultValue={values.nfeProtocol}
          error={errorFor("nfeProtocol")}
          inputMode="numeric"
          autoComplete="off"
        />
        <div className="sm:col-span-2">
          <Input
            id="nfeKey"
            name="nfeKey"
            label="Chave de acesso"
            defaultValue={values.nfeKey}
            error={errorFor("nfeKey")}
            className="font-mono"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
      </Section>

      <Section title="Envio">
        <Input
          id="carrier"
          name="carrier"
          label="Transportadora"
          defaultValue={values.carrier}
          error={errorFor("carrier")}
          list="carrier-suggestions"
          autoComplete="off"
        />
        <Input
          id="shippingService"
          name="shippingService"
          label="Serviço"
          defaultValue={values.shippingService}
          error={errorFor("shippingService")}
          list="service-suggestions"
          autoComplete="off"
        />
        <datalist id="service-suggestions">
          <option value="SEDEX" />
          <option value="PAC" />
        </datalist>
        <datalist id="carrier-suggestions">
          <option value="J&T Express" />
          <option value="Correios" />
          <option value="Jadlog" />
          <option value="Loggi" />
          <option value="Total Express" />
        </datalist>
        <Input
          id="trackingCode"
          name="trackingCode"
          label="Código de rastreio"
          defaultValue={values.trackingCode}
          error={errorFor("trackingCode")}
          className="font-mono"
          autoComplete="off"
        />
        <Input
          id="shippingLabelDate"
          name="shippingLabelDate"
          type="datetime-local"
          label="Data da etiqueta"
          defaultValue={values.shippingLabelDate}
          error={errorFor("shippingLabelDate")}
        />
      </Section>

      <Section title="Venda e entrega">
        <Input
          id="saleDate"
          name="saleDate"
          type="date"
          label="Data da venda (obrigatória)"
          defaultValue={values.saleDate}
          error={errorFor("saleDate")}
          required
        />
        <Input
          id="expectedDeliveryDate"
          name="expectedDeliveryDate"
          type="date"
          label="Previsão de entrega"
          defaultValue={values.expectedDeliveryDate}
          error={errorFor("expectedDeliveryDate")}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sellerId" className="text-sm font-medium text-text">
            Vendedora
          </label>
          <select id="sellerId" name="sellerId" defaultValue={values.sellerId} className={SELECT_CLASS}>
            <option value="">{UNKNOWN_SELLER_LABEL}</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
                {seller.active ? "" : " (inativa)"}
              </option>
            ))}
          </select>
          {errorFor("sellerId") && <p className="text-xs text-red-600">{errorFor("sellerId")}</p>}
        </div>
        <div>
          <Input
            id="salesOrigin"
            name="salesOrigin"
            label="Origem da venda"
            placeholder="Ex: ONLINE"
            defaultValue={values.salesOrigin}
            error={errorFor("salesOrigin")}
            list="origin-suggestions"
            autoComplete="off"
          />
          <datalist id="origin-suggestions">
            <option value="ONLINE" />
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="deliveryStatus" className="text-sm font-medium text-text">
            Status da entrega
          </label>
          <select
            id="deliveryStatus"
            name="deliveryStatus"
            value={deliveryStatus}
            onChange={(event) => setDeliveryStatus(event.target.value)}
            className={SELECT_CLASS}
          >
            {DELIVERY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {DELIVERY_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          {errorFor("deliveryStatus") && <p className="text-xs text-red-600">{errorFor("deliveryStatus")}</p>}
        </div>
        {deliveryStatus === "DELIVERED" && (
          <Input
            id="deliveredAt"
            name="deliveredAt"
            type="date"
            label="Entregue em"
            defaultValue={values.deliveredAt}
            error={errorFor("deliveredAt")}
          />
        )}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="notes" className="text-sm font-medium text-text">
            Observações
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={values.notes}
            className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
          {errorFor("notes") && <p className="text-xs text-red-600">{errorFor("notes")}</p>}
        </div>
      </Section>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "CONFIRMAR E SALVAR"}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={() => setResult(null)}>
          Trocar arquivos
        </Button>
      </div>
    </form>
  );
}
