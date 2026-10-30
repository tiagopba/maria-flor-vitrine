// EDITAR DADOS DA VENDA (pós-aprovação, fulfillment_records) — PURO.
//
// `sale_total` fica de fora de propósito: depois que a venda foi conferida e aprovada
// contra a NF-e, o valor que participou dessa prova não é mais editável nesta versão
// (decisão de negócio — ver seção 2 do audit). Vendedora, data e origem nunca entram em
// nenhuma comparação do Confere Geral, então não existe "conferência para invalidar" aqui.

export type RecordSaleDetailsField = "sale_date" | "seller_id" | "sales_origin";

export interface RecordSaleDetailsCurrent {
  saleDate: string;
  sellerId: string | null;
  salesOrigin: string | null;
}

export interface RecordSaleDetailsInput {
  saleDate: string;
  sellerId: string | null;
  salesOrigin: string | null;
}

export type RecordSaleDetailsPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      changedFields: RecordSaleDetailsField[];
      update: { sale_date?: string; seller_id?: string | null; sales_origin?: string | null };
    };

export function planRecordSaleDetailsUpdate(current: RecordSaleDetailsCurrent, input: RecordSaleDetailsInput): RecordSaleDetailsPlan {
  const changedFields: RecordSaleDetailsField[] = [];
  if (input.saleDate !== current.saleDate) changedFields.push("sale_date");
  if (input.sellerId !== current.sellerId) changedFields.push("seller_id");
  if (input.salesOrigin !== current.salesOrigin) changedFields.push("sales_origin");

  if (changedFields.length === 0) {
    return { ok: false, error: "Nenhuma alteração para salvar." };
  }

  const update: { sale_date?: string; seller_id?: string | null; sales_origin?: string | null } = {};
  if (changedFields.includes("sale_date")) update.sale_date = input.saleDate;
  if (changedFields.includes("seller_id")) update.seller_id = input.sellerId;
  if (changedFields.includes("sales_origin")) update.sales_origin = input.salesOrigin;

  return { ok: true, changedFields, update };
}
