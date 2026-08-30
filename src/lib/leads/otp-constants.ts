// Fica fora de email-otp.ts de propósito: um arquivo com "use server" só
// pode exportar funções async (Server Actions) — exportar uma constante
// puro ali quebra todos os outros exports do módulo silenciosamente no
// build. Fonte única do comprimento do código OTP de e-mail, usada tanto
// no servidor (validação) quanto no client (UI do input).
export const EMAIL_OTP_LENGTH = 8;
