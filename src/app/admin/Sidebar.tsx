"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import type { UserRole } from "@/types/database";
import { AdminNav } from "./AdminNav";

const STORAGE_KEY = "admin-sidebar-collapsed";

/**
 * Sidebar recolhível (desktop/tablet, >= breakpoint sm — igual ao breakpoint
 * em que o Admin já vira menu lateral fixo hoje; abaixo disso o layout
 * continua empilhado, sem nenhuma mudança). Preferência é só visual, só no
 * navegador (`localStorage["admin-sidebar-collapsed"]`) — nunca banco, nunca
 * migration. Sem preferência salva: expandida (igual sempre foi).
 *
 * `collapsed` só esconde texto/larguras a partir de `sm:` via classes
 * responsivas (nunca incondicional) — então mesmo que o estado seja `true`,
 * abrir no celular mostra a sidebar exatamente como sempre foi.
 */
export function Sidebar({
  admin,
  pendingSizeFitCount,
  logoutAction,
}: {
  admin: { name: string; role: UserRole };
  pendingSizeFitCount: number;
  logoutAction: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Sincroniza com localStorage (só existe no navegador) uma vez, no mount —
    // padrão aceito pra "ler preferência persistida sem SSR"; sem isso o
    // servidor nunca saberia a preferência e sempre renderizaria expandida.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage indisponível (ex.: aba privada) — fica expandida, igual ao padrão.
    }
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Preferência não persiste nessa sessão de navegador — tudo bem, não é dado real.
    }
  }

  return (
    <aside
      className={`relative flex flex-col border-admin-border bg-admin-surface sm:shrink-0 sm:border-r sm:transition-[width] sm:duration-150 ${
        collapsed ? "sm:w-[72px]" : "sm:w-64"
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? "Expandir menu" : "Recolher menu"}
        aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        className="absolute -right-3.5 top-6 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-admin-border bg-white text-admin-text-muted shadow-sm hover:text-admin-text focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary/50 sm:flex"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" strokeWidth={2} /> : <ChevronLeft className="h-4 w-4" strokeWidth={2} />}
      </button>

      <div
        className={`hidden shrink-0 items-center gap-3 border-b border-admin-border px-5 py-5 sm:flex ${collapsed ? "sm:justify-center sm:px-3" : ""}`}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
          <Image
            src="/logo-maria-flor.png"
            alt="Maria Flor"
            width={288}
            height={110}
            className="h-auto w-full object-contain"
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-base leading-tight text-admin-text">Maria Flor</p>
            <p className="truncate text-[11px] uppercase tracking-wide text-admin-text-muted">Moda Feminina</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2 sm:py-3">
        <AdminNav role={admin.role} pendingSizeFitCount={pendingSizeFitCount} collapsed={collapsed} />
      </div>

      <div className={`hidden shrink-0 border-t border-admin-border px-4 py-3 sm:block ${collapsed ? "sm:px-2" : ""}`}>
        {!collapsed && <p className="mb-2 truncate text-xs text-admin-text-muted">{admin.name}</p>}
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? "Sair" : undefined}
            className={`flex items-center gap-2 text-sm text-admin-text-muted transition-colors hover:text-admin-text ${
              collapsed ? "sm:justify-center" : ""
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {!collapsed && "Sair"}
          </button>
        </form>
      </div>
    </aside>
  );
}
