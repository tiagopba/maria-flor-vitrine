import { headers, cookies } from "next/headers";
import { sendCapiEvent } from "@/lib/analytics/meta-capi";

/**
 * TEMP — mecanismo de validação determinística e sanitizada da Meta
 * Conversions API. Só existe pra provar em runtime que a Meta recebe o
 * evento `Lead` server-side, sem depender de `console.log`/logs do Vercel
 * nem do painel "Testar eventos" da Meta (ambos se mostraram pouco
 * confiáveis nesta sessão). REMOVER ESTE ARQUIVO por completo depois da
 * validação — não é uma rota de produção.
 *
 * Bloqueada fora de Preview: `VERCEL_ENV` só é "preview" em deploys de
 * Preview da Vercel, nunca em produção nem em build local sem a Vercel —
 * então essa checagem não pode ser burlada por header/query da requisição.
 *
 * Nunca retorna: access token, IP, user-agent, `_fbp`/`_fbc`, ou qualquer
 * `user_data` — só os campos sanitizados da resposta da Meta e a
 * presença (boolean) do token.
 */
export async function POST() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response(null, { status: 404 });
  }

  const hasAccessToken = Boolean(process.env.META_CONVERSIONS_API_TOKEN);
  const hasPixelId = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  const hasTestEventCode = Boolean(process.env.META_TEST_EVENT_CODE);

  if (!hasAccessToken) {
    return Response.json({ ok: false, has_access_token: false, has_pixel_id: hasPixelId, has_test_event_code: hasTestEventCode }, { status: 200 });
  }

  const eventId = crypto.randomUUID();
  const [hdrs, cookieStore] = await Promise.all([headers(), cookies()]);

  const result = await sendCapiEvent({
    eventName: "Lead",
    eventId,
    eventSourceUrl: "https://preview-capi-test.internal/lead",
    userData: {
      clientIpAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim(),
      clientUserAgent: hdrs.get("user-agent") ?? undefined,
      fbp: cookieStore.get("_fbp")?.value,
      fbc: cookieStore.get("_fbc")?.value,
    },
    customData: {
      content_ids: ["TEST-CAPI-VALIDATION"],
      content_type: "product",
      value: 0,
      currency: "BRL",
      num_items: 1,
    },
  });

  if (!result) {
    return Response.json(
      {
        ok: false,
        reason: "sendCapiEvent retornou null (falha antes de obter resposta HTTP)",
        has_pixel_id: hasPixelId,
        has_access_token: hasAccessToken,
        has_test_event_code: hasTestEventCode,
      },
      { status: 502 }
    );
  }

  return Response.json({
    ok: true,
    has_pixel_id: hasPixelId,
    has_access_token: hasAccessToken,
    has_test_event_code: hasTestEventCode,
    ...result,
  });
}
