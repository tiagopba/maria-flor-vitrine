/**
 * Única conta que pode ter a role `master` — fixa em código, nunca
 * aceita como input do usuário em nenhum lugar (nem no formulário de
 * login por OTP, nem em qualquer outra tela). É assim que o sistema
 * "identifica com segurança qual conta deve receber a role": o e-mail é
 * hardcoded aqui, não escolhido por quem preenche um formulário — o fluxo
 * de OTP em app/admin/login/master só é capaz de autenticar ESTE e-mail,
 * nunca outro.
 *
 * `master@modamariaflor.com.br` é configurado como alias/encaminhamento
 * pra `cadastro@modamariaflor.com.br` no provedor de e-mail — isso é
 * responsabilidade externa (DNS/provedor), o código só precisa saber o
 * endereço que o Supabase Auth deve autenticar.
 */
export const MASTER_EMAIL = "master@modamariaflor.com.br";
