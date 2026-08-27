import type { Metadata } from "next";
import { getCurrentAdmin } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Dashboard" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Administradora",
  catalog_editor: "Editora de catálogo",
  seller: "Vendedora",
};

export default async function AdminDashboardPage() {
  const admin = await getCurrentAdmin();

  return (
    <div>
      <h1 className="font-display text-2xl text-text">Olá, {admin?.name}</h1>
      <p className="mt-1 text-sm text-text-muted">
        {admin ? ROLE_LABEL[admin.role] : ""}
      </p>

      <div className="mt-8 rounded-2xl border border-dashed border-border p-6 text-sm text-text-muted">
        O dashboard com visitantes, cliques no WhatsApp, favoritos e ranking
        de Índice de Desejo chega junto com o módulo de analytics. Por
        enquanto, use o menu para cadastrar categorias e produtos assim que
        esses módulos estiverem prontos.
      </div>
    </div>
  );
}
