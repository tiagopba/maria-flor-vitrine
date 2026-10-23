/**
 * CEP brasileiro — só formato (8 dígitos, máscara 00000-000). A consulta
 * real (ViaCEP) fica em viacep.ts; aqui é só validação/máscara, usado pelo
 * campo de CEP do bloco de frete de /favoritos (SmartShippingBlock) e
 * revalidado de novo no servidor antes de entrar na mensagem de WhatsApp.
 */
const POSTAL_CODE_REGEX = /^\d{5}-\d{3}$/;

export function isValidPostalCode(value: string): boolean {
  return POSTAL_CODE_REGEX.test(value);
}

/** Aplica a máscara 00000-000 enquanto a cliente digita — ignora tudo que não for dígito, máximo 8. */
export function formatPostalCodeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}
