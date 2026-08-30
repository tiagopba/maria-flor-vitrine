import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { getInstitutionalInfo } from "@/lib/site-settings/institutional";

export const metadata: Metadata = {
  title: "Quem Somos",
  description: "Conheça a história da Maria Flor, moda feminina em Paranaíba/MS.",
};

// Sem segmento dinâmico, essa página seria estaticamente otimizada no
// build — a foto da fachada e demais dados institucionais ficariam
// congelados no deploy, sem refletir uma atualização feita depois direto
// no Supabase.
export const dynamic = "force-dynamic";

export default async function QuemSomosPage() {
  const info = await getInstitutionalInfo();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl text-text sm:text-3xl">Nossa história</h1>

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
        <p>
          A Maria Flor nasceu com o propósito de aproximar moda, estilo e atendimento de verdade.
        </p>
        <p>
          Há anos fazemos parte da rotina de mulheres da nossa cidade, sempre com novidades,
          atendimento próximo e uma seleção de peças pensada para diferentes momentos e estilos.
        </p>
        <p>
          Nossa loja física é o coração da Maria Flor, e agora nossa Vitrine Online nasceu para
          deixar essa experiência ainda mais fácil: você acompanha as novidades, salva suas peças
          favoritas e fala diretamente com nossas vendedoras.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/como-chegar" className="sm:flex-1">
          <Button variant="secondary" className="h-12 w-full">
            Como chegar na loja
          </Button>
        </Link>
        <Link href="/novidades" className="sm:flex-1">
          <Button className="h-12 w-full">Ver novidades</Button>
        </Link>
      </div>
    </main>
  );
}
