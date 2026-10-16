import { Menu } from "lucide-react";
import { getCurrentAdmin } from "@/lib/auth/permissions";
import { countPendingSizeFitProductsLight } from "@/lib/db/product-size-fit";
import { logout } from "./login/actions";
import { Sidebar } from "./Sidebar";

/**
 * Sidebar clara + shell claro pro conteúdo — redesign visual (ver
 * docs/stable-modules.md: isto é chrome compartilhado do admin, não lógica
 * de nenhum módulo específico). Mesmo mecanismo de antes (Server Component,
 * `getCurrentAdmin` decide o que renderiza, logout via Server Action) — só
 * a pintura muda.
 *
 * O logo real (`logo-maria-flor.png`) tem traço escuro — ilegível direto
 * num fundo escuro — por isso fica numa placa branca arredondada em vez de
 * solto na sidebar.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return children;
  }

  const pendingSizeFitCount = await countPendingSizeFitProductsLight();

  return (
    <div className="admin-scope flex min-h-screen flex-col bg-admin-bg sm:flex-row">
      <header className="flex items-center justify-between border-b border-admin-border bg-admin-surface px-4 py-3 sm:hidden">
        <div className="flex items-center gap-2">
          <Menu className="h-5 w-5 text-admin-text-muted" strokeWidth={1.75} />
          <span className="font-display text-lg text-admin-text">Maria Flor</span>
        </div>
        <form action={logout}>
          <button type="submit" className="text-sm text-admin-text-muted hover:text-admin-text">
            Sair
          </button>
        </form>
      </header>

      <Sidebar admin={{ name: admin.name, role: admin.role }} pendingSizeFitCount={pendingSizeFitCount} logoutAction={logout} />

      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
