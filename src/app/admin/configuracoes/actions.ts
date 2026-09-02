"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import { getInstitutionalInfo, updateInstitutionalInfo } from "@/lib/site-settings/institutional";
import { updatePaymentSettings } from "@/lib/site-settings/payments";
import { paymentSettingsSchema } from "@/lib/validation/payment-settings";
import { siteSettingsSchema } from "@/lib/validation/site-settings";

export interface SiteSettingsFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseSocialLinks(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function updateSiteSettingsAction(
  _prevState: SiteSettingsFormState,
  formData: FormData,
): Promise<SiteSettingsFormState> {
  // Só ADMIN — não ["admin", "catalog_editor"] como o resto do painel.
  // Configurações institucionais (endereço, textos públicos, WhatsApp da
  // loja) ficam de fora do escopo de catalog_editor de propósito.
  await requireAdmin(["admin", "master"]);

  const parsed = siteSettingsSchema.safeParse({
    city: formData.get("city"),
    state: formData.get("state"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp"),
    instagramUrl: formData.get("instagramUrl"),
    socialLinks: parseSocialLinks(formData.get("socialLinks")),
    googleMapsUrl: formData.get("googleMapsUrl"),
    wazeUrl: formData.get("wazeUrl"),
    offersGroupUrl: formData.get("offersGroupUrl"),
    facadePhotoUrl: formData.get("facadePhotoUrl"),
    hours: formData.get("hours"),
    quemSomosTitle: formData.get("quemSomosTitle"),
    quemSomosSubtitle: formData.get("quemSomosSubtitle"),
    quemSomosText: formData.get("quemSomosText"),
    quemSomosCtaLabel: formData.get("quemSomosCtaLabel"),
    ofertasTitle: formData.get("ofertasTitle"),
    ofertasText: formData.get("ofertasText"),
    ofertasCtaLabel: formData.get("ofertasCtaLabel"),
    ofertasEnabled: formData.get("ofertasEnabled") === "on",
    publicContactEmail: formData.get("publicContactEmail"),
    privacyContactEmail: formData.get("privacyContactEmail"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""]),
      ),
    };
  }

  // legalName/cnpj/tradeName/tagline não fazem parte deste formulário (fora
  // do escopo pedido) — preserva o valor atual pra não apagar dado que não
  // estava no form.
  const current = await getInstitutionalInfo();

  try {
    await updateInstitutionalInfo({
      ...current,
      ...parsed.data,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível salvar as configurações." };
  }

  revalidatePath("/admin/configuracoes");
  revalidatePath("/");
  revalidatePath("/quem-somos");
  revalidatePath("/ofertas");
  revalidatePath("/como-chegar");
  revalidatePath("/politica-de-privacidade");

  redirect(`/admin/configuracoes?sucesso=${encodeURIComponent("Configurações salvas com sucesso.")}`);
}

export interface PaymentSettingsFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function updatePaymentSettingsAction(
  _prevState: PaymentSettingsFormState,
  formData: FormData,
): Promise<PaymentSettingsFormState> {
  await requireAdmin(["admin", "master"]);

  const parsed = paymentSettingsSchema.safeParse({
    defaultMaxInstallments: formData.get("defaultMaxInstallments"),
    minInstallmentValue: formData.get("minInstallmentValue"),
    cashPriceEnabled: formData.get("cashPriceEnabled") === "on",
    installmentsEnabled: formData.get("installmentsEnabled") === "on",
  });

  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""]),
      ),
    };
  }

  try {
    await updatePaymentSettings(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível salvar as configurações de pagamento." };
  }

  // Afeta o preço exibido em todo lugar do catálogo — mesmas páginas que
  // admin/produtos/actions.ts já revalida numa edição de produto, mas aqui
  // de forma global (não dá pra saber qual produto mudou, porque nenhum
  // mudou: é a regra de pagamento que mudou pra todos eles de uma vez).
  revalidatePath("/admin/configuracoes");
  revalidatePath("/");
  revalidatePath("/novidades");
  revalidatePath("/busca");
  revalidatePath("/favoritos");
  revalidatePath("/categoria/[slug]", "page");
  revalidatePath("/produto/[slug]", "page");

  redirect(
    `/admin/configuracoes?sucesso=${encodeURIComponent("Configurações de pagamento salvas com sucesso.")}`,
  );
}
