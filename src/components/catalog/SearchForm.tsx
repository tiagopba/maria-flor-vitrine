/**
 * Form GET simples — funciona sem JavaScript, resultado é a própria página
 * /busca renderizada no servidor com dados reais do banco. Lupa dentro do
 * campo (também é o botão de submit) em vez de um botão "Buscar" separado —
 * mais compacto, e o Enter do teclado já submete o form nativamente.
 */
export function SearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/busca" method="GET" className="relative mx-auto w-full max-w-md">
      <button
        type="submit"
        aria-label="Buscar"
        className="absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-primary"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </button>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Busque pelo nome ou código da peça"
        className="h-11 w-full rounded-full border border-border bg-surface pl-11 pr-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
      />
    </form>
  );
}
