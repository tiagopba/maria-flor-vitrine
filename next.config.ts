import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: "https", hostname: supabaseHostname, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  // Domínio oficial é o apex, sem "www" (evita duas versões da mesma
  // página pro Google/SEO). Isso só cobre o redirect de tráfego real —
  // o canonical/OG em si vem de NEXT_PUBLIC_SITE_URL (ver src/lib/site.ts),
  // que também precisa estar configurado sem "www" no ambiente de Production
  // na Vercel.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.modamariaflor.com.br" }],
        destination: "https://modamariaflor.com.br/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
