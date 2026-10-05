"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SellerFormState } from "./actions";

type SellerFormAction = (state: SellerFormState, formData: FormData) => Promise<SellerFormState>;

export interface SellerFormDefaults {
  whatsapp_number: string;
  phone: string | null;
  round_robin: boolean;
}

const initialState: SellerFormState = {};

/**
 * mode "create" (NOVA VENDEDORA): nome, contato e se já nasce ativa.
 * mode "contact" (CONTATO): só WhatsApp/telefone/rodízio — nome e ativa/inativa
 * têm ações próprias (EDITAR NOME, DESATIVAR/REATIVAR) para ninguém trocar uma
 * pessoa por outra editando um cadastro antigo.
 */
export function SellerForm({
  action,
  mode,
  defaultValues,
  submitLabel,
}: {
  action: SellerFormAction;
  mode: "create" | "contact";
  defaultValues?: SellerFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "create" && (
        <Input
          id="name"
          name="name"
          label="Nome"
          placeholder="Ex: Ana"
          error={state.fieldErrors?.name}
          autoComplete="off"
          required
        />
      )}

      <Input
        id="whatsapp_number"
        name="whatsapp_number"
        label="WhatsApp (com DDI e DDD)"
        placeholder="+55 (67) 99999-9999"
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

      {mode === "create" && (
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" name="active" defaultChecked className="h-4 w-4 rounded border-border" />
          Ativa (aparece para novas vendas e no WhatsApp)
        </label>
      )}

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
