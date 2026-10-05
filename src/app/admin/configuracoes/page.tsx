import type { Metadata } from "next";
import Link from "next/link";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { requireAdmin } from "@/lib/auth/permissions";
import { listFreeShippingRulesAdmin } from "@/lib/db/shipping";
import { getInstitutionalInfo } from "@/lib/site-settings/institutional";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import { updatePaymentSettingsAction, updateSiteSettingsAction } from "./actions";
import { FreeShippingRulesForm } from "./FreeShippingRulesForm";
import { PaymentSettingsForm } from "./PaymentSettingsForm";
import { SiteSettingsForm } from "./SiteSettingsForm";

export const metadata: Metadata = { title: "Configurações do Site" };

export default async function ConfiguracoesPage() {
  // Só ADMIN acessa a tela — catalog_editor é redirecionada, mesmo padrão
  // de allowedRoles já usado nas outras telas do painel.
  await requireAdmin(["admin", "master"]);

  const [info, paymentSettings, freeShippingRules] = await Promise.all([
    getInstitutionalInfo(),
    getPaymentSettings(),
    listFreeShippingRulesAdmin(),
  ]);

  return (
    <div className="max-w-2xl">
      <SuccessToast />
      <h1 className="mb-1 font-display text-2xl text-text">Configurações do Site</h1>
      <p className="mb-6 text-sm text-text-muted">
        Dados que aparecem nas páginas públicas — Quem Somos, Grupo de Ofertas, Como Chegar e o
        rodapé. Nenhum código precisa mudar quando você atualiza algo aqui.
      </p>

      <Link
        href="/admin/vendedoras"
        className="mb-6 flex items-center justify-between rounded-2xl border border-border bg-surface p-4 hover:bg-muted"
      >
        <span>
          <span className="block text-sm font-semibold text-text">Vendedoras</span>
          <span className="block text-xs text-text-muted">
            Cadastrar, corrigir nome, desativar e reativar (o histórico é preservado).
          </span>
        </span>
        <span className="text-sm font-medium text-primary">Gerenciar →</span>
      </Link>

      <div className="mb-6">
        <PaymentSettingsForm action={updatePaymentSettingsAction} defaultValues={paymentSettings} />
      </div>

      <div className="mb-6">
        <FreeShippingRulesForm initialRules={freeShippingRules} />
      </div>

      <SiteSettingsForm action={updateSiteSettingsAction} defaultValues={info} />
    </div>
  );
}
