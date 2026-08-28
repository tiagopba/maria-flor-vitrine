import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface UploadImageInput {
  bucket: string;
  path: string;
  file: File;
}

export interface UploadedImage {
  path: string;
  publicUrl: string;
}

/**
 * Abstração de armazenamento de imagem. Hoje implementa Supabase Storage;
 * se migrarmos para Cloudinary/outro CDN no futuro, só este arquivo muda —
 * quem chama (rotas de upload) não precisa saber o provedor concreto.
 */
export async function uploadImage({ bucket, path, file }: UploadImageInput): Promise<UploadedImage> {
  const supabase = createAdminClient();

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });

  if (error) throw new Error(`Falha no upload da imagem: ${error.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return { path, publicUrl };
}

export async function deleteImage(bucket: string, path: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.storage.from(bucket).remove([path]);
}

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return "Formato inválido. Use JPG, PNG ou WEBP.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "Imagem muito grande. Máximo de 5MB.";
  }
  return null;
}
