"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DualPriceBlock, formatBRL } from "@/components/ui/Price";
import { calculateInstallmentCount } from "@/lib/catalog/installments";
import type { PaymentSettings } from "@/lib/site-settings/payments";
import type { PaymentSettingsFormState } from "./actions";

type PaymentSettingsAction = (
  state: PaymentSettingsFormState,
  formData: FormData,
) => Promise<PaymentSettingsFormState>;

const initialState: PaymentSettingsFormState = {};

const PREVIEW_CARD_PRICE = 199.9;
const PREVIEW_CASH_PRICE = 179.9;

export function PaymentSettingsForm({
  action,
  defaultValues,
}: {
  action: PaymentSettingsAction;
  defaultValues: PaymentSettings;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  const [defaultMaxInstallments, setDefaultMaxInstallments] = useState(
    String(defaultValues.defaultMaxInstallments),
  );
  const [minInstallmentValue, setMinInstallmentValue] = useState(String(defaultValues.minInstallmentValue));
  const [cashPriceEnabled, setCashPriceEnabled] = useState(defaultValues.cashPriceEnabled);
  const [installmentsEnabled, setInstallmentsEnabled] = useState(defaultValues.installmentsEnabled);

  const previewInstallmentCount = calculateInstallmentCount({
    price: PREVIEW_CARD_PRICE,
    maxInstallmentsOverride: null,
    defaultMaxInstallments: Number(defaultMaxInstallments) || 1,
    minInstallmentValue: Number(minInstallmentValue) || 0,
    installmentsEnabled,
  });
  const previewInstallmentAmount =
    previewInstallmentCount != null ? Math.round((PREVIEW_CARD_PRICE * 100) / previewInstallmentCount) / 100 : null;

  return (
    <form action={formAction} className="rounded-xl border border-border p-4 sm:p-5">
      <h2 className="font-display text-lg text-text">Pagamentos</h2>
      <p className="mt-0.5 text-xs text-text-muted">
        Regra de parcelamento e exibição do preço no Pix — usada em todo produto cadastrado com o
        modelo de dois preços. Não afeta produtos que ainda têm só um preço.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            name="cashPriceEnabled"
            checked={cashPriceEnabled}
            onChange={(e) => setCashPriceEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Mostrar preço no Pix publicamente
        </label>

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            name="installmentsEnabled"
            checked={installmentsEnabled}
            onChange={(e) => setInstallmentsEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Mostrar parcelamento sem juros
        </label>

        <div className="grid grid-cols-2 gap-4">
          <Input
            id="defaultMaxInstallments"
            name="defaultMaxInstallments"
            type="number"
            step="1"
            min="1"
            max="24"
            label="Máximo de parcelas (padrão da loja)"
            value={defaultMaxInstallments}
            onChange={(e) => setDefaultMaxInstallments(e.target.value)}
            error={state.fieldErrors?.defaultMaxInstallments}
          />
          <Input
            id="minInstallmentValue"
            name="minInstallmentValue"
            type="number"
            step="0.01"
            min="0"
            label="Valor mínimo da parcela (R$)"
            value={minInstallmentValue}
            onChange={(e) => setMinInstallmentValue(e.target.value)}
            error={state.fieldErrors?.minInstallmentValue}
          />
        </div>

        <div className="rounded-lg bg-muted/60 p-3">
          <p className="mb-1 text-xs font-medium text-text-muted">
            Exemplo com Pix {formatBRL(PREVIEW_CASH_PRICE)} e cartão {formatBRL(PREVIEW_CARD_PRICE)}
          </p>
          {cashPriceEnabled ? (
            <DualPriceBlock
              pricing={{
                model: "dual",
                cashPrice: PREVIEW_CASH_PRICE,
                cardPrice: PREVIEW_CARD_PRICE,
                installmentCount: previewInstallmentCount,
                installmentAmount: previewInstallmentAmount,
              }}
              variant="card"
            />
          ) : (
            <p className="text-sm text-text-muted">{formatBRL(PREVIEW_CARD_PRICE)}</p>
          )}
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <Button type="submit" disabled={pending} className="mt-1 self-start">
          {pending ? "Salvando..." : "Salvar pagamentos"}
        </Button>
      </div>
    </form>
  );
}
