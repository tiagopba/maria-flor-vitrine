import Image from "next/image";
import Link from "next/link";
import { FavoritesHeaderLink } from "@/components/layout/FavoritesHeaderLink";

/**
 * Header público — compacto (não come altura útil no celular). Continua
 * Server Component; só o contador de favoritos (FavoritesHeaderLink)
 * precisa ser client, por depender de localStorage.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur-sm sm:px-6">
      <Link href="/" aria-label="Maria Flor" className="flex items-center">
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
        <Link
          href="/busca"
          aria-label="Buscar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-muted"
        >
          <SearchIcon />
        </Link>

        <FavoritesHeaderLink />
      </nav>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
