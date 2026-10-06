import Link from "next/link";

// Navegação do módulo: Envios (registros aprovados/em andamento) e Pré-faturamento
// (coleta, conferência e bloqueios). Não é CTA: é a troca entre as duas áreas.
const TABS = [
  { key: "envios", label: "Envios", href: "/admin/faturamento-envios" },
  { key: "pre", label: "Pré-faturamento", href: "/admin/faturamento-envios/pre" },
] as const;

export function FulfillmentTabs({ active }: { active: "envios" | "pre" }) {
  return (
    <nav aria-label="Áreas do faturamento" className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 pb-3 text-sm font-medium transition-colors ${
              isActive ? "border-primary text-text" : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
