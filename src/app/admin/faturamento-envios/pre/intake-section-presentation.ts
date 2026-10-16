import { CircleAlert, CircleCheck, CircleX, Clock, Inbox, SearchCheck, type LucideIcon } from "lucide-react";

/**
 * Mapa puro de apresentação (ícone, cor, texto auxiliar) por seção do
 * Pré-faturamento — nunca a regra de quais status entram em cada seção
 * (isso continua só em lib/intake/groups.ts, intocado). Chaveado pelo
 * mesmo `group.key` de INTAKE_GROUPS.
 */
export interface IntakeSectionPresentation {
  icon: LucideIcon;
  /** Tom do Badge (components/ui/Badge) usado no contador e no status de cada venda desta seção. */
  badgeTone: "info" | "primary" | "danger" | "warning" | "success" | "neutral";
  /** Variável --admin-* (cor sólida) para o ícone. */
  iconColorVar: string;
  /** Variável --admin-*-soft para o fundo do círculo do ícone e do empty state. */
  softBgVar: string;
  description: string;
}

export const INTAKE_SECTION_PRESENTATION: Record<string, IntakeSectionPresentation> = {
  awaiting: {
    icon: Clock,
    badgeTone: "info",
    iconColorVar: "--admin-info",
    softBgVar: "--admin-info-soft",
    description: "Aguardando a cliente preencher os dados.",
  },
  received: {
    icon: Inbox,
    badgeTone: "primary",
    iconColorVar: "--admin-primary",
    softBgVar: "--admin-primary-soft",
    description: "Dados recebidos, prontas para conferência.",
  },
  blocked: {
    icon: CircleAlert,
    badgeTone: "danger",
    iconColorVar: "--admin-danger",
    softBgVar: "--admin-danger-soft",
    description: "Divergência crítica — não avança sem corrigir.",
  },
  review: {
    icon: SearchCheck,
    badgeTone: "warning",
    iconColorVar: "--admin-warning",
    softBgVar: "--admin-warning-soft",
    description: "Vendas que precisam de conferência humana.",
  },
  approved: {
    icon: CircleCheck,
    badgeTone: "success",
    iconColorVar: "--admin-success",
    softBgVar: "--admin-success-soft",
    description: "Conferência aprovada, prontas para o faturamento.",
  },
  cancelled: {
    icon: CircleX,
    badgeTone: "neutral",
    iconColorVar: "--admin-text-muted",
    softBgVar: "--admin-neutral-soft",
    description: "Vendas canceladas antes da aprovação.",
  },
};

/** Fallback neutro — nunca deveria disparar (todo group.key de INTAKE_GROUPS tem entrada acima), mas evita um crash se as duas listas um dia divergirem. */
export const DEFAULT_SECTION_PRESENTATION: IntakeSectionPresentation = {
  icon: Inbox,
  badgeTone: "neutral",
  iconColorVar: "--admin-text-muted",
  softBgVar: "--admin-neutral-soft",
  description: "",
};

export function getIntakeSectionPresentation(key: string): IntakeSectionPresentation {
  return INTAKE_SECTION_PRESENTATION[key] ?? DEFAULT_SECTION_PRESENTATION;
}
