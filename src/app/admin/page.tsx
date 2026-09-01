import type { Metadata } from "next";
import { getCurrentAdmin } from "@/lib/auth/permissions";
import { getDashboardData, type DashboardPeriod } from "@/lib/analytics/dashboard";
import { DashboardPeriodFilter } from "./DashboardPeriodFilter";
import { DashboardCard } from "./DashboardCard";
import { DailyEvolutionChart, RankingList } from "./DashboardCharts";

export const metadata: Metadata = { title: "Dashboard" };

// Dados vêm de analytics_events em tempo real — nunca deve ficar congelado
// no HTML de um deploy antigo.
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administradora",
  catalog_editor: "Editora de catálogo",
  seller: "Vendedora",
};

const VALID_PERIODS: DashboardPeriod[] = ["today", "7d", "30d", "month"];

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const [admin, rawParams] = await Promise.all([getCurrentAdmin(), searchParams]);

  const periodParam = typeof rawParams.period === "string" ? rawParams.period : "7d";
  const period: DashboardPeriod = VALID_PERIODS.includes(periodParam as DashboardPeriod)
    ? (periodParam as DashboardPeriod)
    : "7d";

  const data = await getDashboardData(period);

  return (
    <div>
      <h1 className="font-display text-2xl text-text">Olá, {admin?.name}</h1>
      <p className="mt-1 text-sm text-text-muted">{admin ? ROLE_LABEL[admin.role] : ""}</p>

      <div className="mt-6">
        <DashboardPeriodFilter current={period} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <DashboardCard label="Visualizações da vitrine" comparison={data.cards.pageViews} />
        <DashboardCard label="Visualizações de produtos" comparison={data.cards.productViews} />
        <DashboardCard label="Adições à Minha Seleção" comparison={data.cards.favoritesAdded} />
        <DashboardCard label="Conversas iniciadas no WhatsApp" comparison={data.cards.whatsappStarted} />
        <DashboardCard
          label="Taxa de clique para WhatsApp"
          comparison={data.cards.whatsappClickRate}
          formatValue={formatPercent}
          hint="Conversas iniciadas ÷ visualizações de produto"
        />
        <DashboardCard label="Cadastros no Grupo de Ofertas" comparison={data.cards.offersLeadsConfirmed} hint="E-mail confirmado" />
      </div>

      <div className="mt-6">
        <DailyEvolutionChart points={data.dailyEvolution} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <RankingList title="Produtos mais visualizados" rows={data.topViewedProducts} emptyLabel="Sem visualizações neste período." />
        <RankingList
          title="Produtos mais adicionados à seleção"
          rows={data.topAddedProducts}
          emptyLabel="Nenhuma peça adicionada à seleção neste período."
        />
        <RankingList title="Categorias com mais interesse" rows={data.topCategories} emptyLabel="Sem visualizações de categoria neste período." />
        <RankingList title="Tamanhos mais procurados" rows={data.topSizes} emptyLabel="Sem tamanho registrado neste período." />
        <RankingList title="Origem do tráfego" rows={data.trafficSources} emptyLabel="Sem visualizações neste período." />
      </div>
    </div>
  );
}
