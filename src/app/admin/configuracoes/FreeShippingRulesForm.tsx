"use client";

import { useState } from "react";
import { BRAZILIAN_STATES, getStateLabel } from "@/lib/shipping/brazilian-states";
import type { FreeShippingRule, ShippingService } from "@/lib/db/shipping";
import {
  deleteFreeShippingRuleAction,
  toggleFreeShippingRuleAction,
  upsertFreeShippingRuleAction,
} from "./free-shipping-actions";

const SERVICES: ShippingService[] = ["PAC", "SEDEX"];

interface RuleDraft {
  id: string | null;
  active: boolean;
  amountText: string;
}

type DraftsByState = Record<string, Partial<Record<ShippingService, RuleDraft>>>;

function toDraftMap(rules: FreeShippingRule[]): DraftsByState {
  const map: DraftsByState = {};
  for (const rule of rules) {
    map[rule.stateCode] ??= {};
    map[rule.stateCode][rule.service] = {
      id: rule.id,
      active: rule.active,
      amountText: rule.minimumAmount.toFixed(2).replace(".", ","),
    };
  }
  return map;
}

function emptyDraft(): RuleDraft {
  return { id: null, active: false, amountText: "" };
}

/** Aceita "199,90" ou "199.90" — sempre devolve número > 0, ou null se inválido. */
function parseAmount(text: string): number | null {
  const normalized = text.trim().replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Configurações → Frete grátis. Cada linha (estado + serviço) salva de
 * forma independente pela action correspondente — nunca um "salvar tudo"
 * gigante, já que são regras independentes (ver desenho aprovado). Só
 * mostra estados que já têm pelo menos 1 regra; "+ Adicionar estado" só
 * inclui a UF na tela, não grava nada até a admin marcar um serviço e
 * clicar Salvar.
 */
export function FreeShippingRulesForm({ initialRules }: { initialRules: FreeShippingRule[] }) {
  const [stateCodes, setStateCodes] = useState<string[]>(() =>
    [...new Set(initialRules.map((r) => r.stateCode))].sort()
  );
  const [draftsByState, setDraftsByState] = useState<DraftsByState>(() => toDraftMap(initialRules));
  const [addingState, setAddingState] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});

  const remainingStates = BRAZILIAN_STATES.filter((s) => !stateCodes.includes(s.code));

  function getDraft(stateCode: string, service: ShippingService): RuleDraft {
    return draftsByState[stateCode]?.[service] ?? emptyDraft();
  }

  function updateDraft(stateCode: string, service: ShippingService, patch: Partial<RuleDraft>) {
    setDraftsByState((prev) => ({
      ...prev,
      [stateCode]: { ...prev[stateCode], [service]: { ...(prev[stateCode]?.[service] ?? emptyDraft()), ...patch } },
    }));
  }

  function clearError(key: string) {
    setErrorByKey((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleToggle(stateCode: string, service: ShippingService, checked: boolean) {
    const draft = getDraft(stateCode, service);
    const key = `${stateCode}:${service}`;

    // Regra ainda não existe no banco: marcar o checkbox só revela o campo
    // de valor pra digitar — não grava nada sozinho.
    if (!draft.id) {
      updateDraft(stateCode, service, { active: checked });
      return;
    }

    setSavingKey(key);
    clearError(key);
    const result = await toggleFreeShippingRuleAction(draft.id, checked);
    setSavingKey(null);

    if ("error" in result) {
      setErrorByKey((prev) => ({ ...prev, [key]: result.error }));
      return;
    }
    updateDraft(stateCode, service, { active: checked });
  }

  async function handleSave(stateCode: string, service: ShippingService) {
    const draft = getDraft(stateCode, service);
    const key = `${stateCode}:${service}`;
    const amount = parseAmount(draft.amountText);

    if (amount === null) {
      setErrorByKey((prev) => ({ ...prev, [key]: "Informe um valor válido." }));
      return;
    }

    setSavingKey(key);
    clearError(key);
    const result = await upsertFreeShippingRuleAction({
      state_code: stateCode,
      service,
      minimum_amount: amount,
      active: true,
    });
    setSavingKey(null);

    if ("error" in result) {
      setErrorByKey((prev) => ({ ...prev, [key]: result.error }));
      return;
    }

    updateDraft(stateCode, service, { id: result.id, active: true, amountText: amount.toFixed(2).replace(".", ",") });
  }

  async function handleDelete(stateCode: string, service: ShippingService) {
    const draft = getDraft(stateCode, service);
    if (!draft.id) return;
    const key = `${stateCode}:${service}`;

    setSavingKey(key);
    clearError(key);
    const result = await deleteFreeShippingRuleAction(draft.id);
    setSavingKey(null);

    if ("error" in result) {
      setErrorByKey((prev) => ({ ...prev, [key]: result.error }));
      return;
    }
    updateDraft(stateCode, service, emptyDraft());
  }

  function handleAddState() {
    if (!addingState || stateCodes.includes(addingState)) return;
    setStateCodes((prev) => [...prev, addingState].sort());
    setAddingState("");
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div>
        <h3 className="font-medium text-text">Frete grátis</h3>
        <p className="text-xs text-text-muted">
          Condições exibidas em Minhas Roupas. Estado sem nenhum serviço marcado não mostra promoção nenhuma.
        </p>
      </div>

      {stateCodes.length === 0 && <p className="text-sm text-text-muted">Nenhum estado configurado ainda.</p>}

      <div className="flex flex-col gap-4">
        {stateCodes.map((stateCode) => (
          <div key={stateCode} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
            <span className="text-sm font-semibold text-text">{getStateLabel(stateCode) ?? stateCode}</span>
            {SERVICES.map((service) => {
              const draft = getDraft(stateCode, service);
              const key = `${stateCode}:${service}`;
              const saving = savingKey === key;
              return (
                <div key={service} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.active}
                      disabled={saving}
                      onChange={(e) => handleToggle(stateCode, service, e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <span className="w-14 text-sm text-text">{service}</span>
                    <span className="text-sm text-text-muted">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={draft.amountText}
                      disabled={saving}
                      onChange={(e) => updateDraft(stateCode, service, { amountText: e.target.value })}
                      className="h-9 w-28 rounded-lg border border-border bg-surface px-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSave(stateCode, service)}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text hover:bg-muted disabled:opacity-50"
                    >
                      {saving ? "Salvando..." : "Salvar"}
                    </button>
                    {draft.id && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDelete(stateCode, service)}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  {errorByKey[key] && <p className="text-xs text-red-600">{errorByKey[key]}</p>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {remainingStates.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={addingState}
            onChange={(e) => setAddingState(e.target.value)}
            className="h-9 flex-1 rounded-lg border border-border bg-surface px-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Adicionar estado...</option>
            {remainingStates.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddState}
            disabled={!addingState}
            className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-muted disabled:opacity-50"
          >
            + Adicionar
          </button>
        </div>
      )}
    </div>
  );
}
