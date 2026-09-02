"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OtpInput } from "@/components/ui/OtpInput";
import { EMAIL_OTP_LENGTH } from "@/lib/leads/otp-constants";
import { startMasterOtpAction, verifyMasterOtpAction } from "./actions";

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Login master — só e-mail (nenhum campo de senha existe aqui, de
 * propósito: essa conta não tem senha). Mesmo padrão visual/de fluxo de
 * OffersFormClient (envia código → digita código), reaproveitando
 * OtpInput/EMAIL_OTP_LENGTH já existentes.
 */
export function MasterLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"start" | "code">("start");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  async function sendCode() {
    setSending(true);
    setSendError(null);
    const result = await startMasterOtpAction();
    setSending(false);

    if ("error" in result) {
      setSendError(result.error);
      return;
    }

    setCode("");
    setStep("code");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    const id = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) clearInterval(id);
        return Math.max(0, s - 1);
      });
    }, 1000);
  }

  async function handleVerify(value: string) {
    if (value.length !== EMAIL_OTP_LENGTH || verifying) return;
    setVerifying(true);
    setCodeError(null);

    const result = await verifyMasterOtpAction(value);
    setVerifying(false);

    if ("error" in result) {
      setCodeError(result.error);
      setCode("");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  if (step === "start") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          Esta conta não usa senha. Enviaremos um código de {EMAIL_OTP_LENGTH} dígitos para o e-mail master.
        </p>
        {sendError && <p className="text-sm text-red-600">{sendError}</p>}
        <Button type="button" onClick={sendCode} disabled={sending} className="w-full">
          {sending ? "Enviando..." : "Enviar código"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-text-muted">
        Digite o código de {EMAIL_OTP_LENGTH} dígitos enviado para o e-mail master.
      </p>

      <OtpInput
        length={EMAIL_OTP_LENGTH}
        value={code}
        onChange={(value) => {
          setCode(value);
          if (codeError) setCodeError(null);
          if (value.length === EMAIL_OTP_LENGTH) handleVerify(value);
        }}
        disabled={verifying}
        hasError={Boolean(codeError)}
      />
      {codeError && <p className="text-center text-xs text-red-600">{codeError}</p>}

      <Button
        type="button"
        onClick={() => handleVerify(code)}
        disabled={verifying || code.length !== EMAIL_OTP_LENGTH}
        className="w-full"
      >
        {verifying ? "Confirmando..." : "Confirmar código"}
      </Button>

      <button
        type="button"
        onClick={sendCode}
        disabled={resendCooldown > 0 || sending}
        className="self-center text-xs text-text-muted underline disabled:no-underline disabled:opacity-60"
      >
        {resendCooldown > 0 ? `Reenviar código (${resendCooldown}s)` : "Reenviar código"}
      </button>
    </div>
  );
}
