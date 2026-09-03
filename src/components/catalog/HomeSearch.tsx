"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

const PLACEHOLDER_SUGGESTIONS = [
  "Buscar por vestido, calça ou blusa...",
  "Buscar por tamanho M...",
  "Buscar por tamanho 38...",
  "Buscar por até R$ 99...",
  "Buscar por jeans...",
  "Buscar por novidades...",
];

/**
 * Busca da Home com sugestões: o placeholder do campo roda por uma lista
 * de exemplos (puramente cosmético, troca só o atributo placeholder — o
 * form em si continua um GET simples pra /busca, funciona sem JS igual o
 * SearchForm original). Componente próprio da Home (não reaproveita
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
  );
}
