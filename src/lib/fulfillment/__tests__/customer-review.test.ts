import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CUSTOMER_REVIEW_STATUSES, isCustomerReviewStatus, reviewEligibility, reviewRowState } from "../customer-review.ts";

describe("reviewEligibility", () => {
  it("cliente sem customer_id (sem CPF confiável) — segue elegível, comportamento de antes deste módulo", () => {
    assert.deepEqual(reviewEligibility(null), { eligible: true, reason: null });
  });

  it("NEVER_ASKED e DISMISSED são elegíveis", () => {
    assert.equal(reviewEligibility("NEVER_ASKED").eligible, true);
    assert.equal(reviewEligibility("DISMISSED").eligible, true);
  });

  it("REQUESTED, REVIEWED e DOES_NOT_WANT bloqueiam, cada um com um motivo próprio", () => {
    for (const status of ["REQUESTED", "REVIEWED", "DOES_NOT_WANT"] as const) {
      const result = reviewEligibility(status);
      assert.equal(result.eligible, false);
      assert.ok(result.reason && result.reason.length > 0);
    }
    // Nunca o mesmo texto genérico pros três — cada bloqueio tem seu motivo.
    const reasons = new Set((["REQUESTED", "REVIEWED", "DOES_NOT_WANT"] as const).map((s) => reviewEligibility(s).reason));
    assert.equal(reasons.size, 3);
  });
});

describe("isCustomerReviewStatus", () => {
  it("aceita só os 5 estados fechados", () => {
    for (const s of CUSTOMER_REVIEW_STATUSES) assert.equal(isCustomerReviewStatus(s), true);
    assert.equal(isCustomerReviewStatus("SENT"), false); // nunca confundir com o status do follow-up por venda
    assert.equal(isCustomerReviewStatus(""), false);
    assert.equal(isCustomerReviewStatus(null), false);
  });
});

describe("reviewRowState", () => {
  it("sem estado global (sem customer_id ou backend da Fase 3 não aplicado) — só o follow-up da venda decide", () => {
    assert.equal(reviewRowState("OPEN", null), "AVAILABLE");
    assert.equal(reviewRowState("SENT", null), "REQUESTED");
  });

  it("estado global sempre vence um follow-up OPEN desta venda — nunca mostra como pendência aberta", () => {
    assert.equal(reviewRowState("OPEN", "REQUESTED"), "REQUESTED");
    assert.equal(reviewRowState("OPEN", "REVIEWED"), "REVIEWED");
    assert.equal(reviewRowState("OPEN", "DOES_NOT_WANT"), "DOES_NOT_WANT");
    assert.equal(reviewRowState("OPEN", "DISMISSED"), "DISMISSED");
  });

  it("follow-up SENT com estado global NEVER_ASKED/DISMISSED (venda antiga antes do backend) — ainda solicitada", () => {
    assert.equal(reviewRowState("SENT", "NEVER_ASKED"), "REQUESTED");
    assert.equal(reviewRowState("SENT", "DISMISSED"), "REQUESTED");
  });

  it("follow-up OPEN com estado global NEVER_ASKED — disponível", () => {
    assert.equal(reviewRowState("OPEN", "NEVER_ASKED"), "AVAILABLE");
  });
});
