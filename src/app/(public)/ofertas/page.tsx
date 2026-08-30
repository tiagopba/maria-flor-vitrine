import type { Metadata } from "next";
import { getInstitutionalInfo } from "@/lib/site-settings/institutional";
import { OffersFormClient } from "./OffersFormClient";

export const metadata: Metadata = {
  title: "Grupo de Ofertas",
  description: "Receba lançamentos, promoções e oportunidades especiais da Maria Flor direto no WhatsApp e e-mail.",
  robots: { index: false, follow: true },
};

// O formulário depende do link do grupo (site_settings) e registra
// OFFERS_PAGE_VIEW a cada visita — não faz sentido estaticamente otimizar.
export const dynamic = "force-dynamic";

export default async function OfertasPage() {
  const info = await getInstitutionalInfo();

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-center font-display text-2xl text-text sm:text-3xl">
        Entre para o Grupo de Ofertas da Maria Flor ❤️
      </h1>
      <p className="mt-3 text-center text-sm text-text-muted">
        Receba lançamentos, promoções e oportunidades especiais direto no seu WhatsApp e e-mail.
      </p>

      <div className="mt-8">
        <OffersFormClient offersGroupUrl={info.offersGroupUrl} />
      </div>
    </main>
  );
}
