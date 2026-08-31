/**
 * Tipos do banco de dados.
 *
 * Este arquivo deve ser substituído pelo output real do Supabase CLI assim
 * que o projeto estiver conectado:
 *
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 *
 * Até lá, mantemos este tipo espelhando manualmente as migrations em
 * supabase/migrations, para o app compilar com tipagem estrita.
 */

export type ProductStatus =
  | "ACTIVE"
  | "LAST_UNITS"
  | "CHECK_AVAILABILITY"
  | "SOLD_OUT"
  | "ARCHIVED";

export type UserRole = "admin" | "catalog_editor" | "seller";

export type ProvadorStatus = "DRAFT" | "PUBLISHED";

export type AnalyticsEventType =
  | "PRODUCT_VIEW"
  | "CATEGORY_VIEW"
  | "SEARCH"
  | "SIZE_SELECTED"
  | "FAVORITE_ADDED"
  | "FAVORITE_REMOVED"
  | "WHATSAPP_CLICK"
  | "PROVADOR_VIEW"
  | "LOOK_WHATSAPP_CLICK"
  | "COLLECTION_VIEW"
  | "LEAD_SUBMITTED"
  | "SHARE_PRODUCT"
  // Já aplicados na constraint do banco (módulos Favoritos/Seleção
  // Compartilhável/fluxo guiado de seleção no produto).
  | "FAVORITES_VIEW"
  | "FAVORITES_WHATSAPP_CLICK"
  | "SELECTION_CREATED"
  | "SELECTION_VIEWED"
  | "PRODUCT_FLOW_STARTED"
  | "PRODUCT_FLOW_SEE_MORE_CLICK"
  // Módulo institucional (Grupo de Ofertas) — já aplicados na constraint do banco.
  | "OFFERS_PAGE_VIEW"
  | "OFFER_LEAD_SUBMITTED"
  | "OFFERS_GROUP_CLICK"
  | "STORE_DIRECTIONS_CLICK";

type Table<Row, RequiredInsertKeys extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, RequiredInsertKeys>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          name: string;
          role: UserRole;
          created_at: string;
          updated_at: string;
        },
        "id" | "name"
      >;

      categories: Table<
        {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          cover_image: string | null;
          // Chave do ícone — registry central em lib/catalog/category-icons.ts.
          // NULL = ícone neutro até um admin escolher um específico.
          icon_key: string | null;
          position: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        },
        "name" | "slug"
      >;

      products: Table<
        {
          id: string;
          code: string;
          name: string;
          slug: string;
          description: string | null;
          price: number;
          promotional_price: number | null;
          // Modelo de dois preços — NULL em qualquer um dos dois significa
          // "produto no modelo legado" (ver lib/catalog/pricing.ts). Nunca
          // preenchido junto com promotional_price (constraint
          // cash_price_excludes_promotional_price no banco).
          cash_price: number | null;
          max_installments_override: number | null;
          category_id: string;
          // Cor principal da peça (opcional) e agrupamento "mesmo modelo,
          // cores diferentes" (opcional) — ver lib/db/colors.ts e
          // lib/db/product-groups.ts. NULL nos dois = comportamento
          // idêntico ao de antes desta feature.
          color_id: string | null;
          product_group_id: string | null;
          status: ProductStatus;
          featured: boolean;
          published_at: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        },
        "code" | "name" | "slug" | "price" | "category_id"
      >;

      colors: Table<
        {
          id: string;
          name: string;
          slug: string;
          hex_color: string | null;
          active: boolean;
          created_at: string;
        },
        "name" | "slug"
      >;

      product_groups: Table<
        {
          id: string;
          name: string | null;
          created_at: string;
        },
        never
      >;

      product_slug_redirects: Table<
        {
          id: string;
          product_id: string;
          old_slug: string;
          created_at: string;
        },
        "product_id" | "old_slug"
      >;

      product_images: Table<
        {
          id: string;
          product_id: string;
          storage_path: string;
          alt_text: string | null;
          position: number;
          created_at: string;
        },
        "product_id" | "storage_path"
      >;

      product_sizes: Table<
        {
          id: string;
          product_id: string;
          size: string;
          position: number;
          created_at: string;
        },
        "product_id" | "size"
      >;

      size_options: Table<
        {
          id: string;
          label: string;
          position: number;
        },
        "label"
      >;

      provadores: Table<
        {
          id: string;
          title: string;
          slug: string;
          date: string;
          cover_image: string | null;
          description: string | null;
          status: ProvadorStatus;
          created_at: string;
          updated_at: string;
        },
        "title" | "slug"
      >;

      provador_looks: Table<
        {
          id: string;
          provador_id: string;
          title: string;
          cover_image: string | null;
          position: number;
          created_at: string;
        },
        "provador_id" | "title"
      >;

      provador_look_products: Table<
        {
          id: string;
          look_id: string;
          product_id: string;
          position: number;
        },
        "look_id" | "product_id"
      >;

      collections: Table<
        {
          id: string;
          title: string;
          slug: string;
          image: string | null;
          description: string | null;
          active: boolean;
          starts_at: string | null;
          ends_at: string | null;
          created_at: string;
          updated_at: string;
        },
        "title" | "slug"
      >;

      collection_products: Table<
        {
          id: string;
          collection_id: string;
          product_id: string;
          position: number;
        },
        "collection_id" | "product_id"
      >;

      sellers: Table<
        {
          id: string;
          name: string;
          phone: string | null;
          whatsapp_number: string;
          active: boolean;
          avatar_url: string | null;
          order_priority: number;
          round_robin: boolean;
          created_at: string;
          updated_at: string;
        },
        "name" | "whatsapp_number"
      >;

      leads: Table<
        {
          id: string;
          name: string;
          whatsapp: string;
          email: string | null;
          marketing_consent: boolean;
          whatsapp_consent: boolean;
          consent_timestamp: string | null;
          consent_source: string | null;
          session_id: string;
          created_at: string;
          // Módulo institucional (Grupo de Ofertas) — já aplicadas no banco.
          whatsapp_normalized: string | null;
          email_marketing_consent: boolean;
          privacy_policy_version: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          referrer: string | null;
          updated_at: string;
          whatsapp_verified_at: string | null;
          email_verified_at: string | null;
          auth_user_id: string | null;
          auth_user_id_conflict_at: string | null;
          resume_token_hash: string | null;
          resume_token_expires_at: string | null;
          otp_email_send_count: number;
          otp_email_last_sent_at: string | null;
        },
        "name" | "whatsapp" | "session_id"
      >;

      lead_interests: Table<
        {
          id: string;
          lead_id: string;
          product_id: string | null;
          category_id: string | null;
          created_at: string;
        },
        "lead_id"
      >;

      analytics_events: Table<
        {
          id: string;
          event_type: AnalyticsEventType;
          session_id: string;
          product_id: string | null;
          category_id: string | null;
          provador_id: string | null;
          collection_id: string | null;
          seller_id: string | null;
          size: string | null;
          source: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          referrer: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        },
        "event_type" | "session_id"
      >;

      site_settings: Table<
        {
          key: string;
          value: unknown;
          updated_at: string;
        },
        "key" | "value"
      >;

      // ATENÇÃO: tabela ainda NÃO existe no banco — migration preparada em
      // supabase/migrations/20260829130000_shared_selections.sql, não
      // aplicada (ver aviso na entrega do módulo Seleção Compartilhável).
      shared_selections: Table<
        {
          token: string;
          items: { product_id: string; selected_size: string | null }[];
          session_id: string | null;
          created_at: string;
          expires_at: string;
        },
        "token" | "items" | "expires_at"
      >;

      consent_records: Table<
        {
          id: string;
          session_id: string;
          lead_id: string | null;
          necessary: boolean;
          analytics: boolean;
          marketing: boolean;
          created_at: string;
        },
        "session_id"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      try_claim_email_otp_send: {
        Args: {
          p_lead_id: string;
          p_cooldown_seconds: number;
          p_window_seconds: number;
          p_max_per_window: number;
        };
        Returns: boolean;
      };
    };
  };
}
