import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { HISTORICAL_NO_DOCUMENTS_MESSAGE, documentAvailability, documentPathFor } from "../documents.ts";
import { planDeliveryUpdate, type DeliveryState } from "../delivery-update.ts";
import { PAGE_SIZE, collectFilterOptions, fetchAllPages, type FilterOptionRow } from "../paginate.ts";
import { deliveryUpdateSchema, fulfillmentRecordSchema } from "../schema.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");

describe("filtros de Faturamento: mais de 1000 registros não truncam as opções", () => {
  // Simula o PostgREST: no máximo 1000 linhas por request, sem erro.
  function serverWith(rows: FilterOptionRow[]) {
    return async (from: number, to: number) => rows.slice(from, Math.min(to + 1, from + 1000));
  }

  it("uma leitura única (como era) perde as opções que só aparecem depois da linha 1000", async () => {
    const rows: FilterOptionRow[] = Array.from({ length: 2500 }, () => ({ sales_origin: "ONLINE", carrier: "Correios" }));
    rows[1800] = { sales_origin: "TRAY", carrier: "Jadlog" };
    rows[2400] = { sales_origin: "META", carrier: "Loggi" };
    const single = collectFilterOptions(await serverWith(rows)(0, 1_000_000));
    assert.deepEqual(single.origins, ["ONLINE"]); // o bug: TRAY e META sumiam
    assert.deepEqual(single.carriers, ["Correios"]);
  });

  it("paginado: TRAY, META, Jadlog e Loggi continuam aparecendo", async () => {
    const rows: FilterOptionRow[] = Array.from({ length: 2500 }, () => ({ sales_origin: "ONLINE", carrier: "Correios" }));
    rows[1800] = { sales_origin: "TRAY", carrier: "Jadlog" };
    rows[2400] = { sales_origin: "META", carrier: "Loggi" };
    const all = await fetchAllPages(serverWith(rows));
    assert.equal(all.length, 2500);
    const options = collectFilterOptions(all);
    assert.deepEqual(options.origins, ["META", "ONLINE", "TRAY"]);
    assert.deepEqual(options.carriers, ["Correios", "Jadlog", "Loggi"]);
  });

  it("múltiplo exato de 1000 também termina e não perde nada", async () => {
    const rows: FilterOptionRow[] = Array.from({ length: 2 * PAGE_SIZE }, (_, i) => ({ sales_origin: `O${i}`, carrier: null }));
    const options = collectFilterOptions(await fetchAllPages(serverWith(rows)));
    assert.equal(options.origins.length, 2000);
  });

  it("só origem e transportadora entram na consulta (nenhum dado pessoal) e a leitura é paginada por PK", () => {
    const source = read("src/lib/db/fulfillment.ts");
    const fn = source.match(/export async function getFulfillmentFilterOptions[\s\S]*?\n}\n/)?.[0] ?? "";
    assert.match(fn, /\.select\("sales_origin, carrier"\)/);
    assert.match(fn, /\.order\("id"\)/);
    assert.match(fn, /\.range\(from, to\)/);
    assert.match(fn, /fetchAllPages/);
    assert.doesNotMatch(fn, /\.limit\(/);
    assert.doesNotMatch(fn, /customer|cpf|address|notes/);
  });
});

describe("UNKNOWN ('Situação não informada') só para histórico", () => {
  const base = {
    customerName: "Ana",
    saleDate: "2026-10-01",
  } as Record<string, string>;
  const empty = Object.fromEntries(
    [
      "customerDocument", "addressLine", "addressNumber", "addressComplement", "neighborhood", "postalCode", "city", "state",
      "nfeNumber", "nfeSeries", "nfeKey", "nfeProtocol", "nfeIssuedAt", "itemsCount", "invoiceTotal", "carrier",
      "shippingService", "trackingCode", "shippingLabelDate", "sellerId", "salesOrigin", "expectedDeliveryDate",
      "deliveredAt", "notes",
    ].map((k) => [k, ""])
  );

  it("o formulário de cadastro por PDF recusa UNKNOWN e continua aceitando os 6 status normais", () => {
    assert.equal(fulfillmentRecordSchema.safeParse({ ...empty, ...base, deliveryStatus: "UNKNOWN" }).success, false);
    for (const status of ["", "PENDING", "IN_TRANSIT", "RESENT", "REFUNDED", "DELIVERY_ISSUE"]) {
      assert.equal(fulfillmentRecordSchema.safeParse({ ...empty, ...base, deliveryStatus: status }).success, true, status);
    }
  });

  it("todo cadastro por PDF sai como PDF_UPLOAD", () => {
    assert.equal(fulfillmentRecordSchema.parse({ ...empty, ...base, deliveryStatus: "" }).record_source, "PDF_UPLOAD");
  });

  const current: DeliveryState = {
    delivery_status: "UNKNOWN",
    expected_delivery_date: null,
    delivered_at: null,
    notes: null,
    carrier: null,
    shipping_service: null,
    tracking_code: null,
  };
  const form = (patch: Record<string, string>) =>
    deliveryUpdateSchema.parse({
      carrier: "", shippingService: "", trackingCode: "", expectedDeliveryDate: "", deliveryStatus: "UNKNOWN",
      deliveredAt: "", notes: "", confirmClearDelivery: "", ...patch,
    });

  it("atualização: registro PDF_UPLOAD NÃO pode ir para UNKNOWN", () => {
    const result = planDeliveryUpdate({ ...current, delivery_status: "PENDING" }, form({}), "PDF_UPLOAD");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.fieldErrors.deliveryStatus ?? "", /históricos/);
  });

  it("atualização: registro HISTÓRICO pode permanecer ou sair de UNKNOWN", () => {
    const toResent = planDeliveryUpdate(current, form({ deliveryStatus: "RESENT" }), "HISTORICAL_IMPORT");
    assert.equal(toResent.ok, true);
    const noteOnly = planDeliveryUpdate(current, form({ notes: "conferir" }), "HISTORICAL_IMPORT");
    assert.equal(noteOnly.ok, true);
  });

  it("a migration só permite UNKNOWN com record_source = HISTORICAL_IMPORT", () => {
    const sql = read("supabase/migrations/20261005190100_fulfillment_historical_import_support.sql");
    assert.match(sql, /check \(delivery_status <> 'UNKNOWN' or record_source = 'HISTORICAL_IMPORT'\)/);
  });
});

describe("histórico sem PDFs", () => {
  const historical = { danfe_file_path: null, label_file_path: null };
  const normal = { danfe_file_path: "a/danfe.pdf", label_file_path: "a/label.pdf" };

  it("registro histórico: nenhum botão de documento e mensagem própria", () => {
    assert.deepEqual(documentAvailability(historical), { danfe: false, label: false, any: false });
    assert.deepEqual(documentAvailability(normal), { danfe: true, label: true, any: true });
    assert.equal(HISTORICAL_NO_DOCUMENTS_MESSAGE, "Registro histórico — documentos não disponíveis");
    const view = read("src/app/admin/faturamento-envios/[id]/RecordDetailView.tsx");
    assert.match(view, /documents\.any \? \(/);
    assert.match(view, /documents\.danfe && \(/);
    assert.match(view, /documents\.label && \(/);
    assert.match(view, /HISTORICAL_NO_DOCUMENTS_MESSAGE/);
  });

  it("a rota de documentos responde 404 com path NULL ANTES de consultar o Storage", () => {
    assert.equal(documentPathFor(historical, "danfe"), null);
    assert.equal(documentPathFor(historical, "etiqueta"), null);
    assert.equal(documentPathFor(normal, "danfe"), "a/danfe.pdf");
    assert.equal(documentPathFor(normal, "outro"), null);
    const route = read("src/app/admin/faturamento-envios/[id]/arquivo/[tipo]/route.ts");
    const nullCheck = route.indexOf("if (!path) return new Response");
    const download = route.indexOf("downloadFulfillmentDocument(path)");
    assert.ok(nullCheck > 0 && download > nullCheck, "a checagem de path nulo vem antes do download");
  });

  it("listagem mostra 'Histórico' discretamente e trata UNKNOWN", () => {
    const table = read("src/app/admin/faturamento-envios/RecordsTable.tsx");
    assert.match(table, /record\.record_source === "HISTORICAL_IMPORT"/);
    assert.match(table, /Histórico/);
    assert.match(table, /UNKNOWN:/);
  });

  it("listagem ordena por sale_date DESC, depois created_at DESC, com id para desempate", () => {
    const source = read("src/lib/db/fulfillment.ts");
    const order = source.match(/\.order\("sale_date"[\s\S]*?\.range\(from, from \+ FULFILLMENT_PAGE_SIZE\)/)?.[0] ?? "";
    assert.match(order, /\.order\("sale_date", \{ ascending: false \}\)\s*\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: true \}\)/);
  });
});

describe("migrations novas (conteúdo)", () => {
  const history = read("supabase/migrations/20261005190100_fulfillment_historical_import_support.sql");
  const sellers = read("supabase/migrations/20261005190000_sellers_rls_and_optional_whatsapp.sql");

  it("a migration já aplicada (20261005120000) NÃO foi editada: não conhece histórico nem record_source", () => {
    const applied = read("supabase/migrations/20261005120000_fulfillment_records.sql");
    assert.doesNotMatch(applied, /record_source|HISTORICAL_IMPORT|import_ref|UNKNOWN/);
    assert.match(applied, /danfe_file_path text not null/);
  });

  it("histórico: record_source com default PDF_UPLOAD, PDFs só opcionais para histórico, ref único parcial", () => {
    assert.match(history, /record_source text not null default 'PDF_UPLOAD'/);
    assert.match(history, /check \(record_source in \('PDF_UPLOAD', 'HISTORICAL_IMPORT'\)\)/);
    assert.match(history, /record_source = 'HISTORICAL_IMPORT'\s*or \(danfe_file_path is not null and label_file_path is not null\)/);
    assert.match(history, /create unique index if not exists fulfillment_records_import_ref_uniq\s*on public\.fulfillment_records \(import_ref\)\s*where import_ref is not null/);
    assert.doesNotMatch(history, /drop table|truncate|delete from|update public\./i);
  });

  it("sellers: escrita só is_admin(), sem policy de DELETE, DELETE revogado, WhatsApp só obrigatório para ativa", () => {
    assert.match(sellers, /create policy "sellers_admin_insert" on public\.sellers\s*for insert\s*with check \(is_admin\(\)\)/);
    assert.match(sellers, /create policy "sellers_admin_update" on public\.sellers\s*for update\s*using \(is_admin\(\)\)\s*with check \(is_admin\(\)\)/);
    assert.match(sellers, /create policy "sellers_admin_select" on public\.sellers\s*for select\s*using \(is_admin\(\)\)/);
    assert.doesNotMatch(sellers, /create policy[^;]*for delete/i);
    assert.doesNotMatch(sellers, /create policy[^;]*for all/i);
    assert.match(sellers, /revoke delete on table public\.sellers from anon, authenticated/);
    assert.match(sellers, /alter column whatsapp_number drop not null/);
    assert.match(sellers, /check \(active = false or whatsapp_number is not null\)/);
    // (o cabeçalho cita a função antiga em comentário; nenhuma policy pode usá-la)
    const executable = sellers
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(executable, /is_catalog_editor_or_admin/);
  });
});
