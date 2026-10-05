// Documentos (DANFE/etiqueta em PDF) de um registro — PURO, sem Storage.
// Registro HISTORICAL_IMPORT não tem PDFs: os caminhos são NULL e NUNCA se
// inventa um path falso nem se consulta o Storage por um arquivo inexistente.

export type DocumentRoute = "danfe" | "etiqueta";

export interface DocumentPaths {
  danfe_file_path: string | null;
  label_file_path: string | null;
}

export function documentPathFor(record: DocumentPaths, tipo: string): string | null {
  if (tipo === "danfe") return record.danfe_file_path || null;
  if (tipo === "etiqueta") return record.label_file_path || null;
  return null;
}

export function documentAvailability(record: DocumentPaths): { danfe: boolean; label: boolean; any: boolean } {
  const danfe = Boolean(record.danfe_file_path);
  const label = Boolean(record.label_file_path);
  return { danfe, label, any: danfe || label };
}

export const HISTORICAL_NO_DOCUMENTS_MESSAGE = "Registro histórico — documentos não disponíveis";
