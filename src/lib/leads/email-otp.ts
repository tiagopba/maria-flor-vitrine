"use server";

import { headers } from "next/headers";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Confirmação real de propriedade do e-mail — usa o próprio OTP de e-mail
 * do Supabase Auth (código de 6 dígitos por padrão, expira sozinho, já
 * tem limite de reenvio embutido) em vez de reinventar geração, hash e
 * expiração de código na mão. Nunca guardamos o código em lugar nenhum do
 * nosso banco — quem guarda e confere é o próprio Supabase Auth; só
 * gravamos o RESULTADO (verificado ou não) em `leads.email_verified_at`,
 * e só depois do Supabase confirmar o código, nunca antes.
 *
 * Efeito colateral consciente dessa escolha: o Supabase Auth precisa de
 * um usuário pra emitir OTP, então isso cria (ou reaproveita) um registro
 * em `auth.users` para cada e-mail verificado — misturando "lead de
 * marketing" com "conta de autenticação" nos bastidores. Decisão
 * deliberada pra entregar verificação real sem contratar um provedor de
 * e-mail novo agora. Em Production, configure um SMTP próprio em
 * Project Settings → Auth → SMTP Settings do Supabase (o padrão do
 * Supabase tem limite de envio baixo, pensado só para desenvolvimento).
 *
 * Toda operação aqui exige `email` + `sessionId` batendo com o lead já
 * cadastrado (mesmo `session_id` gravado por `submitOfferLead`). Isso
 * fecha duas coisas de uma vez: (1) ninguém consegue disparar OTP pra um
 * e-mail que não é seu (precisaria adivinhar o UUID de sessão daquele
 * navegador) e (2) vira a base do rate limit por e-mail abaixo.
 */

const OTP_RESEND_COOLDOWN_MS = 30_000;
const OTP_SEND_WINDOW_MS = 60 * 60_000; // 1h
const OTP_SEND_MAX_PER_WINDOW = 5;

const GENERIC_SEND_ERROR = "Não foi possível enviar o código agora. Tente novamente.";
const GENERIC_COOLDOWN_ERROR = "Aguarde um instante antes de pedir um novo código.";

async function logAbuseSignal(action: "send" | "verify", email: string) {
  // Sinal auxiliar só pra investigação manual em caso de abuso — nunca usado
  // pra bloquear ou identificar "quem é a cliente" (isso é feito por
  // email+sessionId, não por IP, que é falível: NAT, rede móvel, VPN).
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
    console.log(`[email-otp] ${action} email=${email} ip=${ip}`);
  } catch {
    // headers() pode falhar fora de um request real (ex: script de teste) — não é crítico.
  }
}

type LeadOtpRow = {
  id: string;
  session_id: string;
  auth_user_id: string | null;
  otp_email_send_count: number | null;
  otp_email_last_sent_at: string | null;
};

async function findLeadForOtp(email: string, sessionId: string): Promise<LeadOtpRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("leads")
    .select("id, session_id, auth_user_id, otp_email_send_count, otp_email_last_sent_at")
    .eq("email", email)
    .maybeSingle();

  if (!data || data.session_id !== sessionId) return null;
  return data;
}

export type StartEmailOtpResult = { success: true } | { error: string };

export async function startEmailOtp(email: string, sessionId: string): Promise<StartEmailOtpResult> {
  if (!email || !sessionId) return { error: GENERIC_SEND_ERROR };

  const lead = await findLeadForOtp(email, sessionId);
  if (!lead) {
    // Não revela se o e-mail existe ou não, nem se foi o sessionId que não bateu.
    return { error: GENERIC_SEND_ERROR };
  }

  const now = Date.now();
  const lastSentAt = lead.otp_email_last_sent_at ? new Date(lead.otp_email_last_sent_at).getTime() : null;

  if (lastSentAt !== null && now - lastSentAt < OTP_RESEND_COOLDOWN_MS) {
    return { error: GENERIC_COOLDOWN_ERROR };
  }

  const withinWindow = lastSentAt !== null && now - lastSentAt < OTP_SEND_WINDOW_MS;
  const currentCount = withinWindow ? (lead.otp_email_send_count ?? 0) : 0;

  if (withinWindow && currentCount >= OTP_SEND_MAX_PER_WINDOW) {
    return { error: "Você atingiu o limite de códigos por hora. Tente novamente mais tarde." };
  }

  await logAbuseSignal("send", email);

  // Grava a tentativa ANTES de chamar o Supabase — assim um erro do lado do
  // Supabase (ou alguém batendo a action em paralelo) não permite passar do
  // limite só porque o envio em si falhou depois de contado.
  const admin = createAdminClient();
  const { error: counterError } = await admin
    .from("leads")
    .update({
      otp_email_send_count: currentCount + 1,
      otp_email_last_sent_at: new Date(now).toISOString(),
    })
    .eq("id", lead.id);

  if (counterError) {
    console.error("[startEmailOtp] falha ao atualizar contador de envio:", counterError.message);
  }

  const supabase = createPublicClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { error: GENERIC_COOLDOWN_ERROR };
    }
    console.error("[startEmailOtp] falha ao enviar OTP:", error.message);
    return { error: GENERIC_SEND_ERROR };
  }

  return { success: true };
}

export type ConfirmEmailOtpResult = { success: true } | { error: string };

export async function confirmEmailOtp(
  email: string,
  code: string,
  sessionId: string,
): Promise<ConfirmEmailOtpResult> {
  const trimmedCode = code.trim();
  if (!/^\d{6}$/.test(trimmedCode)) {
    return { error: "Digite o código de 6 dígitos que enviamos." };
  }
  if (!email || !sessionId) {
    return { error: "Código inválido ou expirado. Confira e tente de novo." };
  }

  const lead = await findLeadForOtp(email, sessionId);
  if (!lead) {
    return { error: "Código inválido ou expirado. Confira e tente de novo." };
  }

  await logAbuseSignal("verify", email);

  const supabase = createPublicClient();

  // O Supabase Auth já limita tentativas e expira o código sozinho —
  // qualquer código errado ou vencido cai aqui como erro genérico, sem
  // vazar qual dos dois motivos foi (evita dar pista útil pra tentativa
  // de força bruta).
  const { data, error } = await supabase.auth.verifyOtp({ email, token: trimmedCode, type: "email" });

  if (error) {
    return { error: "Código inválido ou expirado. Confira e tente de novo." };
  }

  // auth_user_id vem só daqui — do retorno do próprio verifyOtp já
  // confirmado pelo Supabase. Nunca aceito esse valor vindo do cliente.
  const authUserId = data.user?.id ?? null;

  const admin = createAdminClient();

  if (lead.auth_user_id && authUserId && lead.auth_user_id !== authUserId) {
    // Não deveria acontecer (o mesmo e-mail normalmente aponta pro mesmo
    // auth.users), mas se acontecer não sobrescrevo silenciosamente: registro
    // pra investigar e só gravo email_verified_at, que já é verdade — o
    // e-mail foi de fato confirmado agora, independente do vínculo antigo.
    console.error(
      `[confirmEmailOtp] auth_user_id inconsistente para lead ${lead.id}: já tinha ${lead.auth_user_id}, verifyOtp devolveu ${authUserId}`,
    );
    const { error: updateError } = await admin
      .from("leads")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("id", lead.id);
    if (updateError) {
      console.error("[confirmEmailOtp] falha ao marcar email_verified_at:", updateError.message);
    }
    return { success: true };
  }

  const { error: updateError } = await admin
    .from("leads")
    .update({
      email_verified_at: new Date().toISOString(),
      auth_user_id: lead.auth_user_id ?? authUserId,
    })
    .eq("id", lead.id);

  if (updateError) {
    console.error("[confirmEmailOtp] falha ao marcar email_verified_at:", updateError.message);
  }

  return { success: true };
}

export interface LeadVerificationStatus {
  found: boolean;
  whatsappVerified: boolean;
  emailVerified: boolean;
}

const NOT_FOUND_STATUS: LeadVerificationStatus = {
  found: false,
  whatsappVerified: false,
  emailVerified: false,
};

/**
 * Recuperação de progresso — se a cliente fechar a página no meio da
 * verificação, ela não deve ser obrigada a recomeçar do zero. Só devolve
 * booleanos (nunca o registro completo do lead), e só quando quem pergunta
 * já sabe o e-mail E o session_id que geraram aquele cadastro (o mesmo
 * usado no rate limit de `submitOfferLead`) — reduz o risco de virar um
 * oráculo de enumeração de e-mails cadastrados.
 */
export async function getLeadVerificationStatus(
  email: string,
  sessionId: string,
): Promise<LeadVerificationStatus> {
  if (!email || !sessionId) return NOT_FOUND_STATUS;

  const admin = createAdminClient();
  const { data } = await admin
    .from("leads")
    .select("whatsapp_verified_at, email_verified_at")
    .eq("email", email)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!data) return NOT_FOUND_STATUS;

  return {
    found: true,
    whatsappVerified: data.whatsapp_verified_at !== null,
    emailVerified: data.email_verified_at !== null,
  };
}
