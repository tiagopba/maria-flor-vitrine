import type { Metadata } from "next";
import Link from "next/link";
import { createCategoryAction } from "../actions";
import { CategoryForm } from "../CategoryForm";

export const metadata: Metadata = { title: "Nova categoria" };

export default function NewCategoryPage() {
  return (
    <div className="max-w-md">
      <Link href="/admin/categorias" className="text-sm text-text-muted hover:text-text">
        ← Categorias
      </Link>
      <h1 className="mb-6 mt-2 font-display text-2xl text-text">Nova categoria</h1>
      <CategoryForm action={createCategoryAction} submitLabel="Publicar categoria" />
    </div>
  );
}
