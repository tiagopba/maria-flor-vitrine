// Parser ESTRUTURAL do XML da NF-e (nfeProc, versão 4.00) — nunca regex sobre o XML.
// fast-xml-parser faz só a árvore genérica; toda regra de negócio (campos exigidos,
// cStat, chave) é nossa, abaixo. PII (CPF, nome, endereço) nunca sai deste módulo
// para log/analytics — só para o fluxo normal de conferência, igual DANFE/etiqueta hoje.
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { onlyDigits } from "./text.ts";

export interface NfeXmlData {
  nfeNumber: string | null;
  nfeSeries: string | null;
  /** Chave de 44 dígitos — já validada igual entre infNFe/@Id e protNFe/infProt/chNFe. */
  nfeKey: string;
  protocolStatus: string;
  /** CPF ou CNPJ do destinatário, só dígitos. */
  recipientDocument: string | null;
  recipientName: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  invoiceTotal: number | null;
  /** Nome bruto de transp/transporta/xNome, como veio no XML — sem normalizar carrier aqui. */
  carrierNameRaw: string | null;
}

export type NfeParseResult = { ok: true; data: NfeXmlData } | { ok: false; error: string };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Mantém tudo como string: CEP/CPF/nNF podem ter zeros à esquerda que um parser
  // numérico destruiria (ex.: CEP "04686-001" vira "04686001", não 4686001).
  parseTagValue: false,
  trimValues: true,
});

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return ""; // nó repetido/estrutura inesperada: trata como ausente, nunca derruba o parser
  return String(value).trim();
}

function nullableStr(value: unknown): string | null {
  const s = str(value);
  return s === "" ? null : s;
}

/** Record genérico só para navegar a árvore do parser sem `any` espalhado pelo arquivo. */
type Node = Record<string, unknown>;
const node = (value: unknown): Node => (value && typeof value === "object" && !Array.isArray(value) ? (value as Node) : {});

export function parseNfeXml(xmlText: string): NfeParseResult {
  const validation = XMLValidator.validate(xmlText);
  if (validation !== true) {
    return { ok: false, error: "XML malformado — não foi possível ler o arquivo." };
  }

  let doc: unknown;
  try {
    doc = parser.parse(xmlText);
  } catch {
    return { ok: false, error: "XML malformado — não foi possível ler o arquivo." };
  }

  const root = node(doc);
  const nfeProc = node(root.nfeProc);
  if (Object.keys(nfeProc).length === 0) {
    return { ok: false, error: "Estrutura não suportada: esperado um XML nfeProc (NF-e autorizada, não a DANFE nem a etiqueta)." };
  }

  const infNFe = node(node(nfeProc.NFe).infNFe);
  if (Object.keys(infNFe).length === 0) {
    return { ok: false, error: "Estrutura não suportada: infNFe não encontrado no XML." };
  }

  const infProt = node(node(nfeProc.protNFe).infProt);
  if (Object.keys(infProt).length === 0) {
    return { ok: false, error: "XML sem protocolo de autorização (protNFe/infProt) — não dá para confirmar que foi autorizada." };
  }

  const idAttr = nullableStr(infNFe["@_Id"]);
  if (!idAttr) return { ok: false, error: "Chave de acesso não encontrada (infNFe/@Id)." };
  const keyFromId = idAttr.replace(/^NFe/, "");

  const chNFe = nullableStr(infProt.chNFe);
  if (!chNFe) return { ok: false, error: "Chave de acesso não encontrada no protocolo (protNFe/infProt/chNFe)." };

  if (keyFromId !== chNFe) {
    return { ok: false, error: "Chave de acesso divergente entre a NF-e e o protocolo de autorização." };
  }
  if (!/^\d{44}$/.test(keyFromId)) {
    return { ok: false, error: "Chave de acesso inválida: precisa ter 44 dígitos." };
  }

  const cStat = nullableStr(infProt.cStat);
  if (cStat !== "100") {
    return { ok: false, error: `NF-e não autorizada (cStat ${cStat ?? "ausente"} — esperado 100).` };
  }

  const ide = node(infNFe.ide);
  const dest = node(infNFe.dest);
  const ender = node(dest.enderDest);
  const total = node(node(infNFe.total).ICMSTot);
  const transporta = node(node(infNFe.transp).transporta);

  const vNFRaw = str(total.vNF);
  const invoiceTotal = vNFRaw !== "" && !Number.isNaN(Number(vNFRaw)) ? Number(vNFRaw) : null;

  const recipientDocumentRaw = dest.CPF ?? dest.CNPJ;

  return {
    ok: true,
    data: {
      nfeNumber: nullableStr(ide.nNF),
      nfeSeries: nullableStr(ide.serie),
      nfeKey: keyFromId,
      protocolStatus: cStat,
      recipientDocument: nullableStr(onlyDigits(str(recipientDocumentRaw))),
      recipientName: nullableStr(dest.xNome),
      addressLine: nullableStr(ender.xLgr),
      addressNumber: nullableStr(ender.nro),
      addressComplement: nullableStr(ender.xCpl),
      neighborhood: nullableStr(ender.xBairro),
      city: nullableStr(ender.xMun),
      state: nullableStr(ender.UF),
      postalCode: nullableStr(onlyDigits(str(ender.CEP))),
      invoiceTotal,
      carrierNameRaw: nullableStr(transporta.xNome),
    },
  };
}
