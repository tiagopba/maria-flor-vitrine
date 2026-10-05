import { extractText, getDocumentProxy } from "unpdf";
import type { DocumentReadStatus } from "./types.ts";

// DANFE simplificado e etiqueta têm 1 página; qualquer coisa muito maior que
// isso não é um documento esperado e só gastaria CPU do servidor.
const MAX_PAGES = 10;
const MIN_TEXT_LENGTH = 20;

export type PdfTextResult =
  | { status: "ok"; text: string }
  | { status: Exclude<DocumentReadStatus, "ok">; text: null };

export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

/** Extrai o texto do PDF (camada de texto do próprio arquivo — sem OCR). */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult> {
  if (!looksLikePdf(bytes)) return { status: "invalid", text: null };

  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > MAX_PAGES) return { status: "invalid", text: null };

    const { text } = await extractText(pdf, { mergePages: false });
    const joined = text.join("\n");
    if (joined.replace(/\s/g, "").length < MIN_TEXT_LENGTH) return { status: "no_text", text: null };
    return { status: "ok", text: joined };
  } catch {
    return { status: "invalid", text: null };
  }
}
