import type { Metadata } from "next";
import { MasterLoginForm } from "./MasterLoginForm";

export const metadata: Metadata = { title: "Entrar como master" };

// Rota deliberadamente não linkada em nenhum lugar da UI (nem na página de
// login normal) — só acessível por quem já conhece o endereço. Reduz a
// exposição de "existe um login especial" pra quem só tem acesso comum ao
// painel. O e-mail em si (master@modamariaflor.com.br) é hardcoded no
// fluxo (ver lib/auth/master.ts) e nunca aceito como input.
export default function MasterLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 shadow-sm">
        <h1 className="mb-1 font-display text-2xl text-text">Maria Flor</h1>
        <p className="mb-6 text-sm text-text-muted">Acesso master</p>
        <MasterLoginForm />
      </div>
    </div>
  );
}
