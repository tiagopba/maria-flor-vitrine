import Image from "next/image";
import Link from "next/link";

/**
 * Header público — compacto (não come altura útil no celular), sem JS de
 * cliente (nada aqui precisa de interatividade além de navegação simples).
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

        {/* Favoritos: espaço preparado, sem interação ainda */}
        <span
          aria-hidden
          title="Favoritos (em breve)"
          className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted/50"
        >
          <HeartIcon />
        </span>
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

function HeartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-6.7-4.35-9.3-8.1C1 10.1 1.8 6.6 4.9 5.3c2.1-.9 4.2 0 5.6 1.9L12 8.7l1.5-1.5c1.4-1.9 3.5-2.8 5.6-1.9 3.1 1.3 3.9 4.8 2.2 7.6C18.7 16.65 12 21 12 21z" />
    </svg>
  );
}
