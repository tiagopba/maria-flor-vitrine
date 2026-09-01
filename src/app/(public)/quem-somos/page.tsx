import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { getInstitutionalInfo } from "@/lib/site-settings/institutional";

export const metadata: Metadata = {
  title: "Quem Somos",
  description: "Conheça a história da Maria Flor, moda feminina em Paranaíba/MS.",
  alternates: { canonical: "/quem-somos" },
};

// Sem segmento dinâmico, essa página seria estaticamente otimizada no
// build — a foto da fachada e demais dados institucionais ficariam
// congelados no deploy, sem refletir uma atualização feita depois direto
// no Supabase.
export const dynamic = "force-dynamic";

const DEFAULT_STORY =
  "Maria Flor é uma loja de moda feminina em Paranaíba, Mato Grosso do Sul. Nossa loja física, no " +
  "coração da cidade, é onde tudo começou. " +
  "Agora, nossa Vitrine Online nasceu para tornar essa experiência ainda mais fácil: você acompanha " +
  "as novidades, salva suas peças favoritas e fala diretamente com nossas vendedoras.";

export default async function QuemSomosPage() {
  const info = await getInstitutionalInfo();

  const title = info.quemSomosTitle ?? "Nossa história";
  const storyParagraphs = (info.quemSomosText ?? DEFAULT_STORY).split("\n").filter((p) => p.trim());
  const ctaLabel = info.quemSomosCtaLabel ?? "Ver novidades";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl text-text sm:text-3xl">{title}</h1>
      {info.quemSomosSubtitle && (
        <p className="mt-1 text-sm text-text-muted sm:text-base">{info.quemSomosSubtitle}</p>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl bg-muted">
        {info.facadePhotoUrl ? (
          <div className="relative aspect-[4/3] w-full">
            <Image
              src={info.facadePhotoUrl}
              alt={`Fachada da loja ${info.tradeName}`}
              fill
              sizes="(max-width: 640px) 100vw, 672px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center px-6 text-center text-sm text-text-muted">
            A foto da nossa loja chega em breve por aqui ❤️
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-4 text-sm leading-relaxed text-text sm:text-base">
        {storyParagraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/como-chegar" className="sm:flex-1">
          <Button variant="secondary" className="h-12 w-full">
            Como chegar na loja
          </Button>
        </Link>
        <Link href="/novidades" className="sm:flex-1">
          <Button className="h-12 w-full">{ctaLabel}</Button>
        </Link>
      </div>
    </main>
  );
}
