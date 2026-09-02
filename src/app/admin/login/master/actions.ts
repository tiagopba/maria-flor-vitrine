"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MASTER_EMAIL } from "@/lib/auth/master";
import { EMAIL_OTP_LENGTH } from "@/lib/leads/otp-constants";

/**
 * Login passwordless da conta master — mesmo mecanismo de OTP de e-mail do
 * Supabase Auth já usado em lib/leads/email-otp.ts, mas aqui o objetivo É
 * deixar a sessão logada de verdade (por isso usa o client de sessão/
 * cookies — `@/lib/supabase/server` — não o client público do fluxo de
 * leads, que nunca precisa persistir sessão).
 *
 * O e-mail nunca vem de input do usuário — é sempre `MASTER_EMAIL`
 * (lib/auth/master.ts). Só existe UM e-mail que este fluxo sabe
 * autenticar.
 *
 * `shouldCreateUser: false`: a conta master é criada uma única vez, de
 * forma controlada, ANTES de o login ser ativado (fora deste fluxo) — este
 * login nunca cria conta nenhuma sozinho. Se `MASTER_EMAIL` ainda não
 * existir no Supabase Auth, `signInWithOtp` simplesmente falha (nenhum
 * e-mail é enviado) — e essa falha é tratada exatamente como qualquer
 * outra abaixo, pra nunca revelar se a conta existe ou não.
 */

const RATE_LIMIT_KEY = "master-login-otp";

// Envio: mesma ordem de grandeza do fluxo de leads (email-otp.ts) — 30s
// entre pedidos, no máximo 5 por hora.
const SEND_COOLDOWN_SECONDS = 30;
const SEND_WINDOW_SECONDS = 60 * 60;
const SEND_MAX_PER_WINDOW = 5;

// Verificação: sem cooldown entre tentativas (a pessoa pode errar um
// dígito e tentar de novo na hora), mas com teto por janela — nunca
// permite testar o código de 8 dígitos à vontade.
const VERIFY_WINDOW_SECONDS = 60 * 60;
const VERIFY_MAX_ATTEMPTS = 10;

// Mensagens sempre genéricas de propósito — nunca revelam se a conta
// existe, se o e-mail foi realmente enviado, ou o motivo exato da falha.
// Quem está do lado de fora (sem saber se master@... já foi criada) vê
// exatamente a mesma resposta em qualquer um desses casos.
const GENERIC_SEND_MESSAGE = "Se este acesso estiver disponível, um código foi enviado para o e-mail configurado.";
const GENERIC_THROTTLE_MESSAGE = "Aguarde um instante antes de tentar novamente.";
const GENERIC_CODE_ERROR = "Código inválido ou expirado. Confira e tente de novo.";

export type StartMasterOtpResult = { success: true; message: string } | { error: string };

export async function startMasterOtpAction(): Promise<StartMasterOtpResult> {
  const admin = createAdminClient();

  const { data: claimed, error: claimError } = await admin.rpc("try_claim_otp_send", {
    p_key: RATE_LIMIT_KEY,
    p_cooldown_seconds: SEND_COOLDOWN_SECONDS,
    p_window_seconds: SEND_WINDOW_SECONDS,
    p_max_per_window: SEND_MAX_PER_WINDOW,
  });

  // Fail-closed: se a checagem de rate limit não puder ser feita de
  // verdade (migration ainda não aplicada, erro de infraestrutura), o
  // login master trata isso como bloqueio — nunca envia o código sem
  // saber se o limite foi respeitado. Diferente do fluxo público de leads
  // (email-otp.ts), que continua fail-open de propósito lá.
  if (claimError) {
    console.error("[startMasterOtpAction] falha ao checar rate limit — bloqueando por segurança:", claimError.message);
    return { error: GENERIC_THROTTLE_MESSAGE };
  }
  if (!claimed) {
    return { error: GENERIC_THROTTLE_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: MASTER_EMAIL,
    options: { shouldCreateUser: false },
  });

  // Sucesso ou falha (conta não existe ainda, Supabase Auth recusou,
  // etc.) — a resposta pro navegador é SEMPRE a mesma mensagem genérica de
  // "código enviado". O erro real, quando existe, só vai pro log do
  // servidor (nunca pro cliente).
  if (error) {
    console.error("[startMasterOtpAction] signInWithOtp não enviou (esperado se a conta ainda não existe):", error.message);
  }

  return { success: true, message: GENERIC_SEND_MESSAGE };
}

export type VerifyMasterOtpResult = { success: true } | { error: string };

/**
 * Confirma o código e, se a sessão for válida, checa se essa conta já tem
 * `profiles.role = 'master'`. Login sozinho NUNCA concede a role —
 * atribuir master é sempre um passo manual separado (rodado direto no
 * banco pelo usuário). Sem isso, a conta autentica normalmente (Supabase
 * Auth aceita o código), mas `requireAdmin`/`getCurrentAdmin` tratam como
 * "sem perfil" e barram o acesso ao Admin.
 */
export async function verifyMasterOtpAction(code: string): Promise<VerifyMasterOtpResult> {
  const trimmedCode = code.trim();
  if (!new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`).test(trimmedCode)) {
    return { error: `Digite o código de ${EMAIL_OTP_LENGTH} dígitos que enviamos.` };
  }

  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin.rpc("try_claim_otp_verify_attempt", {
    p_key: RATE_LIMIT_KEY,
    p_window_seconds: VERIFY_WINDOW_SECONDS,
    p_max_attempts: VERIFY_MAX_ATTEMPTS,
  });

  // Fail-closed: mesmo motivo de startMasterOtpAction acima — sem
  // confirmar o rate limit de verdade, nunca chama verifyOtp.
  if (claimError) {
    console.error("[verifyMasterOtpAction] falha ao checar rate limit — bloqueando por segurança:", claimError.message);
    return { error: GENERIC_THROTTLE_MESSAGE };
  }
  if (!claimed) {
    return { error: GENERIC_THROTTLE_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: MASTER_EMAIL,
    token: trimmedCode,
    type: "email",
  });

  if (error || !data.user) {
    return { error: GENERIC_CODE_ERROR };
  }

  // Chegar até aqui já prova posse real da caixa master@... (o Supabase
  // confirmou um código que só foi enviado pra ela) — a partir daqui a
  // checagem de role pode ser específica, sem risco de vazar existência
  // da conta pra quem não a controla.
  const { data: profile } = await admin.from("profiles").select("role").eq("id", data.user.id).maybeSingle();

  if (!profile) {
    return {
      error:
        "E-mail confirmado, mas esta conta ainda não tem a role master atribuída no banco. Peça para rodar a atribuição manual antes de continuar.",
    };
  }

  if (profile.role !== "master") {
    return { error: `E-mail confirmado, mas esta conta tem a role "${profile.role}", não master.` };
  }

  return { success: true };
}
