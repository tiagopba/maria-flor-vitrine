"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getPresenceId } from "@/lib/presence/presence-id";
import { normalizePageType } from "@/lib/presence/page-type";
import { PRESENCE_CHANNEL_NAME, type PresenceMeta } from "@/lib/presence/constants";

/**
 * Conecta 1x ao canal Presence `site-presence-v1` enquanto o layout
 * público estiver montado — nunca em /admin (esse layout vive fora do
 * grupo `(public)`, então este componente nem monta lá). Sem
 * INSERT/UPDATE no Postgres, sem heartbeat, sem polling: só
 * `channel.track()` no browser via WebSocket.
 *
 * O canal é criado uma única vez (efeito de montagem, deps `[]`);
 * navegação client-side (usePathname) só chama `track()` de novo no
 * MESMO canal com o `page_type` atualizado — nunca recria a conexão.
 * `visibilitychange` faz o mesmo pra alternar `visible` entre abas em
 * foreground/background, sem duplicar contagem por aba (ver
 * RealtimeVisitorsCard, que deduplica por presenceId no Admin).
 */
export function SitePresenceTracker() {
  const pathname = usePathname();
  const pageTypeRef = useRef(normalizePageType(pathname));
  const channelRef = useRef<RealtimeChannel | null>(null);
  const readyRef = useRef(false);
  const isFirstPathnameEffect = useRef(true);

  useEffect(() => {
    const supabase = createClient();
    const presenceId = getPresenceId();
    const channel = supabase.channel(PRESENCE_CHANNEL_NAME, {
      config: { presence: { key: presenceId } },
    });
    channelRef.current = channel;

    function trackNow() {
      const meta: PresenceMeta = {
        page_type: pageTypeRef.current,
        visible: document.visibilityState === "visible",
        updated_at: new Date().toISOString(),
      };
      channel.track(meta).catch(() => {});
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        readyRef.current = true;
        trackNow();
      }
    });

    function handleVisibilityChange() {
      if (!readyRef.current) return;
      trackNow();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      readyRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Best effort — se a aba fechar ou a conexão cair, o Supabase
      // remove a presença sozinho (timeout do WebSocket). Nunca depende
      // deste untrack pra funcionar corretamente.
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    pageTypeRef.current = normalizePageType(pathname);

    // A primeira execução (montagem) já é coberta pelo track() disparado
    // no callback de subscribe acima — chamar track() aqui de novo
    // correria antes do canal estar de fato inscrito.
    if (isFirstPathnameEffect.current) {
      isFirstPathnameEffect.current = false;
      return;
    }

    if (!readyRef.current || !channelRef.current) return;
    const meta: PresenceMeta = {
      page_type: pageTypeRef.current,
      visible: document.visibilityState === "visible",
      updated_at: new Date().toISOString(),
    };
    channelRef.current.track(meta).catch(() => {});
  }, [pathname]);

  return null;
}
