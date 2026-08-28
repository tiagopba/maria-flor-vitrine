import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware:
 * 1. mantém a sessão Supabase atualizada (refresh de cookies) em toda request;
 * 2. protege /admin: sem sessão válida, redireciona para /admin/login.
 *
 * A checagem de *papel* (admin/catalog_editor) acontece depois, em cada
 * página/rota administrativa — o middleware só garante que existe sessão.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const isLoginRoute = request.nextUrl.pathname.startsWith("/admin/login");

  if (!supabaseUrl || !supabaseAnonKey) {
    // Ambiente ainda não configurado (.env.local vazio): a vitrine pública
    // segue funcionando, mas /admin fica bloqueado (fail-closed) em vez de
    // deixar passar sem sessão.
    if (isAdminRoute && !isLoginRoute) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() pode lançar (ex: refresh token expirado/inválido) em vez de
  // só devolver user: null — sem esse try/catch, um cookie de sessão velho
  // no navegador derrubava a aplicação inteira (até as páginas públicas),
  // não só o /admin. Além disso, se não limparmos os cookies aqui, o mesmo
  // cookie inválido volta em toda request seguinte e derruba os Server
  // Components (ex: a Home, que nem chama getUser diretamente) porque o
  // supabase-js tenta usar/renovar essa sessão internamente ao montar
  // qualquer query .from(...).select(...).
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    console.error("[proxy] falha ao validar sessão:", error);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (signOutError) {
      console.error("[proxy] falha ao limpar sessão inválida:", signOutError);
    }
  }

  if (isAdminRoute && !isLoginRoute && !user) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoginRoute && user) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Roda em tudo, exceto assets estáticos, para manter a sessão sempre
     * atualizada, sem sobrecarregar arquivos de imagem/fonte/etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)",
  ],
};
