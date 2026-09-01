import Image from "next/image";
import Link from "next/link";
import { CategoryMenuDrawer } from "@/components/layout/CategoryMenuDrawer";
import { FavoritesHeaderLink } from "@/components/layout/FavoritesHeaderLink";

/**
 * Header público — compacto (não come altura útil no celular), o mesmo em
 * toda página pública (Home/Novidades/Categoria/Busca/Produto/Favoritos/
 * Seleção — todas ficam dentro de app/(public)/layout.tsx). Continua
 * Server Component; só o contador de favoritos e o menu precisam ser
 * client, por dependerem de localStorage/estado de abertura.
 *
 * Sem lupa aqui de propósito: a Home já tem a área de busca principal
 * ("Viu no Instagram? Encontre aqui."), então um ícone extra no topo era
 * redundante — a busca continua acessível de qualquer página via "Buscar
 * peças" dentro do menu (CategoryMenuDrawer).
 */
export function SiteHeader({ categories }: { categories: { name: string; slug: string }[] }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-3 backdrop-blur-sm sm:px-6">
      <Link href="/" aria-label="Maria Flor" className="flex shrink-0 items-center">
        <Image
          src="/logo-maria-flor.png"
          alt="Maria Flor"
          width={288}
          height={110}
          priority
          className="h-8 w-auto sm:h-9"
        />
      </Link>

      <nav className="flex items-center gap-1">
        <CategoryMenuDrawer categories={categories} />
        <FavoritesHeaderLink />
      </nav>
    </header>
  );
}
