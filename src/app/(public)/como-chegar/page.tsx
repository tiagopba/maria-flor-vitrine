import type { Metadata } from "next";
import { DirectionsButtons } from "@/components/institutional/DirectionsButtons";
import { buildWhatsAppUrl } from "@/lib/whatsapp/message-builder";
import { getInstitutionalInfo } from "@/lib/site-settings/institutional";

export const metadata: Metadata = {
  // `absolute` de propósito — o layout raiz aplica um template "%s | Maria
  // Flor" a todo título; esse aqui já é o texto final desejado (repetiria
  // "Maria Flor" duas vezes se passasse pelo template).
  title: { absolute: "Como Chegar à Maria Flor | Paranaíba/MS" },
  description: "Endereço, telefone e como chegar até a loja física da Maria Flor em Paranaíba/MS.",
};

// Mesmo motivo das outras páginas institucionais: dados vêm do Supabase e
// podem ser atualizados a qualquer momento, não devem ficar congelados
// numa página estaticamente otimizada no build.
export const dynamic = "force-dynamic";

export default async function ComoChegarPage() {
  const info = await getInstitutionalInfo();

  const whatsappUrl = info.whatsapp
    ? buildWhatsAppUrl(info.whatsapp, "Oi! Vim através do site da Maria Flor.")
    : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl text-text sm:text-3xl">Venha conhecer a Maria Flor</h1>

      <div className="mt-6 flex flex-col gap-1.5 text-sm text-text sm:text-base">
        {info.address ? (
          <p>{info.address}</p>
        ) : (
          <p className="text-text-muted">Endereço em breve por aqui.</p>
        )}
        {info.city && info.state && (
          <p className="text-text-muted">
            {info.city}/{info.state}
          </p>
        )}
        {info.phone && <p className="text-text-muted">{info.phone}</p>}
        {info.hours && <p className="text-text-muted">{info.hours}</p>}
        {info.publicContactEmail && (
          <p className="text-text-muted">
            <a href={`mailto:${info.publicContactEmail}`} className="underline hover:text-primary">
              {info.publicContactEmail}
            </a>
          </p>
        )}
      </div>

      <div className="mt-8">
        <DirectionsButtons googleMapsUrl={info.googleMapsUrl} wazeUrl={info.wazeUrl} whatsappUrl={whatsappUrl} />
      </div>
    </main>
  );
}
