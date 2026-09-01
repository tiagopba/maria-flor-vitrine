"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordInstitutionalEvent } from "@/lib/institutional/analytics";
import { EMAIL_OTP_LENGTH } from "./otp-constants";

/**
 * Confirmação real de propriedade do e-mail — usa o próprio OTP de e-mail
 * do Supabase Auth (código numérico — ver EMAIL_OTP_LENGTH — expira sozinho, já
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
 * Toda operação aqui identifica o lead só pelo TOKEN opaco de retomada
 * (ver `generateResumeToken` em lib/leads/actions.ts) — nunca por e-mail
 * vindo do cliente. O navegador não precisa saber nem guardar o e-mail; o
 * servidor resolve o lead a partir do hash do token e usa o e-mail que já
 * tem gravado. Isso fecha, de graça, "disparar OTP pra e-mail alheio":
 * seria preciso possuir um token de 256 bits que nunca foi exposto.
 */

const OTP_RESEND_COOLDOWN_SECONDS = 30;
const OTP_SEND_WINDOW_SECONDS = 60 * 60; // 1h
const OTP_SEND_MAX_PER_WINDOW = 5;

const GENERIC_SEND_ERROR = "Não foi possível enviar o código agora. Tente novamente.";
const GENERIC_COOLDOWN_ERROR = "Aguarde um instante antes de pedir um novo código.";
const GENERIC_INVALID_TOKEN_ERROR = "Sua sessão de cadastro expirou. Preencha o formulário novamente.";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function logAbuseSignal(action: "send" | "verify", leadId: string) {
  // Sinal auxiliar só pra investigação manual em caso de abuso — nunca usado
  // pra bloquear ou identificar "quem é a cliente" (isso é feito pelo
  // token, não por IP, que é falível: NAT, rede móvel, VPN).
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
    console.log(`[email-otp] ${action} lead=${leadId} ip=${ip}`);
  } catch {
    // headers() pode falhar fora de um request real (ex: script de teste) — não é crítico.
  }
}

type LeadOtpRow = {
  id: string;
  email: string | null;
  auth_user_id: string | null;
  whatsapp_verified_at: string | null;
  email_verified_at: string | null;
  session_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  referrer: string | null;
};

async function resolveLead(token: string): Promise<LeadOtpRow | null> {
  if (!token) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("leads")
    .select(
      "id, email, auth_user_id, whatsapp_verified_at, email_verified_at, session_id, utm_source, utm_medium, utm_campaign, utm_content, referrer"
    )
    .eq("resume_token_hash", hashToken(token))
    .gt("resume_token_expires_at", new Date().toISOString())
    .maybeSingle();

  return data;
}

/** OFFER_LEAD_CONFIRMED reaproveita o session_id/UTMs já gravados no lead
 * desde o envio do formulário (submitOfferLead) — o fluxo de OTP nunca
 * recebe esses dados do navegador de novo, então usar o que já está salvo
 * evita ter que fazer confirmEmailOtp aceitar parâmetros novos só pra isso. */
function recordOfferLeadConfirmed(lead: LeadOtpRow): void {
  recordInstitutionalEvent({
    eventType: "OFFER_LEAD_CONFIRMED",
    sessionId: lead.session_id ?? "unknown",
    utmSource: lead.utm_source,
    utmMedium: lead.utm_medium,
    utmCampaign: lead.utm_campaign,
    utmContent: lead.utm_content,
    referrer: lead.referrer,
  }).catch(() => {});
}

export type StartEmailOtpResult = { success: true; email: string } | { error: string };

export async function startEmailOtp(token: string): Promise<StartEmailOtpResult> {
  const lead = await resolveLead(token);
  if (!lead || !lead.email) return { error: GENERIC_INVALID_TOKEN_ERROR };

  const admin = createAdminClient();

  // Checagem + incremento atômicos numa única instrução UPDATE no banco
  // (função try_claim_email_otp_send) — evita a race condition de "ler
  // contador em JS, decidir, gravar depois", onde duas requisições
  // concorrentes poderiam ambas passar pelo limite antes de qualquer
  // uma delas gravar. A linha do lead fica travada durante o UPDATE, então
  // a segunda chamada só é avaliada depois que a primeira já commitou.
  const { data: claimed, error: claimError } = await admin.rpc("try_claim_email_otp_send", {
    p_lead_id: lead.id,
    p_cooldown_seconds: OTP_RESEND_COOLDOWN_SECONDS,
    p_window_seconds: OTP_SEND_WINDOW_SECONDS,
    p_max_per_window: OTP_SEND_MAX_PER_WINDOW,
  });

  if (claimError) {
    console.error("[startEmailOtp] falha ao checar rate limit:", claimError.message);
    return { error: GENERIC_SEND_ERROR };
  }

  if (!claimed) {
    // Não é crítico pra segurança (a decisão já foi tomada de forma atômica
    // acima) — só uma leitura extra pra escolher a mensagem mais adequada.
    const { data: current } = await admin
      .from("leads")
      .select("otp_email_last_sent_at")
      .eq("id", lead.id)
      .maybeSingle();

    const lastSentAt = current?.otp_email_last_sent_at ? new Date(current.otp_email_last_sent_at).getTime() : null;
    const withinCooldown = lastSentAt !== null && Date.now() - lastSentAt < OTP_RESEND_COOLDOWN_SECONDS * 1000;

    return {
      error: withinCooldown
        ? GENERIC_COOLDOWN_ERROR
        : "Você atingiu o limite de códigos por hora. Tente novamente mais tarde.",
    };
  }

  await logAbuseSignal("send", lead.id);

  const supabase = createPublicClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: lead.email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { error: GENERIC_COOLDOWN_ERROR };
    }
    console.error("[startEmailOtp] falha ao enviar OTP:", error.message);
    return { error: GENERIC_SEND_ERROR };
  }

  return { success: true, email: lead.email };
}

export type ConfirmEmailOtpResult = { success: true } | { error: string };

export async function confirmEmailOtp(token: string, code: string): Promise<ConfirmEmailOtpResult> {
  const trimmedCode = code.trim();
  if (!new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`).test(trimmedCode)) {
    return { error: `Digite o código de ${EMAIL_OTP_LENGTH} dígitos que enviamos.` };
  }

  const lead = await resolveLead(token);
  if (!lead || !lead.email) return { error: GENERIC_INVALID_TOKEN_ERROR };

  await logAbuseSignal("verify", lead.id);

  const supabase = createPublicClient();

  // O Supabase Auth já limita tentativas e expira o código sozinho —
  // qualquer código errado ou vencido cai aqui como erro genérico, sem
  // vazar qual dos dois motivos foi (evita dar pista útil pra tentativa
  // de força bruta).
  const { data, error } = await supabase.auth.verifyOtp({ email: lead.email, token: trimmedCode, type: "email" });

  if (error) {
    console.error(`[confirmEmailOtp] verifyOtp falhou: code=${error.code} status=${error.status} msg=${error.message}`);
    return { error: "Código inválido ou expirado. Confira e tente de novo." };
  }

  // auth_user_id vem só daqui — do retorno do próprio verifyOtp já
  // confirmado pelo Supabase. Nunca aceito esse valor vindo do cliente.
  const authUserId = data.user?.id ?? null;

  const admin = createAdminClient();

  if (lead.auth_user_id && authUserId && lead.auth_user_id !== authUserId) {
    // Não deveria acontecer (o mesmo e-mail normalmente aponta pro mesmo
    // auth.users), mas se acontecer não sobrescrevo silenciosamente: fica
    // registrado em auth_user_id_conflict_at pra qualquer conversão futura
    // desse lead em conta de cliente exigir investigação manual antes. A
    // posse do e-mail foi comprovada agora mesmo, então email_verified_at
    // é gravado normalmente — só o vínculo de conta que fica em aberto.
    console.error(
      `[confirmEmailOtp] auth_user_id inconsistente para lead ${lead.id}: já tinha ${lead.auth_user_id}, verifyOtp devolveu ${authUserId}`,
    );
    const { error: updateError } = await admin
      .from("leads")
      .update({
        email_verified_at: new Date().toISOString(),
        auth_user_id_conflict_at: new Date().toISOString(),
        resume_token_hash: null,
        resume_token_expires_at: null,
      })
      .eq("id", lead.id);
    if (updateError) {
      console.error("[confirmEmailOtp] falha ao marcar email_verified_at:", updateError.message);
    }
    if (!lead.email_verified_at) recordOfferLeadConfirmed(lead);
    return { success: true };
  }

  // Job do token está feito (e-mail confirmado) — invalida pra não sobrar
  // um capability token ativo além do necessário.
  const { error: updateError } = await admin
    .from("leads")
    .update({
      email_verified_at: new Date().toISOString(),
      auth_user_id: lead.auth_user_id ?? authUserId,
      resume_token_hash: null,
      resume_token_expires_at: null,
    })
    .eq("id", lead.id);

  if (updateError) {
    console.error("[confirmEmailOtp] falha ao marcar email_verified_at:", updateError.message);
  }

  if (!lead.email_verified_at) recordOfferLeadConfirmed(lead);

  return { success: true };
}

export interface LeadVerificationStatus {
  found: boolean;
  whatsappVerified: boolean;
  emailVerified: boolean;
  email: string | null;
}

const NOT_FOUND_STATUS: LeadVerificationStatus = {
  found: false,
  whatsappVerified: false,
  emailVerified: false,
  email: null,
};

/**
 * Recuperação de progresso via token opaco — se a cliente fechar a página
 * no meio da verificação, ela não deve ser obrigada a recomeçar do zero.
 * O navegador manda só o token que guardou; o servidor resolve o lead pelo
 * hash e devolve o estado necessário pra continuar a UI (inclusive o
 * e-mail, só pra exibir "enviamos pra fulana@..." — o navegador nunca
 * persiste esse e-mail, só mantém em memória enquanto a aba estiver
 * aberta).
 */
export async function resumeLeadByToken(token: string): Promise<LeadVerificationStatus> {
  const lead = await resolveLead(token);
  if (!lead) return NOT_FOUND_STATUS;

  return {
    found: true,
    whatsappVerified: lead.whatsapp_verified_at !== null,
    emailVerified: lead.email_verified_at !== null,
    email: lead.email,
  };
}
