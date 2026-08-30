"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { recordInstitutionalEvent } from "@/lib/institutional/analytics";
import { submitOfferLead, type OfferLeadFieldErrors } from "@/lib/leads/actions";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";

export function OffersFormClient({ offersGroupUrl }: { offersGroupUrl: string | null }) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<OfferLeadFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    const utm = captureAndPersistUtm();
    recordInstitutionalEvent({
      eventType: "OFFERS_PAGE_VIEW",
      sessionId: getVisitorSessionId(),
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
    }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);

    const utm = captureAndPersistUtm();
    const result = await submitOfferLead({
      name,
      whatsapp,
      email,
      marketingConsent: consent,
      sessionId: getVisitorSessionId(),
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
    });

    setSubmitting(false);

    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }

    setSuccess(true);
  }

  function handleGroupClick() {
    const utm = captureAndPersistUtm();
    recordInstitutionalEvent({
      eventType: "OFFERS_GROUP_CLICK",
      sessionId: getVisitorSessionId(),
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
    }).catch(() => {});
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
        <p className="font-display text-lg text-text">Cadastro realizado! ❤️</p>
        <p className="text-sm text-text-muted">Agora você pode entrar no nosso grupo de ofertas.</p>

        {offersGroupUrl ? (
          <a href={offersGroupUrl} target="_blank" rel="noopener noreferrer" onClick={handleGroupClick}>
            <Button className="mt-2 h-12">Entrar no grupo de ofertas</Button>
          </a>
        ) : (
          <p className="mt-2 text-xs text-text-muted">
            Em breve avisaremos você por aqui assim que o grupo estiver disponível.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        autoComplete="name"
        required
      />
      <Input
        label="WhatsApp"
        type="tel"
        inputMode="tel"
        placeholder="(67) 99999-9999"
        value={whatsapp}
        onChange={(e) => setWhatsapp(e.target.value)}
        error={errors.whatsapp}
        autoComplete="tel"
        required
      />
      <Input
        label="E-mail"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        autoComplete="email"
        required
      />

      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary/40"
        />
        <span>
          Quero participar do Grupo de Ofertas da Maria Flor e autorizo o uso dos meus dados para
          receber novidades, promoções e comunicações de marketing. Leia nossa{" "}
          <Link href="/politica-de-privacidade" className="underline hover:text-primary">
            Política de Privacidade
          </Link>
          .
        </span>
      </label>
      {errors.marketingConsent && <p className="text-xs text-red-600">{errors.marketingConsent}</p>}
      {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}

      <Button type="submit" disabled={submitting} className="h-12">
        {submitting ? "Enviando..." : "Quero entrar"}
      </Button>
    </form>
  );
}
