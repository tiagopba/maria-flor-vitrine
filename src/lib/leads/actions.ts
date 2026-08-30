"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPrivacyPolicyVersion } from "@/lib/site-settings/institutional";
import { offerLeadSchema } from "@/lib/validation/lead";
import { recordInstitutionalEvent } from "@/lib/institutional/analytics";
import type { Database } from "@/types/database";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export interface SubmitOfferLeadInput {
  name: string;
  whatsapp: string;
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
  whatsapp?: string;
  email?: string;
  marketingConsent?: string;
  form?: string;
}

export type SubmitOfferLeadResult = { success: true } | { errors: OfferLeadFieldErrors };

const RATE_LIMIT_WINDOW_MS = 60_000;
const CONSENT_SOURCE = "grupo_ofertas";

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
    whatsapp: input.whatsapp,
    email: input.email,
    marketingConsent: input.marketingConsent,
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      errors: {
        name: fieldErrors.name?.[0],
        whatsapp: fieldErrors.whatsapp?.[0],
        email: fieldErrors.email?.[0],
        marketingConsent: fieldErrors.marketingConsent?.[0],
      },
    };
  }

  const { name, whatsapp, email, whatsappNormalized } = parsed.data;
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

  // Deduplicação: mesmo WhatsApp OU e-mail já cadastrado -> atualiza esse
  // registro (histórico preservado, consentimento/UTMs atualizados) em vez
  // de criar uma linha nova. Duas consultas indexadas simples em vez de um
  // filtro OR com string interpolada (evita qualquer risco de injeção no
  // filtro do PostgREST).
  const [byWhatsapp, byEmail] = await Promise.all([
    supabase.from("leads").select("id").eq("whatsapp_normalized", whatsappNormalized).limit(1).maybeSingle(),
    supabase.from("leads").select("id").eq("email", email).limit(1).maybeSingle(),
  ]);
  const existingId = byWhatsapp.data?.id ?? byEmail.data?.id ?? null;

  const privacyPolicyVersion = await getPrivacyPolicyVersion();
  const nowIso = new Date().toISOString();

  const payload: LeadInsert = {
    name,
    whatsapp,
    whatsapp_normalized: whatsappNormalized,
    email,
    marketing_consent: true,
    whatsapp_consent: true,
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
  };

  const { error: writeError } = existingId
    ? await supabase.from("leads").update(payload).eq("id", existingId)
    : await supabase.from("leads").insert(payload);

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

  return { success: true };
}
