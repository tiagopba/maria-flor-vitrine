import type { DanfeData } from "./types.ts";
import { brDateToIso, onlyDigits, parseBrazilianMoney, splitLines, stripLeadingZeros } from "./text.ts";

const EMPTY: DanfeData = {
  customerName: null,
  customerDocument: null,
  addressLine: null,
  addressNumber: null,
  addressComplement: null,
  neighborhood: null,
  postalCode: null,
  city: null,
  state: null,
  nfeNumber: null,
  nfeSeries: null,
  nfeKey: null,
  nfeProtocol: null,
  nfeIssuedAt: null,
  itemsCount: null,
  invoiceTotal: null,
};

const CONSUMER_HEADING = /^(?:CONSUMIDOR|DESTINAT[ÁA]RIO(?:\s*\/\s*REMETENTE)?)\b/i;
const CONSUMER_DOCUMENT_LINE =
  /^(?:CNPJ\s*\/\s*CPF(?:\s*\/\s*ID\s*Estrangeiro)?|CPF|CNPJ)\s*:?\s*([\d.\-/]{11,18})\s*(.*)$/i;
const STOP_AFTER_CONSUMER = /^INFORMA[ÇC][ÕO]ES\s+ADICIONAIS/i;
const NUMBER_ONLY = /^(?:\d+[A-Za-z]?|S\s*\/?\s*N)$/i;

function match(text: string, pattern: RegExp): RegExpMatchArray | null {
  return text.match(pattern);
}

function parseKey(text: string): string | null {
  const grouped = match(text, /(?<!\d)(?:\d{4}[ \t]?){10}\d{4}(?!\d)/);
  if (grouped) {
    const digits = onlyDigits(grouped[0]);
    if (digits.length === 44) return digits;
  }
  return null;
}

/**
 * "Rua X, 960, APTO 2 B, Vila Isa - São Paulo - SP" (formato do Bling:
 * logradouro, número, [complemento,] bairro - município - UF).
 */
function parseAddressLine(raw: string): Partial<DanfeData> {
  let line = raw.trim();
  const out: Partial<DanfeData> = {};

  const cep = match(line, /\b(\d{5})-?(\d{3})\b/);
  if (cep) {
    out.postalCode = `${cep[1]}${cep[2]}`;
    line = line
      .replace(cep[0], "")
      .replace(/\bCEP\s*:?\s*/i, "")
      .replace(/\s{2,}/g, " ")
      .replace(/[,\s-]+$/, "")
      .trim();
  }

  const tail = match(line, /^(.*)\s-\s(.+?)\s-\s([A-Za-z]{2})$/);
  if (!tail) return { ...out, addressLine: line || null };

  out.city = tail[2].trim() || null;
  out.state = tail[3].toUpperCase();

  const parts = tail[1]
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length >= 3) {
    out.addressLine = parts[0];
    out.addressNumber = parts[1];
    out.neighborhood = parts[parts.length - 1];
    const complement = parts.slice(2, -1).join(", ");
    out.addressComplement = complement || null;
  } else if (parts.length === 2) {
    out.addressLine = parts[0];
    if (NUMBER_ONLY.test(parts[1])) out.addressNumber = parts[1];
    else out.neighborhood = parts[1];
  } else if (parts.length === 1) {
    out.addressLine = parts[0];
  }

  return out;
}

/**
 * Lê o texto extraído de um DANFE Simplificado (Bling). Só usa o que está
 * explícito no texto — qualquer campo ausente volta null.
 */
export function parseDanfeSimplificado(text: string): DanfeData {
  const result: DanfeData = { ...EMPTY };
  if (!text.trim()) return result;

  result.nfeKey = parseKey(text);

  const protocol = match(text, /Protocolo\s+de\s+autoriza[çc][ãa]o(?:\s+de\s+uso)?\s*:?\s*(\d{15})/i);
  result.nfeProtocol = protocol ? protocol[1] : null;

  const number =
    match(text, /N[º°o.]*\s*NF-?e\s*:?\s*([\d.]+)/i) ?? match(text, /NF-?e\s*N[º°o.]*\s*:?\s*([\d.]+)/i);
  if (number) {
    const digits = onlyDigits(number[1]);
    result.nfeNumber = digits ? stripLeadingZeros(digits) : null;
  }

  const series = match(text, /S[ÉE]RIE\s*:?\s*(\d{1,3})/i);
  result.nfeSeries = series ? stripLeadingZeros(series[1]) : null;

  const issued = match(text, /Data\s+de\s+emiss[ãa]o\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  result.nfeIssuedAt = issued ? brDateToIso(issued[1], issued[2], issued[3]) : null;

  const items = match(text, /QTD\.?\s*TOTAL\s*DE\s*ITENS\s*(\d+)/i);
  result.itemsCount = items ? Number(items[1]) : null;

  const total = match(text, /VALOR\s+(?:TOTAL\s+)?(?:DA\s+)?NOTA\s*R\$\s*([\d.]+,\d{2})/i);
  result.invoiceTotal = total ? parseBrazilianMoney(total[1]) : null;

  // Cliente: só dentro do bloco do consumidor/destinatário — o CNPJ do
  // emitente (a própria loja) aparece no topo com um formato parecido e
  // nunca pode ser confundido com o do cliente.
  const lines = splitLines(text);
  const headingIndex = lines.findIndex((line) => CONSUMER_HEADING.test(line));
  if (headingIndex >= 0) {
    const block: string[] = [];
    for (const line of lines.slice(headingIndex + 1)) {
      if (STOP_AFTER_CONSUMER.test(line)) break;
      block.push(line);
    }

    const docIndex = block.findIndex((line) => CONSUMER_DOCUMENT_LINE.test(line));
    if (docIndex >= 0) {
      const doc = block[docIndex].match(CONSUMER_DOCUMENT_LINE);
      if (doc) {
        const digits = onlyDigits(doc[1]);
        result.customerDocument = digits.length === 11 || digits.length === 14 ? digits : null;
        result.customerName = doc[2].trim() || null;
      }
      const addressRaw = block[docIndex + 1];
      if (addressRaw) Object.assign(result, parseAddressLine(addressRaw));
    }
  }

  return result;
}
