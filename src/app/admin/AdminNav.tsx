"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Sparkles,
  Layers,
  FolderTree,
  Palette,
  Ruler,
  ListChecks,
  Users,
  UserRound,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  available: boolean;
  adminOnly?: boolean;
  /** Só o item "Revisar numerações" usa isto — o contador some quando chega a 0, mas o item continua acessível. */
  showsPendingSizeFitBadge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, available: true },
  { label: "Produtos", href: "/admin/produtos", icon: ShoppingBag, available: true },
  {
    label: "Revisar numerações",
    href: "/admin/produtos/revisar-numeracoes",
    icon: ListChecks,
    available: true,
    showsPendingSizeFitBadge: true,
  },
  { label: "Provadores", href: "/admin/provadores", icon: Sparkles, available: false },
  { label: "Coleções", href: "/admin/colecoes", icon: Layers, available: false },
  { label: "Categorias", href: "/admin/categorias", icon: FolderTree, available: true },
  { label: "Cores", href: "/admin/cores", icon: Palette, available: true },
  { label: "Tamanhos", href: "/admin/tamanhos", icon: Ruler, available: true },
  { label: "Clientes/Leads", href: "/admin/leads", icon: Users, available: false },
  { label: "Vendedoras", href: "/admin/vendedoras", icon: UserRound, available: true },
  { label: "Relatórios", href: "/admin/relatorios", icon: BarChart3, available: false },
  { label: "Configurações", href: "/admin/configuracoes", icon: Settings, available: true, adminOnly: true },
];

/**
 * Sidebar escura (redesign visual do Dashboard, ver docs/stable-modules.md —
 * isto é só o shell/chrome do admin, nunca a lógica das páginas que ele
 * envolve). Mesma estrutura/mecanismo de navegação de antes (Link normal,
 * sem estado novo); só a pintura muda.
 */
export function AdminNav({ role, pendingSizeFitCount }: { role: UserRole; pendingSizeFitCount: number }) {
  const pathname = usePathname();

  // Rota mais específica que casa com o pathname atual vence — evita que
  // "Produtos" e "Revisar numerações" (que vive sob /admin/produtos/...)
  // fiquem os dois marcados como ativos ao mesmo tempo.
  const matchingHrefs = NAV_ITEMS.filter((item) =>
    item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href)
  ).map((item) => item.href);
  const activeHref = matchingHrefs.reduce<string | null>(
    (longest, href) => (longest === null || href.length > longest.length ? href : longest),
    null
  );

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 py-2 sm:flex-col sm:gap-1 sm:overflow-visible sm:px-3 sm:py-2">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === activeHref;
        const locked = item.adminOnly && role !== "admin" && role !== "master";
        const Icon = item.icon;
        const label =
          item.showsPendingSizeFitBadge && pendingSizeFitCount > 0
            ? `${item.label} (${pendingSizeFitCount})`
            : item.label;

        if (!item.available || locked) {
          return (
            <span
              key={item.href}
              title={locked ? "Só administradoras" : "Em breve"}
              className="flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm text-white/25 sm:whitespace-normal"
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              {label}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-colors sm:whitespace-normal",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-white/65 hover:bg-white/[0.06] hover:text-white"
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
