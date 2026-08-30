import type { Metadata } from "next";
import { getInstitutionalInfo, getPrivacyPolicyVersion } from "@/lib/site-settings/institutional";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como a Maria Flor coleta, usa e protege os seus dados.",
};

export const dynamic = "force-dynamic";

// Página intencionalmente sem link no rodapé nem no menu público — só é
// alcançada pelo texto de consentimento do formulário de Ofertas (onde o
// dado pessoal é de fato coletado). Continua existindo e indexável por
// quem tiver o link direto; só não faz parte da navegação principal.
export default async function PoliticaDePrivacidadePage() {
  const [info, version] = await Promise.all([getInstitutionalInfo(), getPrivacyPolicyVersion()]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl text-text sm:text-3xl">Política de Privacidade</h1>
      <p className="mt-1 text-xs text-text-muted">Versão {version}</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-text">
        <section>
          <h2 className="font-display text-lg text-text">Quais dados coletamos</h2>
          <p className="mt-2">
            Coletamos os dados que você mesma nos informa — como nome, WhatsApp e e-mail ao se
            cadastrar no nosso Grupo de Ofertas — e alguns dados de navegação anônimos, como
            páginas visitadas e produtos favoritados, para entender melhor o que você gosta.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg text-text">Para que usamos</h2>
          <p className="mt-2">
            Usamos seus dados para falar com você pelo WhatsApp ou e-mail sobre novidades,
            promoções e o andamento do seu atendimento, e para melhorar a experiência da nossa
            Vitrine Online. Só enviamos comunicações de marketing (novidades e promoções) para
            quem autoriza expressamente, marcando o campo de consentimento no formulário.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg text-text">Confirmação de WhatsApp e e-mail</h2>
          <p className="mt-2">
            Para garantir que o WhatsApp e o e-mail informados são realmente seus, enviamos um
            código de confirmação de 6 dígitos para cada um deles antes de concluir seu cadastro
            no Grupo de Ofertas. Esse código expira em poucos minutos e nunca é compartilhado com
            terceiros.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg text-text">WhatsApp e e-mail</h2>
          <p className="mt-2">
            Ao favoritar peças e enviar sua seleção, você escolhe conversar com uma das nossas
            vendedoras pelo WhatsApp — essa conversa acontece diretamente com ela, fora da nossa
            Vitrine. Se você se cadastrar no Grupo de Ofertas, podemos usar seu WhatsApp e e-mail
            para enviar novidades e promoções, sempre respeitando o consentimento dado.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg text-text">Analytics e cookies</h2>
          <p className="mt-2">
            Usamos um identificador anônimo de sessão (sem dado pessoal) para entender como as
            clientes navegam pela Vitrine — quais produtos são mais vistos, favoritados e
            perguntados — e assim melhorar nosso catálogo e atendimento. Não usamos cookies de
            rastreamento de terceiros hoje.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg text-text">Marketing e campanhas futuras</h2>
          <p className="mt-2">
            Se você autorizar, seus dados de contato podem futuramente ser usados em campanhas de
            marketing (por exemplo, anúncios direcionados a quem já é nossa cliente), sempre
            respeitando o seu consentimento e a legislação aplicável. Você pode revogar essa
            autorização a qualquer momento pelo contato abaixo.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg text-text">Seus direitos</h2>
          <p className="mt-2">
            Você pode pedir para ver, corrigir ou excluir seus dados a qualquer momento, falando
            diretamente com a gente pelo WhatsApp da loja
            {info.whatsapp ? "" : " (em breve disponível nesta página)"}.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg text-text">Proteção dos dados</h2>
          <p className="mt-2">
            Seus dados ficam armazenados em um banco de dados protegido, acessível apenas pela
            equipe da Maria Flor responsável pelo atendimento e pela gestão do catálogo.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg text-text">Contato</h2>
          <p className="mt-2">
            Dúvidas sobre esta política? Fale com a gente pelo WhatsApp da loja
            {info.legalName ? ` ou procure por ${info.legalName}` : ""}
            {info.cnpj ? ` (CNPJ ${info.cnpj})` : ""}.
          </p>
        </section>
      </div>
    </main>
  );
}
