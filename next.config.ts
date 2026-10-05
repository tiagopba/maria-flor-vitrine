import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Faturamento e Envios envia 2 PDFs (até 2MB cada) numa Server Action —
      // o padrão de 1MB não comporta. 4.5mb acompanha o teto de payload das
      // funções da Vercel; cada PDF é limitado a 2MB na própria action.
      bodySizeLimit: "4.5mb",
    },
  },
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: "https", hostname: supabaseHostname, pathname: "/storage/v1/object/public/**" }]
      : [],
    // ~31 dias — fotos de produto nunca trocam de conteúdo no mesmo
    // storage_path (cada upload gera um UUID novo, ver
    // lib/images/upload-client.ts), então um TTL longo é seguro e reduz
    // quanto o Image Optimization da Vercel precisa reprocessar a mesma
    // imagem+largura repetidamente.
    minimumCacheTTL: 2678400,
  },
};

export default nextConfig;
