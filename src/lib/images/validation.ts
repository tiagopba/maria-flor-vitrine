/**
 * Regras de validação de imagem, puras e sem dependências de client/server —
 * seguras para importar tanto do navegador (upload direto ao Storage)
 * quanto do servidor. O bucket do Supabase Storage também aplica essas
 * mesmas regras (file_size_limit/allowed_mime_types nas migrations), como
 * backstop caso o client-side seja contornado.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const HEIC_EXTENSION_PATTERN = /\.(heic|heif)$/i;

/**
 * iPhones gravam em HEIC/HEIF por padrão. Nenhum navegador decodifica esse
 * formato via <canvas>/<img> para reconverter no cliente sem uma lib WASM
 * pesada — em vez de arriscar isso, bloqueamos com instrução clara. A
 * verificação usa MIME e extensão porque em vários fluxos de seleção de
 * arquivo no iOS o `file.type` chega vazio/genérico para HEIC.
 */
function isHeicFile(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || HEIC_EXTENSION_PATTERN.test(file.name);
}

export function validateImageFile(file: File): string | null {
  if (isHeicFile(file)) {
    return 'Foto em HEIC/HEIF não é aceita. No iPhone: Ajustes > Câmera > Formatos > "Mais Compatível" (grava em JPEG), ou escolha "Copiar Foto" ao anexar.';
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    return "Formato inválido. Use JPG, PNG ou WEBP.";
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "Imagem muito grande. Máximo de 5MB.";
  }
  return null;
}

export function imageExtensionFor(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}
