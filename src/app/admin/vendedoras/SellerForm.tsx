"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SellerFormState } from "./actions";

type SellerFormAction = (state: SellerFormState, formData: FormData) => Promise<SellerFormState>;

export interface SellerFormDefaults {
  name: string;
  whatsapp_number: string;
  phone: string | null;
  active: boolean;
  round_robin: boolean;
}

const initialState: SellerFormState = {};

export function SellerForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: SellerFormAction;
  defaultValues?: SellerFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        id="name"
        name="name"
        label="Nome"
        placeholder="Ex: Ana"
        defaultValue={defaultValues?.name}
        error={state.fieldErrors?.name}
        required
      />

      <Input
        id="whatsapp_number"
        name="whatsapp_number"
        label="WhatsApp (com DDI e DDD, só números)"
        placeholder="5511999998888"
        defaultValue={defaultValues?.whatsapp_number}
        error={state.fieldErrors?.whatsapp_number}
        required
      />

      <Input
        id="phone"
        name="phone"
        label="Telefone (opcional)"
        placeholder="(11) 99999-8888"
        defaultValue={defaultValues?.phone ?? ""}
        error={state.fieldErrors?.phone}
      />

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          name="active"
          defaultChecked={defaultValues?.active ?? true}
          className="h-4 w-4 rounded border-border"
        />
        Ativa
      </label>

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          name="round_robin"
          defaultChecked={defaultValues?.round_robin ?? true}
          className="h-4 w-4 rounded border-border"
        />
        Participa da distribuição automática (&quot;Qualquer vendedora&quot;)
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
