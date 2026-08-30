import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : null));

const optionalUrl = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^https?:\/\//i.test(v), "Use um link começando com http:// ou https://.")
    .transform((v) => (v ? v : null));

/**
 * Mesma ideia de `optionalUrl`, mas além de "é uma URL" confere se começa
 * com um dos domínios esperados pra esse tipo de link — evita salvar um
 * link de grupo do WhatsApp ali onde deveria ir o link do Google Maps, por
 * exemplo (erro de copiar/colar comum, já que os três campos ficam perto
 * um do outro no formulário).
 */
const optionalUrlWithPrefix = (max: number, prefixes: string[], hint: string) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || prefixes.some((prefix) => v.toLowerCase().startsWith(prefix)), hint)
    .transform((v) => (v ? v : null));

const socialLinkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url(),
});

/**
 * Espelha `InstitutionalInfo` (lib/site-settings/institutional.ts) — o
 * formulário de /admin/configuracoes manda o objeto inteiro de uma vez.
 * Todo campo de texto é opcional (string vazia vira null); páginas
 * públicas já sabem degradar com elegância quando algo é null.
 */
export const siteSettingsSchema = z.object({
  city: optionalText(80),
  state: optionalText(2),
  address: optionalText(200),
  phone: optionalText(30),
  whatsapp: optionalText(30),
  instagramUrl: optionalUrl(200),
  socialLinks: z.array(socialLinkSchema).max(10),
  googleMapsUrl: optionalUrlWithPrefix(
    500,
    ["https://maps.app.goo.gl/", "https://www.google.com/maps/"],
    "Use um link do Google Maps (maps.app.goo.gl ou google.com/maps).",
  ),
  wazeUrl: optionalUrlWithPrefix(
    500,
    ["https://ul.waze.com/", "https://waze.com/"],
    "Use um link do Waze (ul.waze.com ou waze.com).",
  ),
  offersGroupUrl: optionalUrlWithPrefix(
    500,
    ["https://chat.whatsapp.com/"],
    "Use um link de convite do grupo do WhatsApp (chat.whatsapp.com).",
  ),
  facadePhotoUrl: optionalUrl(500),
  hours: optionalText(200),
  quemSomosTitle: optionalText(120),
  quemSomosSubtitle: optionalText(160),
  quemSomosText: optionalText(4000),
  quemSomosCtaLabel: optionalText(40),
  ofertasTitle: optionalText(120),
  ofertasText: optionalText(300),
  ofertasCtaLabel: optionalText(40),
  ofertasEnabled: z.boolean(),
});

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
