import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { getSiteUrl } from "@/lib/site";
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

const siteUrl = getSiteUrl();
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

// Sem isso, o Safari do iPhone renderiza a página numa largura virtual de
// desktop (~980px) e encolhe pra caber na tela — o conteúdo fica cortado
// nas bordas em vez de responsivo de verdade.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
