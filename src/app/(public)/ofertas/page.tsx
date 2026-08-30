import type { Metadata } from "next";
import { getInstitutionalInfo } from "@/lib/site-settings/institutional";
import { OffersFormClient } from "./OffersFormClient";

export const metadata: Metadata = {
  title: "Grupo de Ofertas",
  description: "Receba lançamentos, promoções e oportunidades especiais da Maria Flor por e-mail.",
  robots: { index: false, follow: true },
};

// O formulário depende do link do grupo (site_settings) e registra
// OFFERS_PAGE_VIEW a cada visita — não faz sentido estaticamente otimizar.
export const dynamic = "force-dynamic";

export default async function OfertasPage() {
  const info = await getInstitutionalInfo();

  const title = info.ofertasTitle ?? "Entre para o Grupo de Ofertas da Maria Flor ❤️";
  const text = info.ofertasText ?? "Cadastre seu e-mail e receba novidades, promoções e oportunidades especiais.";

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-center font-display text-2xl text-text sm:text-3xl">{title}</h1>
      <p className="mt-3 text-center text-sm text-text-muted">{text}</p>

      <div className="mt-8">
        {info.ofertasEnabled ? (
          <OffersFormClient offersGroupUrl={info.offersGroupUrl} ctaLabel={info.ofertasCtaLabel} />
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-text-muted">
            Os cadastros para o Grupo de Ofertas estão pausados no momento. Volte em breve ❤️
          </p>
        )}
      </div>
    </main>
  );
}
