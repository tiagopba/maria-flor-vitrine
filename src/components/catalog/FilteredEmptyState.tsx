import Link from "next/link";

/**
 * Estado vazio específico de "os filtros aplicados não bateram com nada" —
 * diferente do estado vazio "essa categoria/seção ainda não tem produto
 * nenhum" (esse continua com sua própria mensagem, sem filtro nenhum
 * envolvido).
 */
export function FilteredEmptyState({ clearHref }: { clearHref: string }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 py-10 text-center text-text-muted">
      <p className="max-w-sm">Nenhuma peça encontrada com esses filtros.</p>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <Link href={clearHref} className="text-sm font-medium text-primary hover:underline">
          Limpar filtros
        </Link>
        <span aria-hidden="true" className="text-border">
          •
        </span>
        <Link href="/novidades" className="text-sm font-medium text-primary hover:underline">
          Ver novidades
        </Link>
      </div>
    </div>
  );
}
