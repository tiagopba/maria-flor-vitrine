/**
 * Canal Realtime Presence compartilhado entre o tracker público
 * (SitePresenceTracker) e o card do Admin (RealtimeVisitorsCard) — canal
 * público padrão (sem `private: true`), então não depende de nenhuma
 * policy de RLS em `realtime.messages`; só a anon key.
 */
export const PRESENCE_CHANNEL_NAME = "site-presence-v1";

/**
 * Categorias normalizadas de página — nunca a URL completa/querystring
 * (ver lib/presence/page-type.ts).
 */
export type PageType = "HOME" | "NOVIDADES" | "CATEGORIA" | "PRODUTO" | "FAVORITOS" | "SELECAO" | "OUTROS";

/**
 * Único payload que o tracker público envia via `channel.track()`. Sem
 * nome, telefone, e-mail, IP, analytics session_id ou qualquer outro
 * dado pessoal — só a categoria de página, se a aba está visível, e o
 * timestamp da última atualização.
 */
export interface PresenceMeta {
  page_type: PageType;
  visible: boolean;
  updated_at: string;
}
