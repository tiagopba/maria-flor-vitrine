"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

const PLACEHOLDER_SUGGESTIONS = [
  "Buscar por vestido tamanho M",
  "Buscar por peças até R$ 99",
  "Buscar por look tamanho 38",
  "Buscar por blusas até R$ 149",
  "Buscar por Look Eliara",
];

const QUICK_CHIPS: { label: string; href: string }[] = [
  { label: "Até R$ 99", href: "/busca?maxPrice=99" },
  { label: "Tamanho 38", href: "/busca?size=38" },
  { label: "Tamanho M", href: "/busca?size=M" },
  { label: "Look Eliara", href: "/categoria/look-eliara" },
  { label: "Novidades", href: "/novidades" },
];

/**
 * Busca da Home com sugestões: o placeholder do campo roda por uma lista
 * de exemplos (puramente cosmético, troca só o atributo placeholder — o
 * form em si continua um GET simples pra /busca, funciona sem JS igual o
 * SearchForm original) + chips de atalho abaixo, que já abrem a listagem
 * filtrada via query params. Componente próprio da Home (não reaproveita
 * SearchForm) pra não arriscar mudar o comportamento da busca em
 * /busca, que usa SearchForm sem nenhuma sugestão.
 */
export function HomeSearch() {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_SUGGESTIONS.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <form action="/busca" method="GET" className="relative mx-auto w-full max-w-md">
        <button
          type="submit"
          aria-label="Buscar"
          className="absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-primary"
        >
          <Search className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
        </button>
        <input
          type="search"
          name="q"
          placeholder={PLACEHOLDER_SUGGESTIONS[placeholderIndex]}
          className="h-11 w-full rounded-full border border-border bg-surface pl-11 pr-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
      </form>

      <div className="mx-auto flex max-w-lg flex-wrap justify-center gap-2">
        {QUICK_CHIPS.map((chip) => (
          <Link
            key={chip.label}
            href={chip.href}
            className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-muted"
          >
            {chip.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
