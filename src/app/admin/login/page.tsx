import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default async function AdminLoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  const params = await searchParams;
  const nextParam = params.next;
  const next = typeof nextParam === "string" ? nextParam : "/admin";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 shadow-sm">
        <h1 className="mb-1 font-display text-2xl text-text">Maria Flor</h1>
        <p className="mb-6 text-sm text-text-muted">Painel administrativo</p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
