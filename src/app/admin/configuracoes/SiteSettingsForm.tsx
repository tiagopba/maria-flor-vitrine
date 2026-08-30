"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { uploadImageDirect, validateImageFile } from "@/lib/images/upload-client";
import type { InstitutionalInfo, SocialLink } from "@/lib/site-settings/institutional";
import type { SiteSettingsFormState } from "./actions";

type SiteSettingsAction = (
  state: SiteSettingsFormState,
  formData: FormData,
) => Promise<SiteSettingsFormState>;

const initialState: SiteSettingsFormState = {};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4 sm:p-5">
      <h2 className="font-display text-lg text-text">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  error,
  rows = 3,
  maxLength,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  error?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-text">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Campo de link com botão "Testar link" ao lado — abre o valor
 * ATUALMENTE digitado (não precisa salvar antes pra conferir), numa aba
 * nova, sem passar pela validação de domínio esperado do save. Útil
 * porque os três campos de link (grupo, Maps, Waze) ficam parecidos entre
 * si e é fácil colar o errado no campo errado.
 */
function UrlFieldWithTest({
  label,
  name,
  defaultValue,
  error,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  error?: string;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleTest() {
    const value = inputRef.current?.value.trim();
    if (!value) return;
    window.open(value, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-text">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={name}
          name={name}
          placeholder={placeholder}
          defaultValue={defaultValue ?? ""}
          className="h-11 flex-1 rounded-lg border border-border bg-surface px-3.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
        <button
          type="button"
          onClick={handleTest}
          className="shrink-0 rounded-lg border border-border px-3 text-sm font-medium text-text-muted transition-colors hover:bg-muted hover:text-text"
        >
          Testar link
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Igual UrlFieldWithTest, mas pra e-mail: "Testar e-mail" abre o cliente
 * de e-mail padrão via mailto: com o valor atualmente digitado — nunca
 * envia nada sozinho, só confere se o endereço abre certo.
 */
function EmailFieldWithTest({
  label,
  name,
  description,
  defaultValue,
  error,
  placeholder,
}: {
  label: string;
  name: string;
  description?: string;
  defaultValue?: string | null;
  error?: string;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleTest() {
    const value = inputRef.current?.value.trim();
    if (!value) return;
    window.open(`mailto:${value}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-text">
        {label}
      </label>
      {description && <p className="-mt-0.5 text-xs text-text-muted">{description}</p>}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={name}
          name={name}
          type="email"
          placeholder={placeholder}
          defaultValue={defaultValue ?? ""}
          className="h-11 flex-1 rounded-lg border border-border bg-surface px-3.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
        <button
          type="button"
          onClick={handleTest}
          className="shrink-0 rounded-lg border border-border px-3 text-sm font-medium text-text-muted transition-colors hover:bg-muted hover:text-text"
        >
          Testar e-mail
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function SiteSettingsForm({
  action,
  defaultValues,
}: {
  action: SiteSettingsAction;
  defaultValues: InstitutionalInfo;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  const [facadePhotoUrl, setFacadePhotoUrl] = useState<string | null>(defaultValues.facadePhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(defaultValues.socialLinks);

  async function handleFacadeFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setUploadError(validationError);
      event.target.value = "";
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      // Direto do navegador pro Storage — nunca passa pela Vercel (limite
      // de 4.5MB por requisição em funções serverless).
      const { url } = await uploadImageDirect("institutional", file);
      setFacadePhotoUrl(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha no upload. Tente novamente.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  function updateSocialLink(index: number, patch: Partial<SocialLink>) {
    setSocialLinks((links) => links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  }

  function removeSocialLink(index: number) {
    setSocialLinks((links) => links.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="facadePhotoUrl" value={facadePhotoUrl ?? ""} />
      <input type="hidden" name="socialLinks" value={JSON.stringify(socialLinks.filter((l) => l.label && l.url))} />

      <Section title="Quem Somos" description="Conteúdo da página /quem-somos.">
        <Input
          id="quemSomosTitle"
          name="quemSomosTitle"
          label="Título"
          placeholder="Nossa história"
          defaultValue={defaultValues.quemSomosTitle ?? ""}
          error={errors.quemSomosTitle}
        />
        <Input
          id="quemSomosSubtitle"
          name="quemSomosSubtitle"
          label="Subtítulo (opcional)"
          defaultValue={defaultValues.quemSomosSubtitle ?? ""}
          error={errors.quemSomosSubtitle}
        />
        <TextAreaField
          label="Texto / história da Maria Flor"
          name="quemSomosText"
          defaultValue={defaultValues.quemSomosText}
          error={errors.quemSomosText}
          rows={6}
          maxLength={4000}
          placeholder="A Maria Flor nasceu com o propósito de..."
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Foto da fachada</label>

          {facadePhotoUrl && (
            <div className="relative mb-1 h-32 w-full max-w-xs overflow-hidden rounded-lg bg-muted">
              <Image src={facadePhotoUrl} alt="" fill className="object-cover" unoptimized />
            </div>
          )}

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={handleFacadeFileChange}
            disabled={uploading}
            className="text-sm text-text-muted file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text"
          />
          {facadePhotoUrl && (
            <button
              type="button"
              onClick={() => setFacadePhotoUrl(null)}
              className="self-start text-xs text-text-muted underline"
            >
              Remover foto
            </button>
          )}
          {uploading && <p className="text-xs text-text-muted">Enviando imagem...</p>}
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
        </div>

        <Input
          id="quemSomosCtaLabel"
          name="quemSomosCtaLabel"
          label='Texto do botão "Ver novidades"'
          placeholder="Ver novidades"
          defaultValue={defaultValues.quemSomosCtaLabel ?? ""}
          error={errors.quemSomosCtaLabel}
        />
      </Section>

      <Section title="Grupo de Ofertas" description="Conteúdo da página /ofertas.">
        <Input
          id="ofertasTitle"
          name="ofertasTitle"
          label="Título"
          placeholder="Entre para o Grupo de Ofertas da Maria Flor ❤️"
          defaultValue={defaultValues.ofertasTitle ?? ""}
          error={errors.ofertasTitle}
        />
        <TextAreaField
          label="Texto de apresentação"
          name="ofertasText"
          defaultValue={defaultValues.ofertasText}
          error={errors.ofertasText}
          rows={2}
          maxLength={300}
          placeholder="Cadastre seu e-mail e receba novidades, promoções e oportunidades especiais."
        />
        <UrlFieldWithTest
          name="offersGroupUrl"
          label="Link do grupo"
          placeholder="https://chat.whatsapp.com/..."
          defaultValue={defaultValues.offersGroupUrl}
          error={errors.offersGroupUrl}
        />
        <Input
          id="ofertasCtaLabel"
          name="ofertasCtaLabel"
          label="Texto do botão de cadastro"
          placeholder="Quero entrar"
          defaultValue={defaultValues.ofertasCtaLabel ?? ""}
          error={errors.ofertasCtaLabel}
        />

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            name="ofertasEnabled"
            defaultChecked={defaultValues.ofertasEnabled}
            className="h-4 w-4 rounded border-border"
          />
          Aceitar novos cadastros no Grupo de Ofertas
        </label>
        <p className="-mt-2 text-xs text-text-muted">
          Desmarcado, a página /ofertas mostra um aviso de cadastro pausado em vez do formulário —
          não desliga o link do grupo em si.
        </p>
      </Section>

      <Section title="Como Chegar" description="Conteúdo da página /como-chegar (e do rodapé).">
        <TextAreaField
          label="Endereço completo"
          name="address"
          defaultValue={defaultValues.address}
          error={errors.address}
          rows={2}
          maxLength={200}
          placeholder="Rua Exemplo, 123 — Centro"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            id="city"
            name="city"
            label="Cidade"
            defaultValue={defaultValues.city ?? ""}
            error={errors.city}
          />
          <Input
            id="state"
            name="state"
            label="UF"
            maxLength={2}
            defaultValue={defaultValues.state ?? ""}
            error={errors.state}
          />
        </div>
        <Input
          id="phone"
          name="phone"
          label="Telefone"
          placeholder="(67) 3000-0000"
          defaultValue={defaultValues.phone ?? ""}
          error={errors.phone}
        />
        <Input
          id="whatsapp"
          name="whatsapp"
          label="WhatsApp da loja"
          placeholder="(67) 99999-9999"
          defaultValue={defaultValues.whatsapp ?? ""}
          error={errors.whatsapp}
        />
        <Input
          id="hours"
          name="hours"
          label="Horário de atendimento"
          placeholder="Seg a sáb, 9h às 18h"
          defaultValue={defaultValues.hours ?? ""}
          error={errors.hours}
        />
        <UrlFieldWithTest
          name="googleMapsUrl"
          label="URL Google Maps"
          placeholder="https://maps.app.goo.gl/... ou https://www.google.com/maps/..."
          defaultValue={defaultValues.googleMapsUrl}
          error={errors.googleMapsUrl}
        />
        <UrlFieldWithTest
          name="wazeUrl"
          label="URL Waze"
          placeholder="https://ul.waze.com/... ou https://waze.com/..."
          defaultValue={defaultValues.wazeUrl}
          error={errors.wazeUrl}
        />
      </Section>

      <Section
        title="Contato e Privacidade"
        description="Separado do e-mail técnico que envia o código de confirmação (OTP) do Grupo de Ofertas — esse é infraestrutura do Supabase Auth, não contato de atendimento."
      >
        <EmailFieldWithTest
          name="publicContactEmail"
          label="E-mail de atendimento"
          description="E-mail que as clientes podem usar para falar com a Maria Flor."
          placeholder="contato@modamariaflor.com.br"
          defaultValue={defaultValues.publicContactEmail}
          error={errors.publicContactEmail}
        />
        <EmailFieldWithTest
          name="privacyContactEmail"
          label="E-mail para privacidade (opcional)"
          description="E-mail para solicitações relacionadas a dados pessoais e privacidade. Se ficar vazio, a Política de Privacidade usa o e-mail de atendimento."
          placeholder="privacidade@modamariaflor.com.br"
          defaultValue={defaultValues.privacyContactEmail}
          error={errors.privacyContactEmail}
        />
        <p className="text-xs text-text-muted">
          Telefone e WhatsApp da loja já são os campos da seção Como Chegar, acima.
        </p>
      </Section>

      <Section title="Redes sociais" description="Aparecem no rodapé, quando preenchidas.">
        <Input
          id="instagramUrl"
          name="instagramUrl"
          label="Instagram"
          placeholder="https://instagram.com/mariaflor"
          defaultValue={defaultValues.instagramUrl ?? ""}
          error={errors.instagramUrl}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text">Outros links</span>
          {socialLinks.map((link, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row">
              <input
                value={link.label}
                onChange={(e) => updateSocialLink(index, { label: e.target.value })}
                placeholder="Nome (ex: TikTok)"
                className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
              <input
                value={link.url}
                onChange={(e) => updateSocialLink(index, { url: e.target.value })}
                placeholder="https://..."
                className="h-10 flex-[2] rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => removeSocialLink(index)}
                className="shrink-0 self-start text-xs text-text-muted underline sm:self-center"
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSocialLinks((links) => [...links, { label: "", url: "" }])}
            className="self-start text-sm font-medium text-primary hover:underline"
          >
            + Adicionar link
          </button>
        </div>
      </Section>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <Button type="submit" disabled={pending || uploading} className="self-start">
        {pending ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
