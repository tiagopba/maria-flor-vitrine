// Documentos de um registro — PURO, sem Storage. Três origens, três formatos:
// PDF_UPLOAD (DANFE + etiqueta), XML_UPLOAD (XML da NF-e) e HISTORICAL_IMPORT
// (nenhum documento). Nunca se inventa um path falso nem se consulta o
// Storage por um arquivo que a origem do registro diz que não existe.

export type DocumentRoute = "danfe" | "etiqueta" | "xml";

export interface DocumentPaths {
  record_source: "PDF_UPLOAD" | "HISTORICAL_IMPORT" | "XML_UPLOAD";
  danfe_file_path: string | null;
  label_file_path: string | null;
  xml_file_path: string | null;
}

export function documentPathFor(record: DocumentPaths, tipo: string): string | null {
  if (tipo === "danfe") return record.danfe_file_path || null;
  if (tipo === "etiqueta") return record.label_file_path || null;
  if (tipo === "xml") return record.xml_file_path || null;
  return null;
}

export interface DocumentAvailability {
  danfe: boolean;
  label: boolean;
  xml: boolean;
  any: boolean;
}

/**
 * XML_UPLOAD nunca teve DANFE/etiqueta — não é "histórico sem documento", é um
 * registro com documento, só que de outro tipo. Por isso decide pela origem,
 * não só pela presença de arquivo: evita confundir os dois casos mesmo que um
 * dia um registro tenha um path nulo por engano.
 */
export function documentAvailability(record: DocumentPaths): DocumentAvailability {
  if (record.record_source === "XML_UPLOAD") {
    const xml = Boolean(record.xml_file_path);
    return { danfe: false, label: false, xml, any: xml };
  }
  const danfe = Boolean(record.danfe_file_path);
  const label = Boolean(record.label_file_path);
  return { danfe, label, xml: false, any: danfe || label };
}

export const HISTORICAL_NO_DOCUMENTS_MESSAGE = "Registro histórico — documentos não disponíveis";
export const XML_DOCUMENT_LABEL = "Documento fiscal: XML da NF-e";
export const XML_DOCUMENT_AVAILABLE_MESSAGE = "XML disponível para consulta";
