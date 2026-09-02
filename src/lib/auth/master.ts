/**
 * Única conta que pode ter a role `master` — fixa em código, nunca
 * aceita como input do usuário em nenhum lugar (nem no formulário de
 * login por OTP, nem em qualquer outra tela). É assim que o sistema
 * "identifica com segurança qual conta deve receber a role": o e-mail é
 * hardcoded aqui, não escolhido por quem preenche um formulário — o fluxo
 * de OTP em app/admin/login/master só é capaz de autenticar ESTE e-mail,
 * nunca outro.
 */
export const MASTER_EMAIL = "contato@modamariaflor.com.br";
