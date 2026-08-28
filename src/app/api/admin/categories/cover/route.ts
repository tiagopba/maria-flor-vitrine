import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/permissions";
import { uploadImage, validateImageFile } from "@/lib/images/provider";

export async function POST(request: Request) {
  // Route handler: nunca usar requireAdmin() aqui — ele faz redirect() de
  // página, o que quebraria um client fetch() esperando JSON. Checagem
  // manual, retornando 401/403 em JSON.
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!["admin", "catalog_editor"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  const validationError = validateImageFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `covers/${crypto.randomUUID()}.${extension}`;

  const { publicUrl } = await uploadImage({ bucket: "categories", path, file });

  return NextResponse.json({ url: publicUrl });
}
