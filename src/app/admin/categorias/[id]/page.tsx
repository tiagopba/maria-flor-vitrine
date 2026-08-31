import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryByIdAdmin } from "@/lib/db/categories";
import { updateCategoryAction } from "../actions";
import { CategoryForm } from "../CategoryForm";

export const metadata: Metadata = { title: "Editar categoria" };

export default async function EditCategoryPage({
  params,
}: PageProps<"/admin/categorias/[id]">) {
  const { id } = await params;
  const category = await getCategoryByIdAdmin(id);

  if (!category) notFound();

  const boundAction = updateCategoryAction.bind(null, category.id);

  return (
    <div className="max-w-md">
      <Link href="/admin/categorias" className="text-sm text-text-muted hover:text-text">
        ← Categorias
      </Link>
      <h1 className="mb-6 mt-2 font-display text-2xl text-text">Editar categoria</h1>
      <CategoryForm
        action={boundAction}
        submitLabel="Salvar alterações"
        defaultValues={{
          name: category.name,
          slug: category.slug,
          description: category.description,
          cover_image: category.cover_image,
          icon_key: category.icon_key,
        }}
      />
    </div>
  );
}
