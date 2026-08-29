"use client";

import { useState } from "react";
import Link from "next/link";
import { Drawer } from "@/components/ui/Drawer";

/**
 * Botão de menu (hamburger) + drawer com Início/Novidades/categorias
 * ativas/Favoritos — categorias vêm do banco (prop vinda do Server
 * Component do layout), nunca hardcoded.
 */
export function CategoryMenuDrawer({ categories }: { categories: { name: string; slug: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menu"
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-muted"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
        </svg>
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Maria Flor">
        <nav className="flex flex-col">
          <Link href="/" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm text-text hover:bg-muted">
            Início
          </Link>
          <Link
            href="/novidades"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2.5 text-sm text-text hover:bg-muted"
          >
            Novidades
          </Link>

          {categories.length > 0 && (
            <>
              <p className="mt-2 px-3 pb-1 text-xs font-medium uppercase tracking-wide text-text-muted">Categorias</p>
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/categoria/${category.slug}`}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-text hover:bg-muted"
                >
                  {category.name}
                </Link>
              ))}
            </>
          )}

          <Link
            href="/favoritos"
            onClick={() => setOpen(false)}
            className="mt-2 rounded-lg px-3 py-2.5 text-sm text-text hover:bg-muted"
          >
            Favoritos
          </Link>
        </nav>
      </Drawer>
    </>
  );
}
