import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { listCategoriesAdmin } from "@/lib/db/categories";
import { listSizeFitReviewProducts } from "@/lib/db/product-size-fit";
import { RevisarNumeracoesList } from "./RevisarNumeracoesList";

export const metadata: Metadata = { title: "Revisar numerações" };

/**
 * Tela permanente — nunca desaparece, mesmo com 0 pendências (só o contador
 * do menu some). Busca TODOS os itens revisáveis de uma vez (sem filtrar
 * por status no servidor); Pendentes/Revisados vira alternância local no
 * client, sem recarregar a página — só busca/categoria disparam novo GET.
 */
export default async function RevisarNumeracoesPage({
  searchParams,
}: PageProps<"/admin/produtos/revisar-numeracoes">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;
  const categoryId = typeof params.categoria === "string" ? params.categoria : undefined;

  const [items, categories] = await Promise.all([
    listSizeFitReviewProducts({ search, categoryId }),
    listCategoriesAdmin(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl text-text">Revisar numerações</h1>
        <p className="mt-1 text-sm text-text-muted">
          Confira, pra cada tamanho da etiqueta, quais numerações a peça realmente veste.
        </p>
      </div>

      <form className="mb-6 flex flex-col gap-2 sm:flex-row" method="get">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Buscar por código ou nome..."
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
        <select
          name="categoria"
          defaultValue={categoryId ?? ""}
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      <RevisarNumeracoesList items={items} />
    </div>
  );
}
