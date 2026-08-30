"use server";

import { randomBytes, createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrivacyPolicyVersion } from "@/lib/site-settings/institutional";
import { offerLeadSchema } from "@/lib/validation/lead";
import { recordInstitutionalEvent } from "@/lib/institutional/analytics";
import type { Database } from "@/types/database";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export interface SubmitOfferLeadInput {
  name: string;
  email: string;
  marketingConsent: boolean;
  sessionId: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
}

export interface OfferLeadFieldErrors {
  name?: string;
  email?: string;
  marketingConsent?: string;
  form?: string;
}

export type SubmitOfferLeadResult =
  | { success: true; resumeToken: string }
  | { errors: OfferLeadFieldErrors };

const RATE_LIMIT_WINDOW_MS = 60_000;
const CONSENT_SOURCE = "grupo_ofertas";
const RESUME_TOKEN_TTL_MS = 48 * 60 * 60_000; // 48h

/**
 * Token opaco de retomada — o navegador guarda só ele (não e-mail/WhatsApp/
 * nome). 32 bytes aleatórios (256 bits de entropia, bem acima dos 128 bits
 * pedidos) em base64url. Gravamos no banco só o hash SHA-256; o valor em
 * texto puro existe apenas nesta função e na resposta enviada uma vez ao
 * navegador — nunca fica persistido em claro em lugar nenhum.
 */
function generateResumeToken(): { token: string; hash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + RESUME_TOKEN_TTL_MS).toISOString();
  return { token, hash, expiresAt };
}

/**
 * Cadastro no Grupo de Ofertas — reaproveita a tabela `leads` já existente
 * (name, whatsapp, email, marketing_consent, whatsapp_consent,
 * consent_timestamp, consent_source, session_id) em vez de criar uma base
 * paralela. Server Action com client admin (service role) porque `leads`
 * não tem policy de insert pra anon/authenticated — mesmo padrão de toda
 * escrita deste projeto.
 */
export async function submitOfferLead(input: SubmitOfferLeadInput): Promise<SubmitOfferLeadResult> {
  const parsed = offerLeadSchema.safeParse({
    name: input.name,
    email: input.email,
    marketingConsent: input.marketingConsent,
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      errors: {
        name: fieldErrors.name?.[0],
        email: fieldErrors.email?.[0],
        marketingConsent: fieldErrors.marketingConsent?.[0],
      },
    };
  }

  const { name, email } = parsed.data;
  const supabase = createAdminClient();

  // Rate limit simples — sem depender de infraestrutura nova: bloqueia
  // reenvio da MESMA sessão em menos de 1 minuto. Suficiente para conter
  // clique duplo e bot ingênuo sem exigir um serviço de rate limit externo.
  const { data: lastFromSession } = await supabase
    .from("leads")
    .select("created_at")
    .eq("session_id", input.sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastFromSession && Date.now() - new Date(lastFromSession.created_at).getTime() < RATE_LIMIT_WINDOW_MS) {
    return { errors: { form: "Você já enviou seu cadastro há pouco. Aguarde um instante e tente de novo." } };
  }

  // Deduplicação só por e-mail agora (não coletamos mais WhatsApp aqui) ->
  // atualiza o registro existente (histórico preservado, consentimento/UTMs
  // atualizados) em vez de criar uma linha nova.
  const { data: existing } = await supabase.from("leads").select("id").eq("email", email).limit(1).maybeSingle();
  const existingId = existing?.id ?? null;

  const privacyPolicyVersion = await getPrivacyPolicyVersion();
  const nowIso = new Date().toISOString();
  const { token: resumeToken, hash: resumeTokenHash, expiresAt: resumeTokenExpiresAt } = generateResumeToken();

  const sharedFields = {
    name,
    email,
    marketing_consent: true,
    email_marketing_consent: true,
    consent_timestamp: nowIso,
    consent_source: CONSENT_SOURCE,
    privacy_policy_version: privacyPolicyVersion,
    session_id: input.sessionId,
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    utm_content: input.utmContent,
    referrer: input.referrer,
    updated_at: nowIso,
    resume_token_hash: resumeTokenHash,
    resume_token_expires_at: resumeTokenExpiresAt,
  };

  // No update, não toca em whatsapp/whatsapp_normalized/whatsapp_consent —
  // se esse lead já existia com WhatsApp real de outro fluxo (ex: "Quero
  // essa peça"), essa informação continua intacta. No insert (lead novo,
  // só por este formulário), `whatsapp` precisa de algum valor porque a
  // coluna é NOT NULL no banco — '' deixa claro "não coletado aqui" sem
  // inventar um número.
  const { error: writeError } = existingId
    ? await supabase.from("leads").update(sharedFields).eq("id", existingId)
    : await supabase.from("leads").insert({
        ...sharedFields,
        whatsapp: "",
        whatsapp_normalized: null,
        whatsapp_consent: false,
      } satisfies LeadInsert);

  if (writeError) {
    console.error("[submitOfferLead] falha ao gravar lead:", writeError.message);
    return { errors: { form: "Não foi possível concluir seu cadastro agora. Tente novamente." } };
  }

  await recordInstitutionalEvent({
    eventType: "OFFER_LEAD_SUBMITTED",
    sessionId: input.sessionId,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    utmContent: input.utmContent,
    referrer: input.referrer,
    metadata: { updated_existing: existingId !== null },
  });

  return { success: true, resumeToken };
}
