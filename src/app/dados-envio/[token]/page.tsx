import type { Metadata } from "next";
import { findIntakeByTokenHash } from "@/lib/db/intakes";
import { isIntakeTokenExpired, hashIntakeToken } from "@/lib/intake/token";
import { PublicIntakeForm } from "./PublicIntakeForm";

// Página pública SEM Pixel, CAPI, analytics ou presença: fica fora do layout (public).
export const metadata: Metadata = {
  title: "Dados para faturamento e envio — Maria Flor",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-10 text-text">
      <header className="text-center">
        <p className="font-display text-2xl text-text">Maria Flor</p>
        <p className="text-xs uppercase tracking-widest text-text-muted">Moda feminina</p>
      </header>
      {children}
    </main>
  );
}

export default async function PublicIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const validShape = token.length >= 20 && token.length <= 100;
  const found = validShape ? await findIntakeByTokenHash(hashIntakeToken(token)) : null;
  // Venda cancelada: o link deixa de valer, mesmo que alguma linha ainda case com o token.
  const row = found && found.status !== "CANCELLED" ? found : null;

  if (!row) {
    return (
      <Frame>
        <p className="rounded-2xl border border-border bg-surface p-5 text-center text-sm">Este link não é válido.</p>
      </Frame>
    );
  }

  if (isIntakeTokenExpired(row.token_expires_at)) {
    return (
      <Frame>
        <p className="rounded-2xl border border-border bg-surface p-5 text-center text-sm">
          Este link expirou. Entre em contato com a Maria Flor para receber um novo.
        </p>
      </Frame>
    );
  }

  if (row.status !== "AWAITING_CUSTOMER_DATA") {
    return (
      <Frame>
        <div className="rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="font-display text-xl">✅ Dados recebidos!</p>
          <p className="mt-2 text-sm text-text-muted">
            Agora vamos preparar a nota fiscal e o envio do seu pedido. 💕
          </p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-2xl">Dados para faturamento e envio</h1>
        <p className="text-sm text-text-muted">
          Preencha seus dados para emitirmos sua nota fiscal e prepararmos seu pedido para envio.
        </p>
      </div>
      <PublicIntakeForm token={token} />
    </Frame>
  );
}
