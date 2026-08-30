import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dados institucionais (razão social, CNPJ, endereço, links de Maps/Waze/
 * grupo de ofertas, foto da fachada...) — reaproveita `site_settings`
 * (key/value já existente), numa única chave `INSTITUTIONAL_INFO` no
 * mesmo espírito de `DESIRE_SCORE_WEIGHTS`. Lido só no servidor via client
 * admin (mesmo padrão de `sellers`) — `site_settings` não tem policy de
 * leitura pública, então não precisa de RLS nova pra isso.
 *
 * Qualquer campo pode vir `null` (endereço/telefone/Maps/Waze/grupo/foto
 * ainda não configurados) — quem usa isso decide o estado visual
 * elegante, nunca um link/botão quebrado.
 */
export interface InstitutionalInfo {
  legalName: string | null;
  cnpj: string | null;
  tradeName: string;
  tagline: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagramUrl: string | null;
  googleMapsUrl: string | null;
  wazeUrl: string | null;
  offersGroupUrl: string | null;
  facadePhotoUrl: string | null;
  hours: string | null;
}

const DEFAULTS: InstitutionalInfo = {
  legalName: null,
  cnpj: null,
  tradeName: "Maria Flor",
  tagline: null,
  city: null,
  state: null,
  address: null,
  phone: null,
  whatsapp: null,
  instagramUrl: null,
  googleMapsUrl: null,
  wazeUrl: null,
  offersGroupUrl: null,
  facadePhotoUrl: null,
  hours: null,
};

function readString(value: Record<string, unknown>, key: string): string | null {
  const raw = value[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function getInstitutionalInfo(): Promise<InstitutionalInfo> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "INSTITUTIONAL_INFO")
    .maybeSingle();

  if (error || !data || typeof data.value !== "object" || data.value === null) {
    return DEFAULTS;
  }

  const value = data.value as Record<string, unknown>;

  return {
    legalName: readString(value, "legal_name"),
    cnpj: readString(value, "cnpj"),
    tradeName: readString(value, "trade_name") ?? DEFAULTS.tradeName,
    tagline: readString(value, "tagline"),
    city: readString(value, "city"),
    state: readString(value, "state"),
    address: readString(value, "address"),
    phone: readString(value, "phone"),
    whatsapp: readString(value, "whatsapp"),
    instagramUrl: readString(value, "instagram_url"),
    googleMapsUrl: readString(value, "google_maps_url"),
    wazeUrl: readString(value, "waze_url"),
    offersGroupUrl: readString(value, "offers_group_url"),
    facadePhotoUrl: readString(value, "facade_photo_url"),
    hours: readString(value, "hours"),
  };
}

/** Versão da Política de Privacidade — gravada em cada lead que consente,
 * pra saber qual texto a cliente realmente aceitou mesmo se ele mudar
 * depois. "1.0" é o fallback caso a chave ainda não exista no banco. */
export async function getPrivacyPolicyVersion(): Promise<string> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "PRIVACY_POLICY_VERSION")
    .maybeSingle();

  return typeof data?.value === "string" ? data.value : "1.0";
}
