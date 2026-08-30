"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { recordInstitutionalEvent } from "@/lib/institutional/analytics";
import { confirmEmailOtp, resumeLeadByToken, startEmailOtp } from "@/lib/leads/email-otp";
import { submitOfferLead, type OfferLeadFieldErrors } from "@/lib/leads/actions";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";

const RESEND_COOLDOWN_SECONDS = 30;
const RESUME_TOKEN_STORAGE_KEY = "mf_ofertas_resume_token";
const RESUME_TOKEN_TTL_MS = 48 * 60 * 60_000; // 48h — espelha o TTL gravado no servidor

/**
 * O navegador guarda só um token opaco (nunca e-mail/WhatsApp/nome) por um
 * tempo curto: grava junto um `expiresAt` local e qualquer leitura depois
 * desse prazo trata como se nunca tivesse existido. O TTL de verdade é
 * sempre reforçado pelo servidor (resume_token_expires_at) — esta checagem
 * client-side é só pra não nem tentar mandar um token visivelmente vencido.
 */
function readResumeToken(): string | null {
  try {
    const raw = window.localStorage.getItem(RESUME_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token: string; expiresAt: number };
    if (!parsed.token || Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(RESUME_TOKEN_STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    window.localStorage.removeItem(RESUME_TOKEN_STORAGE_KEY);
    return null;
  }
}

function writeResumeToken(token: string) {
  try {
    window.localStorage.setItem(
      RESUME_TOKEN_STORAGE_KEY,
      JSON.stringify({ token, expiresAt: Date.now() + RESUME_TOKEN_TTL_MS }),
    );
  } catch {
    // localStorage indisponível (modo privado etc.) — recuperação de
    // progresso só não funciona; o cadastro em si não depende disso.
  }
}

function clearResumeToken() {
  try {
    window.localStorage.removeItem(RESUME_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Cadastro → confirmar WhatsApp → confirmar e-mail → liberado. A etapa de
 * WhatsApp ainda não tem um provedor de OTP aprovado (ver relatório
 * entregue com esta mudança) — mostrada de forma honesta como "em
 * preparação" em vez de fingir uma confirmação que não existe. A etapa de
 * e-mail é real: usa o OTP do próprio Supabase Auth (lib/leads/email-otp.ts).
 */
type Step = "form" | "whatsappStep" | "emailStep" | "done";

export function OffersFormClient({ offersGroupUrl }: { offersGroupUrl: string | null }) {
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<OfferLeadFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const viewedRef = useRef(false);
  const resumeCheckedRef = useRef(false);

  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Recuperação de progresso: se a cliente já tinha cadastro em andamento
  // (fechou a página no meio da verificação), continua de onde parou em vez
  // de pedir pra preencher tudo de novo — o navegador manda só o token
  // opaco guardado; quem resolve pra qual lead ele pertence e devolve o
  // e-mail (só pra exibir na tela, nunca persistido de novo) é o servidor.
  useEffect(() => {
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;

    const token = readResumeToken();
    if (!token) return;

    resumeLeadByToken(token)
      .then((status) => {
        if (!status.found) {
          clearResumeToken();
          return;
        }
        setResumeToken(token);
        if (status.email) setEmail(status.email);
        if (status.emailVerified) {
          setStep("done");
        } else {
          setStep("whatsappStep");
        }
      })
      .catch(() => {});
  }, []);

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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

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

    writeResumeToken(result.resumeToken);
    setResumeToken(result.resumeToken);
    setStep("whatsappStep");
  }

  async function handleStartEmailVerification() {
    if (!resumeToken) return;
    setStep("emailStep");
    setOtpError(null);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    const result = await startEmailOtp(resumeToken);
    if ("error" in result) setOtpError(result.error);
  }

  async function handleResendCode() {
    if (resendCooldown > 0 || !resumeToken) return;
    setOtpError(null);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    const result = await startEmailOtp(resumeToken);
    if ("error" in result) setOtpError(result.error);
  }

  async function handleConfirmCode(e: React.FormEvent) {
    e.preventDefault();
    if (!resumeToken) return;
    setOtpError(null);
    setOtpSubmitting(true);

    const result = await confirmEmailOtp(resumeToken, otpCode);

    setOtpSubmitting(false);

    if ("error" in result) {
      setOtpError(result.error);
      return;
    }

    clearResumeToken();
    setStep("done");
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

  if (step === "done") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
        <p className="font-display text-lg text-text">Cadastro confirmado! ❤️</p>
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

  if (step === "emailStep") {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-center">
          <p className="font-display text-lg text-text">Quase pronto para entrar no grupo ❤️</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-primary">2 de 2</p>
          <p className="mt-1 text-sm text-text-muted">Confirme seu e-mail</p>
        </div>

        <p className="text-center text-sm text-text-muted">
          Enviamos um código de 6 dígitos para <span className="font-medium text-text">{email}</span>.
        </p>

        <form onSubmit={handleConfirmCode} className="flex flex-col gap-4">
          <Input
            label="Código de confirmação"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            error={otpError ?? undefined}
            className="text-center text-lg tracking-[0.3em]"
            autoComplete="one-time-code"
            required
          />

          <Button type="submit" disabled={otpSubmitting || otpCode.length !== 6} className="h-12">
            {otpSubmitting ? "Confirmando..." : "Confirmar código"}
          </Button>

          <button
            type="button"
            onClick={handleResendCode}
            disabled={resendCooldown > 0}
            className="self-center text-xs text-text-muted underline disabled:no-underline disabled:opacity-60"
          >
            {resendCooldown > 0 ? `Reenviar código (${resendCooldown}s)` : "Reenviar código"}
          </button>
        </form>
      </div>
    );
  }

  if (step === "whatsappStep") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div>
          <p className="font-display text-lg text-text">Quase pronto para entrar no grupo ❤️</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-primary">1 de 2</p>
          <p className="mt-1 text-sm text-text-muted">Confirme seu WhatsApp</p>
        </div>

        <p className="max-w-xs text-sm text-text-muted">
          A confirmação automática por WhatsApp ainda está em preparação. Por enquanto, vamos
          seguir com a confirmação por e-mail.
        </p>

        <Button type="button" onClick={handleStartEmailVerification} className="h-12">
          Continuar
        </Button>
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
