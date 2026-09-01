import { Suspense } from "react";
import { NavigationTracker } from "@/components/layout/NavigationTracker";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FavoritesDiscoveryTip } from "@/components/catalog/FavoritesDiscoveryTip";
import { getVisibleCategoriesPublic } from "@/lib/db/categories";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const categories = await getVisibleCategoriesPublic();

  return (
    <>
      {/* useSearchParams (pra guardar a origem real de "Ver mais peças" com
          query params, ex: /busca?q=jeans) exige Suspense — isolado só
          nesse componente invisível, não afeta o resto do layout. */}
      <Suspense fallback={null}>
        <NavigationTracker />
      </Suspense>
      <SiteHeader categories={categories} />
      <FavoritesDiscoveryTip />
      {children}
      <SiteFooter />
    </>
  );
}
