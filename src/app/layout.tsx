import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

// "||" (não "??"): NEXT_PUBLIC_SITE_URL pode chegar como string vazia (não
// undefined) quando a variável existe na plataforma de deploy mas foi
// deixada em branco — nesse caso o fallback também precisa entrar em ação,
// senão `new URL("")` derruba o build.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.modamariaflor.com.br";
const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Maria Flor";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — Vitrine`,
    template: `%s | ${siteName}`,
  },
  description:
    "As novidades que você viu nos nossos Stories, agora em um só lugar. Encontre, favorite e fale com uma vendedora pelo WhatsApp.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-text">{children}</body>
    </html>
  );
}
