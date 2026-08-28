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
