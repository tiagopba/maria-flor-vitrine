"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import {
  createFulfillmentRecord,
  findDuplicateRecords,
  isActiveSeller,
  logFulfillmentAudit,
} from "@/lib/db/fulfillment";
import { analyzeDocuments } from "@/lib/fulfillment/analyze";
import { looksLikePdf } from "@/lib/fulfillment/pdf-text";
import { FORM_FIELD_NAMES, fulfillmentRecordSchema } from "@/lib/fulfillment/schema";
import type { DocumentComparison, DocumentReadStatus, FulfillmentFormValues } from "@/lib/fulfillment/types";

// Documentos com dados pessoais: só Admin e Master (RLS is_admin() no banco é a segunda trava).
const ALLOWED_ROLES = ["admin", "master"] as const;

// Server Actions e a Vercel limitam o corpo da requisição (~4,5MB): 2MB por PDF
// deixa folga para os dois arquivos + campos. Mesmo limite do bucket.
const MAX_PDF_BYTES = 2 * 1024 * 1024;

export type ReadDocumentsResult =
  | {
      ok: true;
      danfeStatus: DocumentReadStatus;
      labelStatus: DocumentReadStatus;
      values: FulfillmentFormValues;
      comparison: DocumentComparison;
      /** Bairro + complemento como impressos na etiqueta (não separáveis) — só dica para o funcionário. */
      labelAddressHint: string | null;
      duplicates: { id: string; created_at: string }[];
    }
  | { ok: false; error: string };

export type SaveRecordResult = {
  ok: false;
  error?: string;
  fieldErrors?: Record<string, string>;
};

async function readPdfFile(
  value: FormDataEntryValue | null,
  label: string
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  if (!(value instanceof File) || value.size === 0) {
    return { ok: false, error: `Selecione o PDF de ${label}.` };
  }
  if (value.size > MAX_PDF_BYTES) {
    return { ok: false, error: `O PDF de ${label} é maior que 2MB.` };
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (!looksLikePdf(bytes)) {
    return { ok: false, error: `O arquivo de ${label} não é um PDF válido.` };
  }
  return { ok: true, bytes };
}

export async function readDocumentsAction(formData: FormData): Promise<ReadDocumentsResult> {
  await requireAdmin([...ALLOWED_ROLES]);

  const danfeFile = await readPdfFile(formData.get("danfe"), "DANFE Simplificado");
  if (!danfeFile.ok) return danfeFile;
  const labelFile = await readPdfFile(formData.get("label"), "Etiqueta de Envio");
  if (!labelFile.ok) return labelFile;

  const analysis = await analyzeDocuments(danfeFile.bytes, labelFile.bytes);
  if (!analysis.ok) return analysis;

  let duplicates: { id: string; created_at: string }[] = [];
  try {
    duplicates = await findDuplicateRecords({
      nfeKey: analysis.nfe.key,
      nfeNumber: analysis.nfe.number,
      nfeSeries: analysis.nfe.series,
    });
  } catch {
    // Aviso de duplicidade é só conveniência — nunca impede a leitura.
  }

  return {
    ok: true,
    danfeStatus: analysis.danfeStatus,
    labelStatus: analysis.labelStatus,
    values: analysis.values,
    comparison: analysis.comparison,
    labelAddressHint: analysis.labelAddressHint,
    duplicates,
  };
}

export async function saveFulfillmentRecordAction(formData: FormData): Promise<SaveRecordResult> {
  const admin = await requireAdmin([...ALLOWED_ROLES]);

  const danfeFile = await readPdfFile(formData.get("danfe"), "DANFE Simplificado");
  if (!danfeFile.ok) return danfeFile;
  const labelFile = await readPdfFile(formData.get("label"), "Etiqueta de Envio");
  if (!labelFile.ok) return labelFile;

  const raw = Object.fromEntries(
    FORM_FIELD_NAMES.map((name) => {
      const value = formData.get(name);
      return [name, typeof value === "string" ? value : ""];
    })
  );

  const parsed = fulfillmentRecordSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    return {
      ok: false,
      error: "Corrija os campos destacados antes de salvar.",
      fieldErrors: Object.fromEntries(Object.entries(flat).map(([key, messages]) => [key, messages?.[0] ?? ""])),
    };
  }

  // Nova venda só aceita vendedora ATIVA (a tela já esconde as inativas; aqui é a trava no servidor).
  if (parsed.data.seller_id && !(await isActiveSeller(parsed.data.seller_id))) {
    return {
      ok: false,
      error: "Corrija os campos destacados antes de salvar.",
      fieldErrors: { sellerId: "Vendedora inativa ou inexistente. Escolha uma vendedora ativa." },
    };
  }

  const id = randomUUID();
  try {
    await createFulfillmentRecord({
      id,
      fields: parsed.data,
      danfe: danfeFile.bytes,
      label: labelFile.bytes,
      actorId: admin.id,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível salvar o registro." };
  }

  await logFulfillmentAudit({
    recordId: id,
    action: "CREATED",
    actorId: admin.id,
    details: { source: "pdf_upload" },
  });

  revalidatePath("/admin/faturamento-envios");
  redirect(`/admin/faturamento-envios/${id}?sucesso=${encodeURIComponent("Registro salvo com sucesso.")}`);
}
