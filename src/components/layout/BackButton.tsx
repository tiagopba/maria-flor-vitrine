"use client";

import { useRouter } from "next/navigation";
import { hasInternalHistory } from "@/components/layout/NavigationTracker";

/**
 * "← Voltar" usando o histórico real do navegador quando dá (volta pra
 * exata posição/scroll da listagem anterior, sem recarregar) — cai no
 * fallback só quando não há de fato uma navegação anterior dentro do site
 * nesta aba (entrada direta pelo link, por exemplo do Instagram/WhatsApp).
 */
export function BackButton({ fallbackHref, className }: { fallbackHref: string; className?: string }) {
  const router = useRouter();

  function handleClick() {
    if (hasInternalHistory()) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        "flex items-center gap-1 text-sm font-medium text-text-muted hover:text-text " + (className ?? "")
      }
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Voltar
    </button>
  );
}
