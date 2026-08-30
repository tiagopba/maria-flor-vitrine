import { getCurrentAdmin } from "@/lib/auth/permissions";
import { AdminNav } from "./AdminNav";
import { logout } from "./login/actions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await getCurrentAdmin();

  // /admin/login não passa por este layout com admin logada (middleware
  // redireciona antes); se não houver admin aqui, deixa o filho decidir
  // (a própria página de login não usa este layout).
  if (!admin) {
    return children;
  }

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:hidden">
        <span className="font-display text-lg">Maria Flor</span>
        <form action={logout}>
          <button type="submit" className="text-sm text-text-muted">
            Sair
          </button>
        </form>
      </header>

      <aside className="border-b border-border bg-surface sm:w-56 sm:shrink-0 sm:border-b-0 sm:border-r">
        <div className="hidden items-center justify-between px-4 py-4 sm:flex">
          <span className="font-display text-lg">Maria Flor</span>
        </div>
        <AdminNav role={admin.role} />
        <div className="hidden px-4 py-3 sm:block">
          <p className="mb-2 truncate text-xs text-text-muted">{admin.name}</p>
          <form action={logout}>
            <button type="submit" className="text-sm text-text-muted hover:text-text">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
