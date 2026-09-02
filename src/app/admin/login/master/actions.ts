"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MASTER_EMAIL } from "@/lib/auth/master";
import { EMAIL_OTP_LENGTH } from "@/lib/leads/otp-constants";

/**
 * Login passwordless da conta master — mesmo mecanismo de OTP de e-mail do
 * Supabase Auth já usado em lib/leads/email-otp.ts (código numérico,
 * expira sozinho, limite de reenvio embutido do próprio Supabase), mas
 * aqui o objetivo É deixar a sessão logada de verdade (por isso usa o
 * client de sessão/cookies — `@/lib/supabase/server` — e não o client
 * público usado no fluxo de leads, que nunca precisa persistir sessão).
 *
 * O e-mail nunca vem de input do usuário — é sempre `MASTER_EMAIL`
 * (lib/auth/master.ts). Isso é o que torna esta rota incapaz de logar
 * como qualquer outra conta, e o que impede alguém de "criar" uma master
 * nova por aqui: só existe UM e-mail que este fluxo sabe autenticar.
 *
 * `shouldCreateUser: true` faz o Supabase Auth criar o `auth.users` da
 * master automaticamente no primeiro pedido de código, se ainda não
 * existir — não precisa de nenhum passo manual de "criar a conta" no
 * dashboard do Supabase. Isso NÃO atribui a role master a ninguém (só cria
 * a identidade de autenticação); a role continua exigindo o passo manual
 * documentado em verifyMasterOtpAction abaixo.
 */
export type StartMasterOtpResult = { success: true } | { error: string };

export async function startMasterOtpAction(): Promise<StartMasterOtpResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: MASTER_EMAIL,
    options: { shouldCreateUser: true },
  });

  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { error: "Aguarde um instante antes de pedir um novo código." };
    }
    console.error("[startMasterOtpAction] falha ao enviar código:", error.message);
    return { error: "Não foi possível enviar o código agora. Tente novamente." };
  }

  return { success: true };
}

export type VerifyMasterOtpResult = { success: true } | { error: string };

/**
 * Confirma o código e, se a sessão for válida, checa se essa conta já tem
 * `profiles.role = 'master'`. Login sozinho NUNCA concede a role — ver o
 * comentário no topo do arquivo: atribuir master é sempre um passo manual
 * separado (rodado direto no banco pelo usuário, depois de decidir que
 * esta é mesmo a conta certa). Sem isso, a conta autentica normalmente
 * (Supabase Auth aceita o código), mas `requireAdmin`/`getCurrentAdmin`
 * tratam como "sem perfil" e barram o acesso ao Admin — nunca um acesso
 * indevido por engano.
 */
export async function verifyMasterOtpAction(code: string): Promise<VerifyMasterOtpResult> {
  const trimmedCode = code.trim();
  if (!new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`).test(trimmedCode)) {
    return { error: `Digite o código de ${EMAIL_OTP_LENGTH} dígitos que enviamos.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: MASTER_EMAIL,
    token: trimmedCode,
    type: "email",
  });

  if (error || !data.user) {
    return { error: "Código inválido ou expirado. Confira e tente de novo." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", data.user.id).maybeSingle();

  if (!profile) {
    return {
      error:
        "E-mail confirmado, mas esta conta ainda não tem a role master atribuída no banco. Peça para rodar a atribuição manual antes de continuar (ver documentação).",
    };
  }

  if (profile.role !== "master") {
    return { error: `E-mail confirmado, mas esta conta tem a role "${profile.role}", não master.` };
  }

  return { success: true };
}
