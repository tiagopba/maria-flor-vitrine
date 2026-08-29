"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useDrawerBehavior } from "@/components/ui/Drawer";

/**
 * Botão de menu (hamburger) + painel lateral com Início/Novidades/
 * categorias ativas/Favoritos — categorias vêm do banco (prop vinda do
 * Server Component do layout), nunca hardcoded.
 *
 * CAUSA REAL do bug visto num iPhone físico (menu "quebrado", só
 * "Favoritos" aparecendo, sem botão de fechar visível): este componente é
 * renderizado de dentro de `<SiteHeader>`, cujo `<header>` tem
 * `backdrop-blur-sm` (backdrop-filter). Qualquer ancestral com
 * filter/backdrop-filter/transform/will-change cria um novo containing
 * block para descendentes `position: fixed` — então o overlay/painel
 * "fixed inset-0" ficava restrito à caixa de 56px do header em vez do
 * viewport inteiro. Com altura de conteúdo maior que 56px, quase tudo
 * (título, ✕, categorias) era desenhado acima do topo real da tela — só a
 * última linha (Favoritos) sobrava dentro da faixa visível. Reproduzi
 * isso com `getBoundingClientRect()` no Chrome também (não é exclusivo do
 * Safari — só não apareceu nos meus testes anteriores porque eu conferia
 * a árvore de acessibilidade, que não reflete esse tipo de clipping
 * visual). Corrigido com um portal pra `document.body`: o overlay/painel
 * deixa de ser descendente do header, então nada nele afeta mais o
 * containing block de `fixed`.
 *
 * Painel sempre montado no DOM (visível/invisível via classe, nunca
 * `{open && ...}`): uma transição de entrada via `requestAnimationFrame`
 * dependia do navegador já ter pintado o estado "fechado" antes de
 * aplicar o "aberto" — nada garante esse timing (aba em segundo plano,
 * throttling), e uma falha silenciosa deixaria o menu preso invisível
 * mesmo com `open=true`. Manter o nó sempre no DOM e trocar a classe pelo
 * próprio `open` faz a transição funcionar com uma re-renderização comum,
 * sem depender de nenhum timing de frame.
 *
 * `mounted` (via useEffect) evita chamar `createPortal` durante o SSR,
 * onde `document` não existe. Tentei `typeof document !== "undefined"`
 * direto no render antes disso e caiu num erro real de hidratação (React
 * #418): no servidor `document` não existe (branch falso), mas na
 * primeira renderização do cliente — a própria hidratação — `document` já
 * existe, então o React via uma árvore diferente da que o servidor
 * mandou. `mounted` começa `false` nos dois lados e só vira `true` depois
 * do commit inicial (pós-hidratação), quando divergir do HTML do servidor
 * já é uma atualização normal, não mais um mismatch.
 */
export function CategoryMenuDrawer({ categories }: { categories: { name: string; slug: string }[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Padrão de portal seguro para SSR explicado no comentário do
    // componente acima — precisa ligar depois do commit inicial.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useDrawerBehavior(open, close);

  const panel = (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={open ? 0 : -1}
        onClick={close}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        role="dialog"
        aria-modal={open}
        aria-hidden={!open}
        aria-label="Menu"
        className="absolute top-0 right-0 flex h-[100vh] h-[100dvh] w-[min(88vw,380px)] flex-col bg-surface shadow-xl transition-transform duration-200 ease-out"
        style={{
          // Transform inline (não via utilitário do Tailwind) de propósito:
          // `translate-x-full`/`translate-x-0` do Tailwind v4 dependem de
          // `--tw-translate-y` já estar definida em algum lugar da cascata
          // pra a propriedade `translate` combinada não virar um valor
          // inválido — nesse painel (que vive num portal, fora da árvore
          // normal do app) essa variável nunca chegava a ser definida, e o
          // painel ficava sempre "aberto" mesmo com a classe de fechado
          // aplicada. `transform: translateX()` puro não tem essa
          // dependência.
          transform: open ? "translateX(0)" : "translateX(100%)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg text-text">Menu</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar menu"
            tabIndex={open ? 0 : -1}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-muted"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <Link
            href="/"
            onClick={close}
            tabIndex={open ? 0 : -1}
            className="block rounded-lg px-3 py-2.5 text-base font-semibold text-text hover:bg-muted"
          >
            Início
          </Link>
          <Link
            href="/novidades"
            onClick={close}
            tabIndex={open ? 0 : -1}
            className="block rounded-lg px-3 py-2.5 text-base font-semibold text-text hover:bg-muted"
          >
            Novidades
          </Link>

          {categories.length > 0 && (
            <>
              <p className="mt-3 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Categorias
              </p>
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/categoria/${category.slug}`}
                  onClick={close}
                  tabIndex={open ? 0 : -1}
                  className="block rounded-lg px-3 py-2 text-sm text-text hover:bg-muted"
                >
                  {category.name}
                </Link>
              ))}
            </>
          )}

          <Link
            href="/favoritos"
            onClick={close}
            tabIndex={open ? 0 : -1}
            className="mt-3 block rounded-lg px-3 py-2.5 text-base font-semibold text-text hover:bg-muted"
          >
            ❤️ Favoritos
          </Link>
        </nav>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menu"
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-muted"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
        </svg>
      </button>

      {mounted && createPortal(panel, document.body)}
    </>
  );
}
