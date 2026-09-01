import Image from "next/image";
import { LogOut, Menu } from "lucide-react";
import { getCurrentAdmin } from "@/lib/auth/permissions";
import { AdminNav } from "./AdminNav";
import { logout } from "./login/actions";

/**
 * Sidebar escura + shell claro pro conteúdo — redesign visual (ver
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

  return (
    <div className="flex min-h-screen flex-col bg-[#faf6f3] sm:flex-row">
      <header className="flex items-center justify-between border-b border-white/10 bg-[#18141f] px-4 py-3 sm:hidden">
        <div className="flex items-center gap-2">
          <Menu className="h-5 w-5 text-white/70" strokeWidth={1.75} />
          <span className="font-display text-lg text-white">Maria Flor</span>
        </div>
        <form action={logout}>
          <button type="submit" className="text-sm text-white/60 hover:text-white">
            Sair
          </button>
        </form>
      </header>

      <aside className="flex flex-col bg-[#18141f] sm:w-64 sm:shrink-0">
        <div className="hidden shrink-0 items-center gap-3 border-b border-white/10 px-5 py-5 sm:flex">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
            <Image
              src="/logo-maria-flor.png"
              alt="Maria Flor"
              width={288}
              height={110}
              className="h-auto w-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-base leading-tight text-white">Maria Flor</p>
            <p className="truncate text-[11px] uppercase tracking-wide text-white/40">Moda Feminina</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 sm:py-3">
          <AdminNav role={admin.role} />
        </div>

        <div className="hidden shrink-0 border-t border-white/10 px-4 py-3 sm:block">
          <p className="mb-2 truncate text-xs text-white/40">{admin.name}</p>
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
