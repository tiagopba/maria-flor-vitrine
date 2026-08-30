"use server";

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
 */
export type StartEmailOtpResult = { success: true } | { error: string };

export async function startEmailOtp(email: string): Promise<StartEmailOtpResult> {
  const supabase = createPublicClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { error: "Aguarde um instante antes de pedir um novo código." };
    }
    console.error("[startEmailOtp] falha ao enviar OTP:", error.message);
    return { error: "Não foi possível enviar o código agora. Tente novamente." };
  }

  return { success: true };
}

export type ConfirmEmailOtpResult = { success: true } | { error: string };

export async function confirmEmailOtp(email: string, code: string): Promise<ConfirmEmailOtpResult> {
  const trimmedCode = code.trim();
  if (!/^\d{6}$/.test(trimmedCode)) {
    return { error: "Digite o código de 6 dígitos que enviamos." };
  }

  const supabase = createPublicClient();

  // O Supabase Auth já limita tentativas e expira o código sozinho —
  // qualquer código errado ou vencido cai aqui como erro genérico, sem
  // vazar qual dos dois motivos foi (evita dar pista útil pra tentativa
  // de força bruta).
  const { error } = await supabase.auth.verifyOtp({ email, token: trimmedCode, type: "email" });

  if (error) {
    return { error: "Código inválido ou expirado. Confira e tente de novo." };
  }

  // A confirmação em si já aconteceu (o Supabase validou o código) —
  // gravar isso no lead é registro, não é o que decide se a cliente foi
  // verificada. Uma falha aqui não deveria acontecer, mas se acontecer,
  // não inventa um "sucesso parcial" pra cliente: loga pra investigar,
  // mas o e-mail já está de fato confirmado do lado do Supabase Auth.
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("leads")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("email", email);

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
