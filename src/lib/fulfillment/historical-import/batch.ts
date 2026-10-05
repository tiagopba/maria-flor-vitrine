// Identidade do lote da importação. Usa node:crypto — roda no Node (script/testes), nunca no navegador.
import { createHash } from "node:crypto";

function slug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * Lote = identidade do ARQUIVO: o mesmo arquivo (mesmos bytes) sempre gera o mesmo lote, então
 * reimportar não duplica; um arquivo diferente gera outro lote. `label` é só um apelido legível.
 */
export function computeBatchId(fileContent: string | Uint8Array, label?: string): string {
  const sha = createHash("sha256").update(fileContent).digest("hex").slice(0, 12);
  const cleanLabel = label ? slug(label) : "";
  return ["hist", cleanLabel, sha].filter(Boolean).join("-");
}
