/**
 * Form GET simples — funciona sem JavaScript, resultado é a própria página
 * /busca renderizada no servidor com dados reais do banco.
 */
export function SearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/busca" method="GET" className="mx-auto flex w-full max-w-md gap-2">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Busque pelo nome ou código da peça"
        className="h-11 flex-1 rounded-full border border-border bg-surface px-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
      />
      <button
        type="submit"
        className="flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
      >
        Buscar
      </button>
    </form>
  );
}
