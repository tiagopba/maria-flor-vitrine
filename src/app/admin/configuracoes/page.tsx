import type { Metadata } from "next";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { requireAdmin } from "@/lib/auth/permissions";
import { getInstitutionalInfo } from "@/lib/site-settings/institutional";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import { updatePaymentSettingsAction, updateSiteSettingsAction } from "./actions";
import { PaymentSettingsForm } from "./PaymentSettingsForm";
import { SiteSettingsForm } from "./SiteSettingsForm";

export const metadata: Metadata = { title: "Configurações do Site" };

export default async function ConfiguracoesPage() {
  // Só ADMIN acessa a tela — catalog_editor é redirecionada, mesmo padrão
  // de allowedRoles já usado nas outras telas do painel.
  await requireAdmin(["admin", "master"]);

  const [info, paymentSettings] = await Promise.all([getInstitutionalInfo(), getPaymentSettings()]);

  return (
    <div className="max-w-2xl">
      <SuccessToast />
      <h1 className="mb-1 font-display text-2xl text-text">Configurações do Site</h1>
      <p className="mb-6 text-sm text-text-muted">
        Dados que aparecem nas páginas públicas — Quem Somos, Grupo de Ofertas, Como Chegar e o
        rodapé. Nenhum código precisa mudar quando você atualiza algo aqui.
      </p>

      <div className="mb-6">
        <PaymentSettingsForm action={updatePaymentSettingsAction} defaultValues={paymentSettings} />
      </div>

      <SiteSettingsForm action={updateSiteSettingsAction} defaultValues={info} />
    </div>
  );
}
