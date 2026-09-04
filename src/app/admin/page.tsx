import type { Metadata } from "next";
import { Eye, Heart, MessageCircle, MousePointerClick, Percent, ShoppingBag, UserPlus, Users } from "lucide-react";
import { getCurrentAdmin } from "@/lib/auth/permissions";
import { getDashboardData, type DashboardPeriod } from "@/lib/analytics/dashboard";
import { DashboardPeriodFilter } from "./DashboardPeriodFilter";
import { DashboardCard } from "./DashboardCard";
import { RankingList } from "./DashboardCharts";
import { ConversionFunnel, DeviceBreakdown } from "./DashboardFunnel";

export const metadata: Metadata = { title: "Dashboard" };

// Dados vêm de analytics_events em tempo real — nunca deve ficar congelado
// no HTML de um deploy antigo.
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administradora",
  catalog_editor: "Editora de catálogo",
  seller: "Vendedora",
  master: "Master",
};

const VALID_PERIODS: DashboardPeriod[] = ["today", "7d", "30d", "month"];

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function initialOf(name: string | undefined): string {
  return name?.trim()?.[0]?.toUpperCase() ?? "?";
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:flex">
            <MousePointerClick className="h-5 w-5 text-primary" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display text-2xl text-text">Dashboard</h1>
            <p className="mt-1 text-sm text-text-muted">
              Bem-vinda, {admin?.name}! Aqui está o desempenho da sua vitrine. 💗
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:order-first sm:flex-col sm:items-end sm:self-auto">
          <div className="flex items-center gap-2.5 rounded-full border border-black/[0.04] bg-white py-1.5 pl-1.5 pr-3.5 shadow-[0_1px_2px_rgba(20,10,20,0.04),0_8px_24px_-16px_rgba(20,10,20,0.12)]">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initialOf(admin?.name)}
            </div>
            <div className="leading-tight">
              <p className="text-sm font-medium text-text">{admin?.name}</p>
              <p className="text-[11px] text-text-muted">{admin ? ROLE_LABEL[admin.role] : ""}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <DashboardPeriodFilter current={period} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <DashboardCard label="Visualizações da vitrine" comparison={data.cards.pageViews} icon={Eye} />
        <DashboardCard label="Sessões únicas" comparison={data.cards.uniqueSessions} icon={Users} />
        <DashboardCard label="Visualizações de produtos" comparison={data.cards.productViews} icon={ShoppingBag} />
        <DashboardCard label="Adições à Minha Seleção" comparison={data.cards.favoritesAdded} icon={Heart} />
        <DashboardCard
          label="Cliques para WhatsApp"
          comparison={data.cards.whatsappStarted}
          icon={MessageCircle}
          hint="Sessões distintas com clique — não confirma envio da mensagem"
        />
        <DashboardCard
          label="Cadastros no Grupo de Ofertas"
          comparison={data.cards.offersLeadsConfirmed}
          icon={UserPlus}
          hint="E-mail confirmado"
        />
        <DashboardCard
          label="Taxa de visualização de produto"
          comparison={data.cards.productViewRate}
          icon={Percent}
          formatValue={formatPercent}
          hint="Sessões com produto ÷ sessões únicas"
        />
        <DashboardCard
          label="Taxa de seleção"
          comparison={data.cards.selectionRate}
          icon={Percent}
          formatValue={formatPercent}
          hint="Sessões com seleção ÷ sessões únicas"
        />
        <DashboardCard
          label="Taxa de WhatsApp"
          comparison={data.cards.whatsappClickRate}
          icon={MousePointerClick}
          formatValue={formatPercent}
          hint="Sessões com WhatsApp ÷ sessões únicas"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ConversionFunnel funnel={data.funnel} />
        <DeviceBreakdown devices={data.devices} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <RankingList
          title="Produtos mais visualizados"
          rows={data.topViewedProducts}
          emptyLabel="Sem visualizações neste período."
          withAvatar
          primaryUnitLabel="sessões interessadas"
          secondaryUnitLabel="visualizações"
        />
        <RankingList
          title="Peças mais adicionadas à seleção"
          rows={data.topAddedProducts}
          emptyLabel="Nenhuma peça adicionada à seleção neste período."
          withAvatar
          primaryUnitLabel="sessões adicionaram"
          secondaryUnitLabel="adições"
        />
        <RankingList
          title="Categorias com mais interesse"
          rows={data.topCategories}
          emptyLabel="Sem visualizações de categoria neste período."
          primaryUnitLabel="sessões interessadas"
          secondaryUnitLabel="visualizações"
        />
        <RankingList
          title="Tamanhos mais procurados"
          rows={data.topSizes}
          emptyLabel="Sem tamanho registrado neste período."
          primaryUnitLabel="sessões buscaram"
          secondaryUnitLabel="menções"
        />
        <RankingList title="Origem do tráfego (sessões)" rows={data.trafficSources} emptyLabel="Sem sessões neste período." />
      </div>
    </div>
  );
}
