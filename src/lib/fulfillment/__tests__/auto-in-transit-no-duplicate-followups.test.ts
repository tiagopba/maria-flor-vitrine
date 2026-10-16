// O trigger que cria os 3 follow-ups só dispara em INSERT em
// fulfillment_records (ver 20261007100000_fulfillment_followups.sql). O
// auto-IN_TRANSIT (saveTrackingAction/applyDeliveryUpdate) só faz UPDATE —
// por construção, nunca duplica follow-up. Garantido aqui lendo o código:
// nenhum dos dois arquivos insere em fulfillment_records nem fulfillment_followups.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const FILES = [
  "src/app/admin/faturamento-envios/tracking-actions.ts",
  "src/app/admin/faturamento-envios/delivery-update-shared.ts",
  "src/app/admin/faturamento-envios/quick-edit-actions.ts",
];

describe("auto IN_TRANSIT nunca insere em fulfillment_records/fulfillment_followups (só UPDATE)", () => {
  for (const file of FILES) {
    it(`${file} não tem nenhum .insert(`, () => {
      assert.doesNotMatch(read(file), /\.insert\(/);
    });
  }
});
