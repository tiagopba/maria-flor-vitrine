/**
 * `<script type="application/ld+json">` — sempre montado no servidor a
 * partir de dados já validados (site_settings, produtos publicados), nunca
 * de input direto de usuário; ainda assim escapamos `<` pra nenhum valor de
 * texto (nome/descrição cadastrados no admin) conseguir fechar a tag
 * `<script>` prematuramente.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
