import { compareDocuments, mergeToFormValues } from "./compare";
import { parseDanfeSimplificado } from "./parse-danfe";
import { parseShippingLabel } from "./parse-label";
import { extractPdfText } from "./pdf-text";
import type {
  DanfeData,
  DocumentComparison,
  DocumentReadStatus,
  FulfillmentFormValues,
  ShippingLabelData,
} from "./types";

export type AnalyzeDocumentsResult =
  | {
      ok: true;
      danfeStatus: DocumentReadStatus;
      labelStatus: DocumentReadStatus;
      values: FulfillmentFormValues;
      comparison: DocumentComparison;
      /** Bairro + complemento como impressos na etiqueta (não separáveis) — só dica para o funcionário. */
      labelAddressHint: string | null;
      /** Usados só pelo servidor (aviso de duplicidade); nunca vão ao navegador. */
      nfe: { key: string | null; number: string | null; series: string | null };
    }
  | { ok: false; error: string };

/** Lê os dois PDFs (texto do próprio arquivo, sem OCR), extrai, compara e mescla nos campos do formulário. */
export async function analyzeDocuments(danfeBytes: Uint8Array, labelBytes: Uint8Array): Promise<AnalyzeDocumentsResult> {
  const [danfeText, labelText] = await Promise.all([extractPdfText(danfeBytes), extractPdfText(labelBytes)]);

  if (danfeText.status === "invalid") {
    return { ok: false, error: "Não foi possível abrir o PDF do DANFE Simplificado. Envie outro arquivo." };
  }
  if (labelText.status === "invalid") {
    return { ok: false, error: "Não foi possível abrir o PDF da Etiqueta de Envio. Envie outro arquivo." };
  }

  const danfe: DanfeData | null = danfeText.status === "ok" ? parseDanfeSimplificado(danfeText.text) : null;
  const label: ShippingLabelData | null = labelText.status === "ok" ? parseShippingLabel(labelText.text) : null;

  return {
    ok: true,
    danfeStatus: danfeText.status,
    labelStatus: labelText.status,
    values: mergeToFormValues(danfe, label),
    comparison: compareDocuments(danfe, label),
    labelAddressHint: !danfe?.addressLine ? (label?.addressRemainder ?? null) : null,
    nfe: { key: danfe?.nfeKey ?? null, number: danfe?.nfeNumber ?? null, series: danfe?.nfeSeries ?? null },
  };
}
