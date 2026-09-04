import "server-only";

/**
 * Meta Conversions API — módulo isolado, nunca importado por código client
 * (o `import "server-only"` acima quebra o build se isso acontecer por
 * engano). Roda sempre EM PARALELO ao Pixel do browser, nunca no lugar
 * dele — mesmo `event_name`/`event_id`/parâmetros de negócio, só entregue
 * por um segundo caminho (servidor) pra melhorar a taxa de correspondência
 * de eventos e resistir a bloqueadores/perda de cookie no browser.
 *
 * Fail-open por padrão: qualquer falha aqui (token ausente, rede, resposta
 * de erro da Meta) nunca deve subir como exceção pra quem chamou — só loga
 * no servidor. Quem chama decide o timing (idealmente via `after()`, depois
 * da resposta já ter sido enviada ao client) para nunca atrasar a ação real
 * da cliente.
 */

const DEFAULT_GRAPH_API_VERSION = "v21.0";

function getGraphApiVersion(): string {
  const configured = process.env.META_GRAPH_API_VERSION;
  return configured && configured.trim() ? configured.trim() : DEFAULT_GRAPH_API_VERSION;
}

export interface CapiUserData {
  /** Endereço IP da cliente (do cabeçalho da requisição) — nunca coletado à parte. */
  clientIpAddress?: string;
  /** User-Agent do navegador (do cabeçalho da requisição). */
  clientUserAgent?: string;
  /** Cookie `_fbp`, já setado pelo próprio Pixel — só repassado, nunca gerado aqui. */
  fbp?: string;
  /** Cookie `_fbc`, só existe quando a visita veio de um clique em anúncio (fbclid). */
  fbc?: string;
}

export interface SendCapiEventInput {
  eventName: string;
  /** Mesmo `event_id` usado na chamada `fbq(...)` do browser — é isso que permite a Meta deduplicar. */
  eventId: string;
  eventSourceUrl: string;
  actionSource?: string;
  userData: CapiUserData;
  /** Mesmos parâmetros de negócio já enviados no evento do browser (nunca PII). */
  customData?: Record<string, unknown>;
}

/**
 * Envia um evento à Conversions API. Nunca lança — qualquer problema (token/
 * Pixel ID ausentes, timeout, resposta de erro da Meta) só é logado no
 * servidor via `console.error`, nunca exposto ao client.
 */
export async function sendCapiEvent(input: SendCapiEventInput): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN;

  // Sem Pixel ID ou token configurados (dev local, Preview sem CAPI própria,
  // ou a loja simplesmente ainda não tem), a CAPI vira no-op — igual ao
  // comportamento já estabelecido do Pixel do browser.
  if (!pixelId || !accessToken) return;

  try {
    const testEventCode = process.env.META_TEST_EVENT_CODE;

    const payload = {
      data: [
        {
          event_name: input.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          event_source_url: input.eventSourceUrl,
          action_source: input.actionSource ?? "website",
          user_data: {
            client_ip_address: input.userData.clientIpAddress,
            client_user_agent: input.userData.clientUserAgent,
            fbp: input.userData.fbp,
            fbc: input.userData.fbc,
          },
          ...(input.customData ? { custom_data: input.customData } : {}),
        },
      ],
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
    };

    const url = `https://graph.facebook.com/${getGraphApiVersion()}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[meta-capi] evento "${input.eventName}" recusado pela Meta (HTTP ${response.status}):`, body);
    }
  } catch (error) {
    console.error(
      `[meta-capi] falha ao enviar evento "${input.eventName}":`,
      error instanceof Error ? error.message : error
    );
  }
}
