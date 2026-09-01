import { Suspense } from "react";
import { NavigationTracker } from "@/components/layout/NavigationTracker";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FavoritesDiscoveryTip } from "@/components/catalog/FavoritesDiscoveryTip";
import { PostContactPrompt } from "@/components/catalog/PostContactPrompt";
import { JsonLd } from "@/components/seo/JsonLd";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { getVisibleCategoriesPublic } from "@/lib/db/categories";
import { getInstitutionalInfo } from "@/lib/site-settings/institutional";
import { buildStoreJsonLd } from "@/lib/seo/structured-data";
import { getSiteUrl } from "@/lib/site";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [categories, institutionalInfo] = await Promise.all([
    getVisibleCategoriesPublic(),
    getInstitutionalInfo(),
  ]);

  return (
    <>
      {/* JSON-LD da loja (ClothingStore) — presente em toda página pública,
          igual a um rodapé de NAP (Nome/Endereço/Telefone): é o padrão
          recomendado, não duplicação problemática. */}
      <JsonLd data={buildStoreJsonLd(institutionalInfo, getSiteUrl())} />
      {/* useSearchParams (pra guardar a origem real de "Ver mais peças" com
          query params, ex: /busca?q=jeans) exige Suspense — isolado só
          nesse componente invisível, não afeta o resto do layout. */}
      <Suspense fallback={null}>
        <NavigationTracker />
        <PageViewTracker />
        <MetaPixel />
      </Suspense>
      <SiteHeader categories={categories} />
      <FavoritesDiscoveryTip />
      <PostContactPrompt />
      {children}
      <SiteFooter />
    </>
  );
}
