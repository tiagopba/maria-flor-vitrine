/**
 * IMPORTANTE: cada variável precisa ser lida como `process.env.NOME_LITERAL`
 * (nunca `process.env[variavel]`). O Next.js só consegue substituir
 * variáveis `NEXT_PUBLIC_*` pelo valor real dentro do bundle do navegador
 * quando a referência é estática/literal — acesso dinâmico por string
 * sempre resulta em `undefined` no client, mesmo com a env var configurada.
 */
function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Variável de ambiente ${name} não configurada. Copie .env.example para .env.local e preencha as chaves do Supabase.`
    );
  }
  return value;
}

export const supabaseUrl = () =>
  requireEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");

export const supabaseAnonKey = () =>
  requireEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabaseServiceRoleKey = () =>
  requireEnv(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");

/**
 * Checagem não-lançante, para telas que precisam se comportar bem antes do
 * projeto Supabase existir (ex: página de login não deve quebrar com um
 * erro genérico só porque .env.local ainda está vazio).
 */
export const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
