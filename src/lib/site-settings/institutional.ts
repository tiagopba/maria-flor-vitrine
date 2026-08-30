import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
export interface SocialLink {
  label: string;
  url: string;
}

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
  socialLinks: SocialLink[];
  googleMapsUrl: string | null;
  wazeUrl: string | null;
  offersGroupUrl: string | null;
  facadePhotoUrl: string | null;
  hours: string | null;
  // Editáveis pelo painel /admin/configuracoes — sempre com fallback pro
  // texto original quando null, pra nunca deixar a página pública em
  // branco só porque a admin ainda não configurou nada.
  quemSomosTitle: string | null;
  quemSomosSubtitle: string | null;
  quemSomosText: string | null;
  quemSomosCtaLabel: string | null;
  ofertasTitle: string | null;
  ofertasText: string | null;
  ofertasCtaLabel: string | null;
  ofertasEnabled: boolean;
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
  socialLinks: [],
  googleMapsUrl: null,
  wazeUrl: null,
  offersGroupUrl: null,
  facadePhotoUrl: null,
  hours: null,
  quemSomosTitle: null,
  quemSomosSubtitle: null,
  quemSomosText: null,
  quemSomosCtaLabel: null,
  ofertasTitle: null,
  ofertasText: null,
  ofertasCtaLabel: null,
  ofertasEnabled: true,
};

function readString(value: Record<string, unknown>, key: string): string | null {
  const raw = value[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function readBoolean(value: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const raw = value[key];
  return typeof raw === "boolean" ? raw : fallback;
}

function readSocialLinks(value: Record<string, unknown>): SocialLink[] {
  const raw = value["social_links"];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      label: typeof item.label === "string" ? item.label : "",
      url: typeof item.url === "string" ? item.url : "",
    }))
    .filter((item) => item.label.length > 0 && item.url.length > 0);
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
    socialLinks: readSocialLinks(value),
    googleMapsUrl: readString(value, "google_maps_url"),
    wazeUrl: readString(value, "waze_url"),
    offersGroupUrl: readString(value, "offers_group_url"),
    facadePhotoUrl: readString(value, "facade_photo_url"),
    hours: readString(value, "hours"),
    quemSomosTitle: readString(value, "quem_somos_title"),
    quemSomosSubtitle: readString(value, "quem_somos_subtitle"),
    quemSomosText: readString(value, "quem_somos_text"),
    quemSomosCtaLabel: readString(value, "quem_somos_cta_label"),
    ofertasTitle: readString(value, "ofertas_title"),
    ofertasText: readString(value, "ofertas_text"),
    ofertasCtaLabel: readString(value, "ofertas_cta_label"),
    ofertasEnabled: readBoolean(value, "ofertas_enabled", true),
  };
}

/**
 * Grava o objeto INSTITUTIONAL_INFO inteiro de uma vez (o painel de
 * Configurações do Site manda o formulário completo, não patches parciais
 * — evita merge/race entre edições). Usa o client de sessão (cookies), não
 * o admin — a policy `site_settings_admin_all` exige `is_admin()`, então a
 * própria RLS do banco já barra `catalog_editor` aqui, em cima do
 * `requireAdmin(["admin"])` da Server Action. Nunca chamar isso com dados
 * vindos direto do cliente sem passar pelo schema de validação antes.
 */
export async function updateInstitutionalInfo(info: InstitutionalInfo): Promise<void> {
  const supabase = await createClient();

  const value = {
    legal_name: info.legalName,
    cnpj: info.cnpj,
    trade_name: info.tradeName,
    tagline: info.tagline,
    city: info.city,
    state: info.state,
    address: info.address,
    phone: info.phone,
    whatsapp: info.whatsapp,
    instagram_url: info.instagramUrl,
    social_links: info.socialLinks,
    google_maps_url: info.googleMapsUrl,
    waze_url: info.wazeUrl,
    offers_group_url: info.offersGroupUrl,
    facade_photo_url: info.facadePhotoUrl,
    hours: info.hours,
    quem_somos_title: info.quemSomosTitle,
    quem_somos_subtitle: info.quemSomosSubtitle,
    quem_somos_text: info.quemSomosText,
    quem_somos_cta_label: info.quemSomosCtaLabel,
    ofertas_title: info.ofertasTitle,
    ofertas_text: info.ofertasText,
    ofertas_cta_label: info.ofertasCtaLabel,
    ofertas_enabled: info.ofertasEnabled,
  };

  const { error } = await supabase.from("site_settings").upsert({ key: "INSTITUTIONAL_INFO", value });

  if (error) {
    throw new Error(`Não foi possível salvar as configurações: ${error.message}`);
  }
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
