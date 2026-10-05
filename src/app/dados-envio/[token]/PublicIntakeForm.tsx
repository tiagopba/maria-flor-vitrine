"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { submitPublicIntakeAction, type PublicSubmitValues } from "./actions";

const EMPTY: PublicSubmitValues = {
  fullName: "",
  cpf: "",
  email: "",
  whatsapp: "",
  deliveryToCustomer: true,
  recipientName: "",
  postalCode: "",
  addressLine: "",
  addressNumber: "",
  addressComplement: "",
  neighborhood: "",
  city: "",
  state: "",
};

/** Formulário da cliente. Valores ficam só na tela (sem localStorage, sem analytics). */
export function PublicIntakeForm({ token }: { token: string }) {
  const [values, setValues] = useState<PublicSubmitValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof PublicSubmitValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await submitPublicIntakeAction(token, values);
      if (result.ok) {
        setDone(true);
        return;
      }
      setFormError(result.error);
      setErrors(result.fieldErrors ?? {});
    });
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 text-center">
        <p className="font-display text-xl">✅ Dados recebidos!</p>
        <p className="mt-2 text-sm text-text-muted">Agora vamos preparar a nota fiscal e o envio do seu pedido. 💕</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Dados pessoais</h2>
        <Input id="fullName" label="Nome completo *" value={values.fullName} onChange={set("fullName")} error={errors.fullName} autoComplete="name" />
        <Input id="cpf" label="CPF *" value={values.cpf} onChange={set("cpf")} error={errors.cpf} inputMode="numeric" autoComplete="off" />
        <Input id="email" label="E-mail" value={values.email} onChange={set("email")} error={errors.email} inputMode="email" autoComplete="email" />
        <Input id="whatsapp" label="WhatsApp *" value={values.whatsapp} onChange={set("whatsapp")} error={errors.whatsapp} inputMode="tel" autoComplete="tel" placeholder="(67) 99999-9999" />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Endereço de entrega</h2>
        <Input id="postalCode" label="CEP *" value={values.postalCode} onChange={set("postalCode")} error={errors.postalCode} inputMode="numeric" autoComplete="postal-code" />
        <Input id="addressLine" label="Rua *" value={values.addressLine} onChange={set("addressLine")} error={errors.addressLine} autoComplete="address-line1" />
        <Input id="addressNumber" label="Número *" value={values.addressNumber} onChange={set("addressNumber")} error={errors.addressNumber} autoComplete="address-line2" />
        <Input id="addressComplement" label="Complemento" value={values.addressComplement} onChange={set("addressComplement")} error={errors.addressComplement} />
        <Input id="neighborhood" label="Bairro *" value={values.neighborhood} onChange={set("neighborhood")} error={errors.neighborhood} />
        <Input id="city" label="Cidade *" value={values.city} onChange={set("city")} error={errors.city} autoComplete="address-level2" />
        <Input id="state" label="UF *" value={values.state} onChange={set("state")} error={errors.state} maxLength={2} autoComplete="address-level1" />

        <label className="flex items-center gap-3 text-sm text-text">
          <input
            type="checkbox"
            checked={values.deliveryToCustomer}
            onChange={(e) => setValues((v) => ({ ...v, deliveryToCustomer: e.target.checked }))}
            className="h-5 w-5 accent-primary"
          />
          A entrega será para mim
        </label>

        {!values.deliveryToCustomer && (
          <Input id="recipientName" label="Nome do destinatário *" value={values.recipientName} onChange={set("recipientName")} error={errors.recipientName} />
        )}
      </section>

      {formError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        ENVIAR MEUS DADOS
      </Button>
    </form>
  );
}
