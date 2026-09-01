import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DIACRITICS_REGEX = /[̀-ͯ]/g;

/**
 * Gera um slug URL-friendly a partir de um texto livre (remove acentos,
 * baixa a caixa, troca espacos/simbolos por hifen). Usada para sugerir o
 * slug a partir do nome no cadastro; o valor final continua editavel.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Um campo opcional ausente do FormData (ex: um `<textarea>`/`<input>` que
 * o formulário nunca inclui, como nos modais de cadastro rápido)
 * `formData.get()` devolve `null` — mas `z.string().optional()` só aceita
 * `undefined`, nunca `null`, e falha com uma mensagem técnica do Zod
 * ("Invalid input: expected string, received null") em vez da mensagem
 * customizada do schema. Normaliza `null` e string vazia pra `undefined`
 * aqui, antes do Zod ver o valor, pros três significarem a mesma coisa:
 * "não informado".
 */
export function optionalFormValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const str = String(value).trim();
  return str === "" ? undefined : str;
}
