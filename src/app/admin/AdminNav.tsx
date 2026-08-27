"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  available: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", available: true },
  { label: "Produtos", href: "/admin/produtos", available: false },
  { label: "Provadores", href: "/admin/provadores", available: false },
  { label: "Coleções", href: "/admin/colecoes", available: false },
  { label: "Categorias", href: "/admin/categorias", available: false },
  { label: "Clientes/Leads", href: "/admin/leads", available: false },
  { label: "Vendedoras", href: "/admin/vendedoras", available: false },
  { label: "Relatórios", href: "/admin/relatorios", available: false },
  { label: "Configurações", href: "/admin/configuracoes", available: false },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto px-4 py-2 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:px-2 sm:py-4">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;

        if (!item.available) {
          return (
            <span
              key={item.href}
              title="Em breve"
              className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-text-muted/50 sm:whitespace-normal"
            >
              {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-muted hover:text-text sm:whitespace-normal",
              isActive && "bg-primary/10 text-primary"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
