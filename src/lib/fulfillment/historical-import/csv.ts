// Leitor de CSV da planilha antiga — PURO (sem Node-only, sem Supabase).
// Aceita BOM, separador ";" "," ou TAB (detectado pelo cabeçalho), campos entre
// aspas com "" escapado e quebras de linha dentro de aspas.

export interface ParsedCsv {
  delimiter: ";" | "," | "\t";
  header: string[];
  /** Cada registro de dados, na ordem do arquivo (a posição 1-based = índice + 1). Linhas totalmente vazias entram vazias, para a numeração nunca deslocar. */
  rows: string[][];
}

function detectDelimiter(firstLine: string): ";" | "," | "\t" {
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === ";" || ch === "," || ch === "\t")) counts[ch] += 1;
  }
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"] && counts[";"] > 0) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  if (counts[","] > 0) return ",";
  return ";";
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) endField();
    else if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRecord();
    } else if (ch === "\n") endRecord();
    else field += ch;
  }
  // último registro sem quebra de linha final
  if (field !== "" || record.length > 0) endRecord();

  const [header = [], ...rows] = records;
  return {
    delimiter,
    header: header.map((h) => h.trim()),
    rows: rows.map((r) => r.map((c) => c.trim())),
  };
}

export function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}
